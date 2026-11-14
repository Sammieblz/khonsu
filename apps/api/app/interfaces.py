"""Internal handoff between retrieval (Tyrone) and processing (Samuel).

No FastAPI, NumPy, Astropy or network dependency is imported here. Retrieval
hands local files to processing. Processing never downloads observations.
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from .schemas import SequenceManifest, SequenceRequest


@dataclass(frozen=True)
class ObservationInput:
    fits_path: Path
    observation_id: str
    observed_start_utc: datetime
    observed_end_utc: datetime
    detector: int
    release: Literal["DR1", "QR3"]
    source_fits_url: str


@dataclass(frozen=True)
class ProcessingOptions:
    sequence_id: str
    ra_deg: float
    dec_deg: float
    fov_arcmin: float
    coordinate_frame: Literal["ICRS"] = "ICRS"
    # None sizes the square grid from the inputs' native pixel scale
    # (processing.alignment.auto_grid_size). An integer forces that width.
    output_size_px: int | None = None


class ObservationRetriever(Protocol):
    async def retrieve(
        self, request: "SequenceRequest", download_dir: Path
    ) -> list[ObservationInput]: ...


class SequenceProcessor(Protocol):
    def process(
        self,
        observations: list[ObservationInput],
        options: ProcessingOptions,
        output_dir: Path,
    ) -> "SequenceManifest": ...
