"""One-worker bounded jobs, cooperative cancellation and temporary artifacts."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import hashlib
import json
import logging
from pathlib import Path
import shutil
import threading
import time
import uuid

from .interfaces import ProcessingOptions
from .schemas import ApiError, SequenceJob, SequenceManifest, SequenceRequest

LOG = logging.getLogger(__name__)
TERMINAL = {"ready", "failed", "cancelled", "expired"}


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


class JobManager:
    def __init__(self, root: Path, *, ttl: float = 1800, limit: int = 8,
                 max_bytes: int = 512 * 1024 * 1024, deadline: float = 240,
                 retriever_factory=None, processor_factory=None, clock=time.monotonic):
        self.root, self.ttl, self.limit = root.resolve(), ttl, limit
        self.max_bytes, self.deadline, self.clock = max_bytes, deadline, clock
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
            if record.job.status in TERMINAL and now - record.touched > self.ttl:
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

    def submit(self, request: SequenceRequest) -> SequenceJob:
        key = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        with self.lock:
            self._cleanup()
            if key in self.dedup:
                return self.records[self.dedup[key]].job.model_copy(deep=True)
            active = sum(record.job.status not in TERMINAL for record in self.records.values())
            if active >= self.limit:
                raise JobError(429, "QUEUE_FULL", "The processing queue is full. Retry after a running job finishes.")
            used = sum(path.stat().st_size for path in self.root.rglob("*") if path.is_file())
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
            for key, value in values.items():
                setattr(record.job, key, value)
            record.touched = self.clock()

    def _run(self, record: Record):
        started = self.clock()
        def cancelled():
            return record.cancel.is_set() or self.clock() - started > self.deadline
        try:
            if cancelled():
                return
            from .retrieval.service import IrsaRetriever
            from .processing.service import AstronomyProcessor
            retriever = (self.retriever_factory or IrsaRetriever)(cancelled=cancelled)
            processor = (self.processor_factory or AstronomyProcessor)()
            self._update(record, status="retrieving", progress=0.1, message="Querying and downloading IRSA observations")
            inputs = record.directory / "inputs"
            inputs.mkdir()
            observations = asyncio.run(retriever.retrieve(record.request, inputs))
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
            manifest = SequenceManifest.model_validate({**manifest.model_dump(), "frames": frames})
            (record.directory / "manifest.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
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
                                            message=getattr(exc, "message", str(exc)) if known else "Processing failed. Try another region or fewer frames."))
            shutil.rmtree(record.directory, ignore_errors=True)

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
        if filename not in allowed or Path(filename).name != filename or not filename.endswith(".png"):
            raise JobError(404, "ASSET_NOT_FOUND", "Frame not found.")
        path = self.get(identity).directory / "frames" / filename
        if not path.is_file():
            raise JobError(410, "ASSET_EXPIRED", "The frame expired. Repeat the saved query.")
        return path
