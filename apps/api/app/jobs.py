"""One-worker bounded jobs, cooperative cancellation and temporary artifacts."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import hashlib
import json
import logging
from pathlib import Path
import shutil
import stat
import threading
import time
import uuid

from .interfaces import ProcessingOptions
from .retrieval.service import RetrievalError
from .schemas import ApiError, SequenceJob, SequenceManifest, SequenceRequest

LOG = logging.getLogger(__name__)
TERMINAL = {"ready", "failed", "cancelled", "expired"}
# Stop downloading once this many distinct, spectrally comparable epochs have
# arrived (or max_frames, if smaller). Processing still makes the final choice.
EARLY_STOP_EPOCHS = 4


def enough_comparable_epochs(request: SequenceRequest, target: int):
    """Build the retriever's early-stop test from processing's own rules.

    Uses the processor's target-wavelength lookup and grouping rule without
    changing them, so stopping early can only shorten the input list; it never
    changes how processing judges the files that did arrive.
    """
    from .processing.errors import ProcessingError
    from .processing.fits_reader import inspect_observation
    from .processing.spectral import select_compatible_frames

    inspected = {}

    def enough(observations) -> bool:
        for observation in observations:
            key = (observation.observation_id, observation.detector)
            if key in inspected:
                continue
            try:
                item = inspect_observation(observation, request.ra_deg, request.dec_deg)
            except ProcessingError:
                item = None
            if item is not None and (
                (request.wavelength_min_um is not None and item.wavelength_um < request.wavelength_min_um)
                or (request.wavelength_max_um is not None and item.wavelength_um > request.wavelength_max_um)
            ):
                item = None
            inspected[key] = item
        group = select_compatible_frames([item for item in inspected.values() if item is not None])
        return len({item.observation.observed_start_utc for item in group}) >= target

    return enough


class JobError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


@dataclass
class Record:
    job: SequenceJob
    request: SequenceRequest
    directory: Path
    created: float
    touched: float
    cancel: threading.Event = field(default_factory=threading.Event)
    manifest: SequenceManifest | None = None
    # Cancellation changes the public state immediately. The executor slot
    # remains occupied until the worker has actually acknowledged it.
    worker_finished: bool = False


class JobManager:
    def __init__(self, root: Path, *, ttl: float = 1800, limit: int = 8,
                 max_bytes: int = 1024 * 1024 * 1024, deadline: float = 240,
                 peak_bytes: int = 512 * 1024 * 1024,
                 retriever_factory=None, processor_factory=None, clock=time.monotonic):
        self.root, self.ttl, self.limit = root.resolve(), ttl, limit
        self.max_bytes, self.deadline, self.clock = max_bytes, deadline, clock
        # Reserve room for the 256 MiB retrieval cap plus the total bounded
        # output pixels, scientific/render artifacts and metadata. One worker means
        # this reservation is needed only for the job about to run.
        self.peak_bytes = peak_bytes
        self.root.mkdir(parents=True, exist_ok=True)
        self.records: dict[str, Record] = {}
        self.dedup: dict[str, str] = {}
        self.lock = threading.RLock()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="khonsu")
        self.retriever_factory, self.processor_factory = retriever_factory, processor_factory
        # Previous process state cannot be recovered from files alone.
        for path in self.root.glob("job-*"):
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path, ignore_errors=True)

    def close(self):
        with self.lock:
            for record in self.records.values():
                record.cancel.set()
        self.pool.shutdown(wait=False, cancel_futures=True)

    def _cleanup(self):
        now = self.clock()
        for record in self.records.values():
            if record.worker_finished and record.job.status in TERMINAL and now - record.touched > self.ttl:
                record.job.status = "expired"
                record.job.manifest_url = None
                record.manifest = None
                shutil.rmtree(record.directory, ignore_errors=True)
        self.dedup = {key: value for key, value in self.dedup.items()
                      if self.records[value].job.status not in {"failed", "cancelled", "expired"}}
        # Bound tombstone metadata as well as file data.
        expired = [key for key, value in self.records.items() if value.job.status == "expired"]
        for key in expired[:-64]:
            del self.records[key]

    def _cache_bytes(self):
        total = 0
        try:
            for path in self.root.rglob("*"):
                try:
                    info = path.stat(follow_symlinks=False)
                except FileNotFoundError:
                    # The worker may finish deleting its downloaded inputs
                    # between directory enumeration and this stat call.
                    continue
                if stat.S_ISREG(info.st_mode):
                    total += info.st_size
        except OSError as exc:
            raise JobError(507, "CACHE_UNAVAILABLE", "Temporary storage could not be inspected safely. Retry later.") from exc
        return total

    def submit(self, request: SequenceRequest) -> SequenceJob:
        key = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        with self.lock:
            self._cleanup()
            if key in self.dedup:
                return self.records[self.dedup[key]].job.model_copy(deep=True)
            active = sum(not record.worker_finished for record in self.records.values())
            if active >= self.limit:
                raise JobError(429, "QUEUE_FULL", "The processing queue is full. Retry after a running job finishes.")
            used = self._cache_bytes()
            if used > self.max_bytes:
                raise JobError(507, "CACHE_FULL", "Temporary storage is full. Wait for cached jobs to expire.")
            identity = "job-" + uuid.uuid4().hex
            directory = self.root / identity
            directory.mkdir()
            now = self.clock()
            record = Record(SequenceJob(sequence_id=identity, status="queued", progress=0,
                                       message="Waiting for the science worker"),
                            request, directory, now, now)
            self.records[identity] = record
            self.dedup[key] = identity
            self.pool.submit(self._run, record)
            return record.job.model_copy(deep=True)

    def _update(self, record, **values):
        with self.lock:
            if record.cancel.is_set() and values.get("status") in {"retrieving", "processing", "ready"}:
                raise InterruptedError()
            for key, value in values.items():
                setattr(record.job, key, value)
            record.touched = self.clock()

    def _run(self, record: Record):
        started = self.clock()
        def cancelled():
            return record.cancel.is_set() or self.clock() - started > self.deadline
        try:
            if cancelled():
                raise InterruptedError()
            with self.lock:
                self._cleanup()
                if self._cache_bytes() + self.peak_bytes > self.max_bytes:
                    raise JobError(507, "CACHE_FULL", "Temporary storage has insufficient room for another bounded science job. Wait for cached jobs to expire.")
            from .retrieval.service import IrsaRetriever
            from .processing.service import AstronomyProcessor
            retriever = (self.retriever_factory or IrsaRetriever)(cancelled=cancelled)
            processor = (self.processor_factory or AstronomyProcessor)()

            def on_download(done, total):
                self._update(record, progress=round(0.1 + 0.4 * done / max(total, 1), 3),
                             message=f"Downloaded {done} of {total} IRSA observations")

            if hasattr(retriever, "on_download"):
                retriever.on_download = on_download
            if hasattr(retriever, "enough_epochs") and isinstance(processor, AstronomyProcessor) and processor.available():
                retriever.enough_epochs = enough_comparable_epochs(
                    record.request, min(record.request.max_frames, EARLY_STOP_EPOCHS))
            self._update(record, status="retrieving", progress=0.1, message="Querying and downloading IRSA observations")
            inputs = record.directory / "inputs"
            inputs.mkdir()
            observations = asyncio.run(retriever.retrieve(record.request, inputs))
            if self._cache_bytes() > self.max_bytes:
                raise JobError(507, "CACHE_FULL", "Temporary storage reached its size limit. Wait for cached jobs to expire.")
            if cancelled():
                raise InterruptedError()
            if len(observations) < 2:
                raise JobError(422, "INSUFFICIENT_EPOCHS", "This query returned fewer than two usable observations. Try a wider field or another target.")
            self._update(record, status="processing", progress=0.55, message="Aligning sky coordinates, matching wavelengths and preparing frames")
            output = record.directory / "frames"
            output.mkdir()
            options = ProcessingOptions(sequence_id=record.job.sequence_id,
                                        ra_deg=record.request.ra_deg, dec_deg=record.request.dec_deg,
                                        fov_arcmin=record.request.fov_arcmin)
            manifest = processor.process(observations, options, output, cancelled=cancelled,
                                         wavelength_min_um=record.request.wavelength_min_um,
                                         wavelength_max_um=record.request.wavelength_max_um)
            if cancelled():
                raise InterruptedError()
            # Display filters apply to measured target wavelength, not just detector.
            frames = [frame for frame in manifest.frames
                      if (record.request.wavelength_min_um is None or frame.wavelength_um >= record.request.wavelength_min_um)
                      and (record.request.wavelength_max_um is None or frame.wavelength_um <= record.request.wavelength_max_um)]
            if len(frames) < 2:
                raise JobError(422, "INSUFFICIENT_SPECTRAL_OVERLAP", "Fewer than two comparable frames meet the selected wavelength range.")
            payload = {**manifest.model_dump(), "frames": frames}
            # Optional retriever report: cutouts the archive would not serve.
            skipped = list(getattr(retriever, "skipped_downloads", None) or [])
            if skipped:
                selected = getattr(retriever, "selected_count", len(observations) + len(skipped))
                payload["warnings"] = [*payload["warnings"], {
                    "code": "ARCHIVE_DOWNLOADS_SKIPPED",
                    "message": f"{len(skipped)} of {selected} selected IRSA cutouts were left out because the archive was busy or returned an unusable response. This sequence uses only the observations that downloaded.",
                }]
                payload["processing"] = {**payload["processing"], "archive_downloads_skipped": len(skipped)}
            # Optional retriever report: exposures never requested because
            # enough comparable epochs had already arrived.
            not_fetched = list(getattr(retriever, "not_fetched", None) or [])
            if not_fetched:
                selected = getattr(retriever, "selected_count", len(observations) + len(not_fetched))
                payload["warnings"] = [*payload["warnings"], {
                    "code": "ARCHIVE_SEARCH_STOPPED_EARLY",
                    "message": f"Downloading stopped after {selected - len(not_fetched)} of {selected} sampled IRSA observations because enough spectrally comparable epochs had arrived. The other {len(not_fetched)} were not fetched, so a full download could find more epochs.",
                }]
                payload["processing"] = {**payload["processing"], "archive_downloads_not_fetched": len(not_fetched)}
            busy = getattr(retriever, "busy_responses", None)
            if isinstance(busy, int):
                payload["processing"] = {**payload["processing"], "archive_busy_responses": busy}
            manifest = SequenceManifest.model_validate(payload)
            (record.directory / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
            if self._cache_bytes() > self.max_bytes:
                raise JobError(507, "CACHE_FULL", "Temporary storage reached its size limit. Wait for cached jobs to expire.")
            shutil.rmtree(inputs, ignore_errors=True)
            with self.lock:
                if cancelled():
                    raise InterruptedError()
                record.manifest = manifest
                self._update(record, status="ready", progress=1, message="Observation sequence ready",
                             manifest_url=f"/v1/sequences/{record.job.sequence_id}/manifest")
        except Exception as exc:
            if cancelled():
                timeout = not record.cancel.is_set()
                self._update(record, status="failed" if timeout else "cancelled", message="Processing time limit reached" if timeout else "Search cancelled",
                             error=ApiError(code="JOB_TIMEOUT" if timeout else "CANCELLED", message="The bounded processing time elapsed. Try fewer frames." if timeout else "Search cancelled by the user."))
            else:
                known = hasattr(exc, "code") and (hasattr(exc, "message") or str(exc))
                LOG.warning("Job %s failed: %s", record.job.sequence_id, type(exc).__name__)
                self._update(record, status="failed", message="The sequence could not be prepared",
                             error=ApiError(code=exc.code if known else "PROCESSING_FAILED",
                                            message=getattr(exc, "message", str(exc)) if known else "Processing failed. Try another region or fewer frames.",
                                            details=exc.details if isinstance(exc, RetrievalError) else []))
            shutil.rmtree(record.directory, ignore_errors=True)
        finally:
            with self.lock:
                record.worker_finished = True
                record.touched = self.clock()

    def get(self, identity: str) -> Record:
        with self.lock:
            self._cleanup()
            record = self.records.get(identity)
            if record is None or record.job.status == "expired":
                raise JobError(410, "JOB_EXPIRED", "This temporary job expired or the backend restarted. Repeat the saved query.")
            return record

    def status(self, identity: str) -> SequenceJob:
        with self.lock:
            return self.get(identity).job.model_copy(deep=True)

    def cancel(self, identity: str) -> SequenceJob:
        with self.lock:
            record = self.get(identity)
            if record.job.status not in TERMINAL:
                record.cancel.set()
                self._update(record, status="cancelled", message="Search cancelled")
            return record.job.model_copy(deep=True)

    def manifest(self, identity: str) -> SequenceManifest:
        with self.lock:
            record = self.get(identity)
            if record.job.status != "ready" or record.manifest is None:
                raise JobError(409, "NOT_READY", "The sequence is not ready. Check its job status.")
            return record.manifest.model_copy(deep=True)

    def asset(self, identity: str, filename: str) -> Path:
        manifest = self.manifest(identity)
        allowed = {frame.image_url.rsplit("/", 1)[-1] for frame in manifest.frames}
        allowed.update(frame.raster.url.rsplit("/", 1)[-1] for frame in manifest.frames if frame.raster)
        allowed.update(frame.gap_fill.url.rsplit("/", 1)[-1] for frame in manifest.frames if frame.gap_fill)
        allowed.update(frame.refinement.raster.url.rsplit("/", 1)[-1] for frame in manifest.frames if frame.refinement)
        if filename not in allowed or Path(filename).name != filename or not filename.endswith((".png", ".bin")):
            raise JobError(404, "ASSET_NOT_FOUND", "Frame not found.")
        path = self.get(identity).directory / "frames" / filename
        if not path.is_file():
            raise JobError(410, "ASSET_EXPIRED", "The frame expired. Repeat the saved query.")
        return path
