"""Small FastAPI application. Live scientific processing is an explicit TODO."""

import json
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Path as ApiPath, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .paths import fixture_directory
from .schemas import (
    ApiError, HealthResponse, PresetTarget, SequenceJob,
    SequenceManifest, SequenceRequest,
)

VERSION = "0.1.0"
FIXTURES = fixture_directory(Path(__file__), os.environ.get("KHONSU_FIXTURE_DIR"))
SequencePath = Annotated[str, ApiPath(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]

app = FastAPI(
    title="Khonsu API",
    version=VERSION,
    description=(
        "Hackathon foundation for viewing SPHEREx observations over time. "
        "Live archive retrieval and scientific processing are not implemented. "
        "The explicitly labeled development demo contains synthetic graphics only."
    ),
)
origins = [
    value.strip()
    for value in os.environ.get(
        "KHONSU_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if value.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def error_response(status: int, code: str, message: str, details: list[str] | None = None):
    return JSONResponse(
        status_code=status,
        content=ApiError(code=code, message=message, details=details or []).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # Never echo request bodies, local paths or Pydantic's non-JSON error context.
    details = [
        f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
        for error in exc.errors()
    ]
    return error_response(422, "INVALID_REQUEST", "Request validation failed", details)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(version=VERSION)


@app.get("/v1/presets", response_model=list[PresetTarget], tags=["discovery"])
def presets() -> list[PresetTarget]:
    # Named challenge targets are provided now. Coordinates deliberately stay
    # unresolved until their catalog epoch and proper motion can be verified.
    targets = [
        ("barnards-star", "Barnard's Star", "nearby star"),
        ("epsilon-indi-b", "Epsilon Indi B", "brown dwarf pair"),
        ("wise-0855", "WISE 0855", "brown dwarf"),
        ("rw-aurigae", "RW Aurigae", "variable star"),
        ("r-draconis", "R Draconis", "variable star"),
    ]
    return [
        PresetTarget(
            preset_id=preset_id,
            label=label,
            object_type=object_type,
            coordinate_note=(
                "Named challenge target only. Verified coordinate epoch and "
                "proper-motion handling are pending the real-data milestone."
            ),
        )
        for preset_id, label, object_type in targets
    ]


NOT_IMPLEMENTED = {501: {"model": ApiError}, 422: {"model": ApiError}}


@app.post(
    "/v1/sequences", response_model=SequenceJob, responses=NOT_IMPLEMENTED,
    tags=["sequences"],
)
def create_sequence(request: SequenceRequest):
    return error_response(
        501, "LIVE_PROCESSING_NOT_IMPLEMENTED",
        "Live SPHEREx retrieval and scientific processing are not implemented yet.",
    )


@app.get(
    "/v1/sequences/{sequence_id}", response_model=SequenceJob,
    responses=NOT_IMPLEMENTED, tags=["sequences"],
)
def sequence_status(sequence_id: SequencePath):
    return error_response(
        501, "JOB_STATUS_NOT_IMPLEMENTED", "Live sequence jobs are not implemented yet."
    )


@app.get(
    "/v1/sequences/{sequence_id}/manifest", response_model=SequenceManifest,
    responses=NOT_IMPLEMENTED, tags=["sequences"],
)
def sequence_manifest(sequence_id: SequencePath):
    return error_response(
        501, "LIVE_MANIFEST_NOT_IMPLEMENTED",
        "Real-observation manifests are not available in this scaffold.",
    )


@app.get(
    "/v1/demo/manifest", response_model=SequenceManifest,
    responses={503: {"model": ApiError}}, tags=["synthetic development demo"],
)
def synthetic_manifest():
    """Opt-in development fixture, never a fallback for live observation errors."""
    try:
        payload = json.loads((FIXTURES / "synthetic" / "sequence-manifest.json").read_text())
        manifest = SequenceManifest.model_validate(payload)
        if manifest.data_mode != "synthetic":
            raise ValueError("Development fixture must be synthetic")
        return manifest
    except (OSError, ValueError):
        return error_response(
            503, "DEMO_FIXTURE_UNAVAILABLE", "The synthetic development fixture is unavailable."
        )


@app.get(
    "/v1/demo/frames/{filename}", response_class=FileResponse,
    responses={
        200: {"content": {"image/svg+xml": {"schema": {"type": "string", "format": "binary"}}}},
        404: {"model": ApiError},
        422: {"model": ApiError},
    },
    tags=["synthetic development demo"],
)
def synthetic_frame(filename: str):
    # Exact allowlist avoids path traversal and serving arbitrary local files.
    if filename not in {"frame-01.svg", "frame-02.svg", "frame-03.svg"}:
        return error_response(404, "ASSET_NOT_FOUND", "Synthetic frame was not found.")
    path = FIXTURES / "synthetic" / filename
    if not path.is_file():
        return error_response(404, "ASSET_NOT_FOUND", "Synthetic frame was not found.")
    return FileResponse(path, media_type="image/svg+xml")
