"""Bounded SPHEREx discovery API with explicit data modes."""
import importlib.util
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
import tempfile
import threading
from typing import Annotated

from fastapi import FastAPI, Path as ApiPath, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .jobs import JobManager, JobError
from .paths import fixture_directory
from .schemas import ApiError, HealthResponse, PresetTarget, SequenceJob, SequenceManifest, SequenceRequest

VERSION = "1.0.0"
FIXTURES = fixture_directory(Path(__file__), os.environ.get("KHONSU_FIXTURE_DIR"))
SequencePath = Annotated[str, ApiPath(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]
manager: JobManager | None = None
manager_lock = threading.Lock()


def get_manager():
    global manager
    with manager_lock:
        if manager is None:
            manager = JobManager(
                Path(os.environ.get("KHONSU_CACHE_DIR", str(Path(tempfile.gettempdir()) / "khonsu-jobs"))),
                ttl=max(60, int(os.environ.get("KHONSU_JOB_TTL_SECONDS", "1800"))),
                limit=max(1, min(8, int(os.environ.get("KHONSU_QUEUE_LIMIT", "8")))),
            )
    return manager


@asynccontextmanager
async def lifespan(app):
    yield
    global manager
    if manager is not None:
        manager.close()
        manager = None


app = FastAPI(title="Khonsu API", version=VERSION, lifespan=lifespan,
              description="Explore genuine IRSA SPHEREx observations through bounded retrieval and scientific processing. Synthetic development imagery is opt-in.")
origins = [value.strip() for value in os.environ.get(
    "KHONSU_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if value.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


def error_response(status, code, message, details=None):
    return JSONResponse(status_code=status, content=ApiError(
        code=code, message=message, details=details or []).model_dump())


@app.exception_handler(JobError)
async def job_error_handler(request, exc):
    return error_response(exc.status, exc.code, exc.message)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    details = [f"{'.'.join(str(part) for part in e['loc'])}: {e['msg']}" for e in exc.errors()]
    return error_response(422, "INVALID_REQUEST", "Request validation failed", details)


def science_available():
    return all(importlib.util.find_spec(name) is not None for name in ("astropy", "numpy", "reproject", "PIL"))


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health():
    return HealthResponse(version=VERSION, live_processing_available=science_available())


@app.get("/v1/presets", response_model=list[PresetTarget], tags=["discovery"])
def presets():
    from .retrieval.presets import PRESETS
    return [PresetTarget(preset_id=identity, **{key: entry[key] for key in
            ("label", "object_type", "ra_deg", "dec_deg", "coordinate_frame", "coordinate_note")})
            for identity, entry in PRESETS.items()]


ERRORS = {422: {"model": ApiError}, 410: {"model": ApiError}, 409: {"model": ApiError},
          429: {"model": ApiError}, 503: {"model": ApiError}, 507: {"model": ApiError}}


@app.post("/v1/sequences", response_model=SequenceJob, status_code=202, responses=ERRORS, tags=["sequences"])
def create_sequence(request: SequenceRequest):
    if not science_available():
        raise JobError(503, "SCIENCE_UNAVAILABLE", "Install the scientific dependencies or build the API image with INSTALL_SCIENCE=true.")
    return get_manager().submit(request)


@app.get("/v1/sequences/{sequence_id}", response_model=SequenceJob, responses=ERRORS, tags=["sequences"])
def sequence_status(sequence_id: SequencePath):
    return get_manager().status(sequence_id)


@app.post("/v1/sequences/{sequence_id}/cancel", response_model=SequenceJob, responses=ERRORS, tags=["sequences"])
def cancel_sequence(sequence_id: SequencePath):
    return get_manager().cancel(sequence_id)


@app.get("/v1/sequences/{sequence_id}/manifest", response_model=SequenceManifest, responses=ERRORS, tags=["sequences"])
def sequence_manifest(sequence_id: SequencePath):
    return get_manager().manifest(sequence_id)


@app.get("/v1/sequences/{sequence_id}/frames/{filename}", response_class=FileResponse,
         responses={404: {"model": ApiError}, **ERRORS}, tags=["sequences"])
def sequence_frame(sequence_id: SequencePath, filename: str):
    return FileResponse(get_manager().asset(sequence_id, filename), media_type="image/png" if filename.endswith(".png") else "application/octet-stream")


def real_examples():
    from .examples import load_examples
    return load_examples(FIXTURES)


def cached_example_failure():
    return error_response(503, "CACHED_EXAMPLE_UNAVAILABLE",
                          "A bundled cached observation example is missing or corrupt. Restore the reviewed bundle; no substitute data was loaded.")


@app.get("/v1/examples", response_model=list[SequenceManifest], responses={503: {"model": ApiError}}, tags=["discovery"])
def examples():
    from .examples import CachedExampleError
    try:
        return real_examples()
    except CachedExampleError:
        return cached_example_failure()


@app.get("/v1/examples/{example_id}/frames/{filename}", response_class=FileResponse,
         responses={404: {"model": ApiError}, 422: {"model": ApiError}, 503: {"model": ApiError}}, tags=["discovery"])
def example_frame(example_id: SequencePath, filename: str):
    from .examples import CachedExampleError
    try:
        available = real_examples()
    except CachedExampleError:
        return cached_example_failure()
    for manifest in available:
        allowed = {Path(f.image_url).name for f in manifest.frames}
        allowed.update(Path(f.raster.url).name for f in manifest.frames if f.raster)
        allowed.update(Path(f.gap_fill.url).name for f in manifest.frames if f.gap_fill)
        if manifest.sequence_id == example_id and filename in allowed:
            if Path(filename).name == filename and filename.endswith((".png", ".bin")):
                return FileResponse(FIXTURES / "real" / example_id / filename, media_type="image/png" if filename.endswith(".png") else "application/octet-stream")
    return error_response(404, "EXAMPLE_NOT_FOUND", "A verified cached example is not available.")


@app.get("/v1/demo/manifest", response_model=SequenceManifest, responses={503: {"model": ApiError}},
         tags=["synthetic development demo"])
def synthetic_manifest():
    try:
        manifest = SequenceManifest.model_validate_json((FIXTURES / "synthetic" / "sequence-manifest.json").read_text())
        if manifest.data_mode != "synthetic":
            raise ValueError("Development fixture must be synthetic")
        return manifest
    except (OSError, ValueError):
        return error_response(503, "DEMO_FIXTURE_UNAVAILABLE", "The synthetic development fixture is unavailable.")


@app.get("/v1/demo/frames/{filename}", response_class=FileResponse,
         responses={404: {"model": ApiError}, 422: {"model": ApiError}},
         tags=["synthetic development demo"])
def synthetic_frame(filename: str):
    if filename not in {"frame-01.svg", "frame-02.svg", "frame-03.svg"}:
        return error_response(404, "ASSET_NOT_FOUND", "Synthetic frame was not found.")
    path = FIXTURES / "synthetic" / filename
    if not path.is_file():
        return error_response(404, "ASSET_NOT_FOUND", "Synthetic frame was not found.")
    return FileResponse(path, media_type="image/svg+xml")

