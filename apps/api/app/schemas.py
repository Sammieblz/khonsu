"""Public API models. Tyrone owns changes to this cross-team contract.

Scientific array and filesystem objects belong in service interfaces, not JSON.
"""

from datetime import datetime, timezone
import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


RaDegrees = Annotated[float, Field(ge=0, lt=360)]
DecDegrees = Annotated[float, Field(ge=-90, le=90)]
Detector = Annotated[int, Field(ge=1, le=6)]
Wavelength = Annotated[float, Field(ge=0.75, le=5.0)]
SequenceId = Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")]


class SkyTarget(ApiModel):
    ra_deg: RaDegrees
    dec_deg: DecDegrees
    coordinate_frame: Literal["ICRS"] = "ICRS"


class SequenceRequest(SkyTarget):
    fov_arcmin: float = Field(default=6.0, ge=0.5, le=60.0)
    max_frames: int = Field(default=24, ge=2, le=96)
    detector: Detector | None = None
    wavelength_min_um: Wavelength | None = None
    wavelength_max_um: Wavelength | None = None
    start_utc: datetime | None = None
    end_utc: datetime | None = None

    @model_validator(mode="after")
    def validate_ranges(self) -> "SequenceRequest":
        for name in ("start_utc", "end_utc"):
            value = getattr(self, name)
            if value is not None:
                if value.utcoffset() is None:
                    raise ValueError(f"{name} must include a timezone")
                setattr(self, name, value.astimezone(timezone.utc))
        if self.start_utc and self.end_utc and self.start_utc >= self.end_utc:
            raise ValueError("start_utc must be earlier than end_utc")
        if (
            self.wavelength_min_um is not None
            and self.wavelength_max_um is not None
            and self.wavelength_min_um > self.wavelength_max_um
        ):
            raise ValueError("wavelength_min_um must not exceed wavelength_max_um")
        return self


class QualityWarning(ApiModel):
    code: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=500)


class ImageGrid(ApiModel):
    width_px: int = Field(ge=1, le=4096)
    height_px: int = Field(ge=1, le=4096)
    pixel_origin: Literal["top-left"] = "top-left"
    orientation: Literal["north-up-east-left"] = "north-up-east-left"
    pixel_center_convention: Literal["zero-based-integer-centers"] = (
        "zero-based-integer-centers"
    )
    wcs_header: dict[str, str | float | int] | None = None
    raster_to_wcs: Literal["identity", "flip-y"] | None = None

    @model_validator(mode="after")
    def validate_wcs_metadata(self) -> "ImageGrid":
        if (self.wcs_header is None) != (self.raster_to_wcs is None):
            raise ValueError("WCS header and raster transform must be supplied together")
        if self.wcs_header is not None:
            header = self.wcs_header
            required = {"CTYPE1", "CTYPE2", "CRPIX1", "CRPIX2", "CRVAL1", "CRVAL2"}
            if not required <= header.keys():
                raise ValueError("WCS header is missing celestial reference cards")
            if not str(header["CTYPE1"]).startswith("RA---") or not str(header["CTYPE2"]).startswith("DEC--"):
                raise ValueError("WCS axes must be RA then declination")
            if str(header.get("RADESYS", "ICRS")) != "ICRS":
                raise ValueError("Output WCS must use ICRS")
            if any(str(header.get(key, "deg")) != "deg" for key in ("CUNIT1", "CUNIT2")):
                raise ValueError("Output celestial WCS units must be degrees")
            matrix = {"CD1_1", "CD1_2", "CD2_1", "CD2_2"}
            if not matrix <= header.keys() and not {"CDELT1", "CDELT2"} <= header.keys():
                raise ValueError("WCS header needs a CD matrix or CDELT scales")
            try:
                numeric_cards = {key: float(header[key]) for key in required - {"CTYPE1", "CTYPE2"}}
                if not all(math.isfinite(value) for value in numeric_cards.values()):
                    raise ValueError("Nonfinite WCS reference card")
                if not 0 <= numeric_cards["CRVAL1"] < 360 or not -90 <= numeric_cards["CRVAL2"] <= 90:
                    raise ValueError("WCS reference position outside ICRS bounds")
                if matrix <= header.keys():
                    determinant = float(header["CD1_1"]) * float(header["CD2_2"]) - float(header["CD1_2"]) * float(header["CD2_1"])
                else:
                    pc_determinant = (
                        float(header.get("PC1_1", 1)) * float(header.get("PC2_2", 1))
                        - float(header.get("PC1_2", 0)) * float(header.get("PC2_1", 0))
                    )
                    determinant = float(header["CDELT1"]) * float(header["CDELT2"]) * pc_determinant
                if not math.isfinite(determinant) or determinant == 0:
                    raise ValueError("WCS transform is singular")
            except (TypeError, ValueError) as exc:
                raise ValueError("WCS numeric cards must define a nonsingular transform") from exc
        return self


class DisplaySettings(ApiModel):
    stretch: Literal["linear", "asinh"] = "asinh"
    vmin: float
    vmax: float

    @model_validator(mode="after")
    def validate_limits(self) -> "DisplaySettings":
        if self.vmin >= self.vmax:
            raise ValueError("vmin must be smaller than vmax")
        return self


class Frame(ApiModel):
    frame_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    label: str = Field(min_length=1, max_length=160)
    image_url: str = Field(min_length=1, max_length=2048)
    observed_start_utc: datetime | None = None
    observed_end_utc: datetime | None = None
    wavelength_um: Wavelength | None = None
    bandwidth_um: float | None = Field(default=None, gt=0)
    detector: Detector | None = None
    release: Literal["DR1", "QR3"] | None = None
    observation_id: str | None = Field(default=None, max_length=160)
    source_fits_url: HttpUrl | None = None
    masked_fraction: float = Field(default=0.0, ge=0, le=1)
    warnings: list[QualityWarning] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_exposure(self) -> "Frame":
        for name in ("observed_start_utc", "observed_end_utc"):
            value = getattr(self, name)
            if value is not None:
                if value.utcoffset() is None:
                    raise ValueError(f"{name} must include a timezone")
                setattr(self, name, value.astimezone(timezone.utc))
        if (self.observed_start_utc is None) != (self.observed_end_utc is None):
            raise ValueError("Both exposure times must be supplied together")
        if (
            self.observed_start_utc is not None
            and self.observed_end_utc is not None
            and self.observed_start_utc > self.observed_end_utc
        ):
            raise ValueError("Exposure start must not be later than exposure end")
        return self


class SequenceManifest(ApiModel):
    schema_version: Literal["1.0"] = "1.0"
    sequence_id: SequenceId
    data_mode: Literal["synthetic", "cached-real", "live"]
    title: str = Field(min_length=1, max_length=160)
    disclosure: str = Field(min_length=1, max_length=500)
    target: SkyTarget
    requested_fov_arcmin: float = Field(ge=0.5, le=60.0)
    grid: ImageGrid
    display: DisplaySettings
    frames: list[Frame] = Field(min_length=2, max_length=96)
    warnings: list[QualityWarning] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_provenance(self) -> "SequenceManifest":
        if len({frame.frame_id for frame in self.frames}) != len(self.frames):
            raise ValueError("Frame IDs must be unique within a sequence")
        if self.data_mode != "synthetic":
            if self.grid.wcs_header is None or self.grid.raster_to_wcs is None:
                raise ValueError("Real observations require output WCS and raster transform metadata")
            required = (
                "observed_start_utc", "observed_end_utc", "wavelength_um",
                "bandwidth_um", "detector", "release", "observation_id",
                "source_fits_url",
            )
            for frame in self.frames:
                if any(getattr(frame, field) is None for field in required):
                    raise ValueError("Real observations require complete source provenance")
            times = [frame.observed_start_utc for frame in self.frames]
            if times != sorted(times):
                raise ValueError("Real observation frames must be ordered by time")
        return self


class PresetTarget(ApiModel):
    preset_id: str
    label: str
    object_type: str
    ra_deg: RaDegrees | None = None
    dec_deg: DecDegrees | None = None
    coordinate_frame: Literal["ICRS"] = "ICRS"
    coordinate_note: str


class ApiError(ApiModel):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    service: Literal["khonsu-api"] = "khonsu-api"
    version: str
    live_processing_available: Literal[False] = False


class SequenceJob(ApiModel):
    sequence_id: SequenceId
    status: Literal["queued", "retrieving", "processing", "ready", "failed"]
    manifest_url: str | None = None
    error: ApiError | None = None
