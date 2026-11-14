"""Bounded IRSA SIA2 discovery and SPHEREx FITS cutout retrieval.

The official IRSA SIA guide documents CSV, TIME in MJD and BAND in metres.
Network access stays here. Processing receives local FITS files only.
"""

from __future__ import annotations

import asyncio
import csv
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import io
import math
from pathlib import Path
import re
import threading
import time
from typing import TYPE_CHECKING, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from ..interfaces import ObservationInput

if TYPE_CHECKING:
    from ..schemas import SequenceRequest

SIA_ENDPOINT = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
MJD_ZERO = datetime(1858, 11, 17, tzinfo=timezone.utc)
MAX_METADATA_ROWS = 5000
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_FITS_BYTES = 48 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024
# IRSA answers "503 Server busy, retry later" under load. Retry transient
# failures with capped exponential backoff (1, 2, 4, 8 s), honour a bounded
# Retry-After, and never wait past the retrieval deadline.
MAX_ATTEMPTS = 5
# A single cutout can stay busy for minutes. Give each FITS file fewer
# attempts, then skip it so one product cannot exhaust the job deadline.
FITS_ATTEMPTS = 3
SKIPPABLE_DOWNLOAD_ERRORS = frozenset({"archive_busy", "archive_unavailable", "invalid_fits", "empty_archive_response"})
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 8.0
RETRY_AFTER_MAX_SECONDS = 15.0
RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})
BUSY_STATUS = frozenset({429, 503})
_FITS_PATH = re.compile(r"^/ibe/data/spherex/(dr1|qr3)/level2/[A-Za-z0-9_./-]+\.fits$")
_DETECTOR = re.compile(r"^SPHEREx-D([1-6])$", re.IGNORECASE)


class RetrievalError(RuntimeError):
    """Actionable error suitable for an API job result."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ObservationMetadata:
    observation_id: str
    observed_start_utc: datetime
    observed_end_utc: datetime
    detector: int
    release: str
    source_fits_url: str


def validate_irsa_url(url: str, *, metadata: bool = False) -> str:
    """Reject credentials, other hosts, traversal and arbitrary IRSA paths."""
    try:
        parts = urlsplit(url)
        valid_port = parts.port in (None, 443)
    except ValueError as exc:
        raise RetrievalError("unsafe_source_url", "IRSA supplied an invalid source URL.") from exc
    valid_path = parts.path == "/SIA" if metadata else bool(_FITS_PATH.fullmatch(parts.path))
    if (parts.scheme != "https" or parts.hostname != "irsa.ipac.caltech.edu"
        or not valid_port or parts.username or parts.password or parts.fragment
        or not valid_path or ".." in parts.path.split("/")):
        raise RetrievalError("unsafe_source_url", "Only approved IRSA HTTPS science URLs are allowed.")
    return url


class _IrsaRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_irsa_url(newurl, metadata=urlsplit(req.full_url).path == "/SIA")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _mjd(value: datetime) -> float:
    return (value.astimezone(timezone.utc) - MJD_ZERO).total_seconds() / 86400


def _datetime_mjd(value: str) -> datetime:
    number = float(value)
    if not math.isfinite(number) or not 0 <= number <= 100000:
        raise ValueError("Invalid observation time")
    return MJD_ZERO + timedelta(days=number)


def query_url(request: SequenceRequest) -> str:
    # Search for detectors covering the centre; request a full-width square
    # cutout afterwards. Partial edges are masked by scientific processing.
    for value in (request.ra_deg, request.dec_deg, request.fov_arcmin):
        if not math.isfinite(value):
            raise RetrievalError("invalid_target", "Coordinates and field size must be finite.")
    if not 0 <= request.ra_deg < 360 or not -90 <= request.dec_deg <= 90 or not .5 <= request.fov_arcmin <= 60:
        raise RetrievalError("invalid_target", "Coordinates or field size are outside supported bounds.")
    if not 2 <= request.max_frames <= 96:
        raise RetrievalError("invalid_target", "Request between 2 and 96 frames.")
    params = [
        ("POS", f"CIRCLE {request.ra_deg:.10f} {request.dec_deg:.10f} {1/3600:.10f}"),
        ("DPTYPE", "image"), ("CALIB", "2"),
        ("RESPONSEFORMAT", "CSV"), ("MAXREC", str(MAX_METADATA_ROWS + 1)),
        *(("COLLECTION", collection) for collection in COLLECTIONS),
    ]
    if request.start_utc is not None or request.end_utc is not None:
        lo = str(_mjd(request.start_utc)) if request.start_utc is not None else "-Inf"
        hi = str(_mjd(request.end_utc)) if request.end_utc is not None else "+Inf"
        params.append(("TIME", f"{lo} {hi}"))
    if request.wavelength_min_um is not None or request.wavelength_max_um is not None:
        lo = (request.wavelength_min_um or .75) * 1e-6
        hi = (request.wavelength_max_um or 5.) * 1e-6
        params.append(("BAND", f"{lo:.12g} {hi:.12g}"))
    return SIA_ENDPOINT + "?" + urlencode(params)


def parse_metadata(payload: bytes, request: SequenceRequest) -> list[ObservationMetadata]:
    try:
        reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig")))
        required = {"obs_id", "t_min", "t_max", "energy_bandpassname", "access_url"}
        if reader.fieldnames is None or not required <= set(reader.fieldnames):
            raise RetrievalError("invalid_archive_response", "IRSA returned unexpected metadata columns.")
        results = {}
        row_count = 0
        for row in reader:
            row_count += 1
            if row_count > MAX_METADATA_ROWS:
                raise RetrievalError("too_many_observations", "Narrow the date range before searching this crowded field.")
            match = _DETECTOR.fullmatch(row["energy_bandpassname"].strip())
            if match is None:
                continue
            detector = int(match.group(1))
            if request.detector is not None and detector != request.detector:
                continue
            url = validate_irsa_url(row["access_url"].strip())
            release = _FITS_PATH.fullmatch(urlsplit(url).path).group(1).upper()
            start, end = _datetime_mjd(row["t_min"]), _datetime_mjd(row["t_max"])
            if start > end:
                raise ValueError("Observation end precedes start")
            if request.start_utc is not None and end < request.start_utc:
                continue
            if request.end_utc is not None and start > request.end_utc:
                continue
            observation_id = row["obs_id"].strip()
            if not observation_id or len(observation_id) > 160:
                raise ValueError("Invalid observation ID")
            item = ObservationMetadata(observation_id, start, end, detector, release, url)
            results[(release, observation_id, detector)] = item
        return sorted(results.values(), key=lambda item: (item.observed_start_utc, item.observation_id))
    except RetrievalError:
        raise
    except (ValueError, TypeError, KeyError, UnicodeError, csv.Error, OverflowError, AttributeError) as exc:
        raise RetrievalError("invalid_archive_response", "IRSA metadata could not be interpreted safely.") from exc


def select_observations(rows: list[ObservationMetadata], max_frames: int) -> list[ObservationMetadata]:
    """Use one detector and sample real exposures across the available span.

    Per-pixel wavelength matching remains the processor's responsibility.
    """
    if not rows:
        return []
    counts = Counter(item.detector for item in rows)
    detector = min(counts, key=lambda value: (-counts[value], value))
    rows = [item for item in rows if item.detector == detector]
    if len(rows) <= max_frames:
        return rows
    indices = [round(index * (len(rows) - 1) / (max_frames - 1)) for index in range(max_frames)]
    return [rows[index] for index in indices]


def cutout_url(source_url: str, request: SequenceRequest) -> str:
    validate_irsa_url(source_url)
    parts = urlsplit(source_url)
    params = {"center": f"{request.ra_deg:.10f},{request.dec_deg:.10f}", "size": f"{request.fov_arcmin/60:.10f}"}
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(params), ""))


class IrsaRetriever:
    def __init__(self, *, cancel_event: threading.Event | None = None, cancelled: Callable[[], bool] | None = None, timeout_seconds: float = 30, deadline_seconds: float = 240):
        self.cancel_event = cancel_event or threading.Event()
        self.cancelled = cancelled or (lambda: False)
        self.timeout_seconds = min(max(timeout_seconds, 1), 60)
        self.deadline_seconds = min(max(deadline_seconds, 1), 600)
        self._opener = build_opener(_IrsaRedirects())
        self._deadline = 0.0

    def cancel(self) -> None:
        self.cancel_event.set()

    def _check(self) -> None:
        if self.cancel_event.is_set() or self.cancelled():
            raise RetrievalError("cancelled", "The archive request was cancelled.")
        if time.monotonic() >= self._deadline:
            raise RetrievalError("archive_timeout", "Archive retrieval exceeded its time budget. Try fewer frames.")

    def _pause(self, seconds: float) -> None:
        """Wait between attempts while staying responsive to cancellation."""
        end = time.monotonic() + seconds
        while True:
            self._check()
            remaining = end - time.monotonic()
            if remaining <= 0:
                return
            self.cancel_event.wait(min(.25, remaining))

    @staticmethod
    def _retry_delay(attempt: int, exc: Exception) -> float:
        delay = min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** attempt)
        headers = getattr(exc, "headers", None) if isinstance(exc, HTTPError) else None
        value = headers.get("Retry-After") if headers is not None else None
        if value:
            try:
                requested = float(value)
            except ValueError:
                try:
                    requested = (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()
                except (TypeError, ValueError, OverflowError):
                    requested = 0.0
            if math.isfinite(requested):
                delay = max(delay, min(requested, RETRY_AFTER_MAX_SECONDS))
        return delay

    def _read(self, url: str, limit: int, destination: Path | None = None, attempts: int = MAX_ATTEMPTS) -> bytes | int:
        validate_irsa_url(url, metadata=destination is None)
        attempts = min(max(attempts, 1), MAX_ATTEMPTS)
        for attempt in range(attempts):
            self._check()
            try:
                req = Request(url, headers={"User-Agent": "Khonsu/0.1 (NASA Space Apps science prototype)", "Accept": "text/csv" if destination is None else "application/fits"})
                with self._opener.open(req, timeout=min(self.timeout_seconds, max(1, self._deadline-time.monotonic()))) as response:
                    validate_irsa_url(response.geturl(), metadata=destination is None)
                    length = response.headers.get("Content-Length")
                    if length and int(length) > limit:
                        raise RetrievalError("archive_size_limit", "The archive response exceeded the download size limit. Reduce the field size.")
                    data = bytearray()
                    total = 0
                    handle = destination.open("wb") if destination else None
                    try:
                        while True:
                            self._check()
                            block = response.read(65536)
                            if not block:
                                break
                            if total == 0 and destination is not None and not block.startswith(b"SIMPLE  ="):
                                raise RetrievalError("invalid_fits", "The archive returned a non-FITS response for a science cutout.")
                            total += len(block)
                            if total > limit:
                                raise RetrievalError("archive_size_limit", "The archive response exceeded the download size limit. Reduce the field size.")
                            if handle:
                                handle.write(block)
                            else:
                                data.extend(block)
                    finally:
                        if handle:
                            handle.close()
                    if total == 0:
                        raise RetrievalError("empty_archive_response", "The archive returned an empty response.")
                    return total if destination else bytes(data)
            except RetrievalError:
                if destination:
                    destination.unlink(missing_ok=True)
                raise
            except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
                if destination:
                    destination.unlink(missing_ok=True)
                retryable = not isinstance(exc, HTTPError) or exc.code in RETRYABLE_STATUS
                delay = self._retry_delay(attempt, exc)
                if (attempt == attempts - 1 or not retryable
                        or time.monotonic() + delay >= self._deadline):
                    if isinstance(exc, HTTPError) and exc.code in BUSY_STATUS:
                        raise RetrievalError("archive_busy", "The IRSA archive is busy and asked clients to retry later. Wait a minute, then retry the search or request fewer frames.") from exc
                    raise RetrievalError("archive_unavailable", "IRSA could not complete the request. Retry later or narrow the query.") from exc
                self._pause(delay)
        raise AssertionError("unreachable")

    def _search(self, request: SequenceRequest) -> list[ObservationMetadata]:
        return parse_metadata(self._read(query_url(request), MAX_METADATA_BYTES), request)

    async def search(self, request: SequenceRequest) -> list[ObservationMetadata]:
        self._deadline = time.monotonic() + self.deadline_seconds
        try:
            return await asyncio.to_thread(self._search, request)
        except asyncio.CancelledError:
            self.cancel()
            raise

    def _retrieve(self, request: SequenceRequest, download_dir: Path) -> list[ObservationInput]:
        rows = select_observations(self._search(request), request.max_frames)
        download_dir.mkdir(parents=True, exist_ok=True)
        results = []
        total = 0
        # Read by the job manager so a shorter sequence is disclosed, never
        # presented as the full selection.
        self.selected_count = len(rows)
        self.skipped_downloads: list[str] = []
        last_error: RetrievalError | None = None
        for row in rows:
            self._check()
            url = cutout_url(row.source_fits_url, request)
            name = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24] + ".fits"
            path = download_dir / name
            partial = path.with_suffix(".fits.part")
            try:
                size = self._read(url, min(MAX_FITS_BYTES, MAX_TOTAL_BYTES-total), partial, attempts=FITS_ATTEMPTS)
            except RetrievalError as exc:
                if exc.code not in SKIPPABLE_DOWNLOAD_ERRORS:
                    raise
                self.skipped_downloads.append(row.observation_id)
                last_error = exc
                continue
            total += size
            partial.replace(path)
            results.append(ObservationInput(path, row.observation_id, row.observed_start_utc, row.observed_end_utc, row.detector, row.release, url))
        if last_error is not None and len(results) < 2:
            # Report the archive problem rather than a misleading epoch count.
            raise last_error
        return results

    async def retrieve(self, request: SequenceRequest, download_dir: Path) -> list[ObservationInput]:
        self._deadline = time.monotonic() + self.deadline_seconds
        try:
            return await asyncio.to_thread(self._retrieve, request, download_dir)
        except asyncio.CancelledError:
            self.cancel()
            raise
