"""Read supplied SPHEREx spectral images without making network requests.

Spectral lookup follows IRSA's WCS(header, fobj=hdulist, key='W') recipe:
https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/
Flag names and bit indices come from MSKNnnnn in the FLAGS header:
https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/
"""

from dataclasses import dataclass
import math
import re

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np

from ..interfaces import ObservationInput
from ..schemas import QualityWarning
from .errors import ProcessingError

MAX_INPUT_PIXELS = 2048 * 2048

# IRSA source-discovery exclusion policy, plus the explicitly conservative
# OUTLIER and PHANMISS exclusions. SOURCE and FULLSAMPLE remain valid.
# https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo/
BAD_FLAG_NAMES = frozenset({
    "TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "DICHROIC",
    "MISSING_DATA", "HOT", "COLD", "NONLINEAR", "CROSSTALK", "GHOST",
    "GHOST_FPA", "GHOST_EXT", "STREAK", "PERSIST", "BLOOM", "SNOWBALL",
    "HALO", "SATELLITE_HALO", "OUTLIER", "PHANMISS",
})
INFORMATIONAL_FLAG_NAMES = frozenset({"SOURCE", "FULLSAMPLE"})

# Fallback only when a product omits the self-describing FLAGS cards.
# https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html
DOCUMENTED_FLAG_BITS = {
    0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC",
    7: "DICHROIC", 9: "MISSING_DATA", 10: "HOT", 11: "COLD",
    12: "FULLSAMPLE", 14: "PHANMISS", 15: "NONLINEAR", 17: "PERSIST",
    19: "OUTLIER", 20: "CROSSTALK", 21: "SOURCE", 22: "GHOST",
    23: "GHOST_FPA", 24: "GHOST_EXT", 25: "STREAK", 26: "BLOOM",
    27: "SNOWBALL", 28: "HALO", 29: "SATELLITE_HALO",
}


@dataclass
class ObservationMetadata:
    observation: ObservationInput
    spatial_wcs: WCS
    target_x: float
    target_y: float
    image_shape: tuple[int, int]
    wavelength_um: float
    bandwidth_um: float
    flux_scale: float
    flag_definitions: dict[int, str]
    processing_version: str
    warnings: list[QualityWarning]


@dataclass
class LoadedObservation(ObservationMetadata):
    science: np.ndarray
    variance: np.ndarray
    valid: np.ndarray


def _image_hdu(hdulist):
    for name in ("IMAGE", "SCI"):
        if name in hdulist:
            return hdulist[name]
    raise ProcessingError("INVALID_FITS", "The FITS file has no IMAGE extension.")


def _flag_definitions(header) -> tuple[dict[int, str], list[QualityWarning]]:
    definitions = {}
    for key in header.keys():
        match = re.fullmatch(r"MSKN(\d+)", key)
        if match and 0 <= int(match.group(1)) < 32:
            definitions[int(match.group(1))] = str(header[key]).strip().upper()
    if definitions:
        return definitions, []
    return dict(DOCUMENTED_FLAG_BITS), [QualityWarning(
        code="FLAGS_DEFINITION_FALLBACK",
        message="FLAGS has no MSKN cards; using the IRSA documented DR1/QR3 bit table, reviewed November 2026.",
    )]


def inspect_observation(
    observation: ObservationInput, ra_deg: float, dec_deg: float
) -> ObservationMetadata:
    """Inspect small metadata before deciding which full arrays to load."""
    if observation.release not in {"DR1", "QR3"}:
        raise ProcessingError("UNSUPPORTED_RELEASE", "Only compatible DR1 and QR3 images are supported.")
    if not 1 <= observation.detector <= 6:
        raise ProcessingError("INVALID_PROVENANCE", "Observation detector must be between 1 and 6.")
    if (
        observation.observed_start_utc.utcoffset() is None
        or observation.observed_end_utc.utcoffset() is None
        or observation.observed_start_utc > observation.observed_end_utc
    ):
        raise ProcessingError("INVALID_PROVENANCE", "Observation exposure times must be ordered and timezone-aware.")
    try:
        with fits.open(observation.fits_path, memmap=False, lazy_load_hdus=True) as hdulist:
            image = _image_hdu(hdulist)
            shape = (int(image.header.get("NAXIS2", 0)), int(image.header.get("NAXIS1", 0)))
            if int(image.header.get("NAXIS", 0)) != 2 or min(shape) < 1:
                raise ProcessingError("INVALID_FITS", "IMAGE must be a nonempty two-dimensional array.")
            if shape[0] * shape[1] > MAX_INPUT_PIXELS:
                raise ProcessingError("RESOURCE_LIMIT", "Input image exceeds the 2048 by 2048 pixel budget.")
            if "FLAGS" not in hdulist or "VARIANCE" not in hdulist:
                raise ProcessingError("MISSING_QUALITY_DATA", "Both FLAGS and VARIANCE extensions are required.")
            spatial_wcs = WCS(image.header, fobj=hdulist).celestial
            if not spatial_wcs.has_celestial or spatial_wcs.pixel_n_dim != 2:
                raise ProcessingError("INVALID_WCS", "IMAGE has no usable two-dimensional celestial WCS.")
            coord = SkyCoord(ra_deg * u.deg, dec_deg * u.deg, frame="icrs")
            x, y = (float(value) for value in spatial_wcs.world_to_pixel(coord))
            if not math.isfinite(x) or not math.isfinite(y) or not (0 <= x <= shape[1] - 1 and 0 <= y <= shape[0] - 1):
                raise ProcessingError("NO_USABLE_COVERAGE", "The target is outside this observation's pixel coverage.")
            if "WCS-WAVE" not in hdulist:
                raise ProcessingError("MISSING_SPECTRAL_METADATA", "The WCS-WAVE lookup table is required; no detector midpoint is substituted.")
            try:
                spectral_wcs = WCS(image.header, fobj=hdulist, key="W")
                # Spatial SIP distortion does not apply to the spectral table.
                spectral_wcs.sip = None
                wavelength, bandwidth = spectral_wcs.pixel_to_world(x, y)
                wavelength_um = float(wavelength.to_value(u.um))
                bandwidth_um = float(bandwidth.to_value(u.um))
            except Exception as exc:
                raise ProcessingError("MISSING_SPECTRAL_METADATA", "The target's WCS-WAVE wavelength and bandwidth could not be evaluated.") from exc
            if not (math.isfinite(wavelength_um) and 0.75 <= wavelength_um <= 5 and math.isfinite(bandwidth_um) and bandwidth_um > 0):
                raise ProcessingError("MISSING_SPECTRAL_METADATA", "The target's wavelength or bandwidth is invalid.")
            try:
                flux_scale = float(u.Unit(image.header.get("BUNIT", "")).to(u.MJy / u.sr))
            except (ValueError, u.UnitConversionError) as exc:
                raise ProcessingError("UNSUPPORTED_FLUX_UNIT", "IMAGE surface-brightness units must be convertible to MJy/sr.") from exc
            definitions, warnings = _flag_definitions(hdulist["FLAGS"].header)
            return ObservationMetadata(
                observation, spatial_wcs, x, y, shape,
                wavelength_um, bandwidth_um, flux_scale, definitions,
                str(hdulist[0].header.get("VERSION", "not supplied")), warnings,
            )
    except ProcessingError:
        raise
    except Exception as exc:
        raise ProcessingError("INVALID_FITS", "The supplied FITS observation could not be read safely.") from exc


def read_observation(
    observation: ObservationInput, ra_deg: float, dec_deg: float
) -> LoadedObservation:
    metadata = inspect_observation(observation, ra_deg, dec_deg)
    try:
        with fits.open(observation.fits_path, memmap=False) as hdulist:
            image = _image_hdu(hdulist)
            science = np.array(image.data, dtype=np.float32, copy=True) * metadata.flux_scale
            variance = np.array(hdulist["VARIANCE"].data, dtype=np.float32, copy=True) * metadata.flux_scale ** 2
            raw_flags = np.asarray(hdulist["FLAGS"].data)
            if raw_flags.dtype.kind not in {"i", "u"}:
                raise ProcessingError("INVALID_FITS", "FLAGS must contain integer bitmaps.")
            if science.shape != metadata.image_shape or variance.shape != science.shape or raw_flags.shape != science.shape:
                raise ProcessingError("INVALID_FITS", "IMAGE, FLAGS and VARIANCE must have matching dimensions.")
            flags = raw_flags.astype(np.uint32, copy=True)
        known_mask = 0
        rejection_mask = 0
        for bit, name in metadata.flag_definitions.items():
            known_mask |= 1 << bit
            if name in BAD_FLAG_NAMES or name not in INFORMATIONAL_FLAG_NAMES:
                rejection_mask |= 1 << bit
        unknown = flags & np.uint32((~known_mask) & 0xFFFFFFFF)
        rejected = (flags & np.uint32(rejection_mask)) != 0
        valid = np.isfinite(science) & np.isfinite(variance) & (variance > 0) & ~rejected & (unknown == 0)
        warnings = list(metadata.warnings)
        if np.any(unknown):
            warnings.append(QualityWarning(
                code="UNKNOWN_FLAGS_MASKED",
                message="Pixels carrying undocumented flag bits were excluded conservatively.",
            ))
        target_x = int(np.clip(np.rint(metadata.target_x), 0, science.shape[1] - 1))
        target_y = int(np.clip(np.rint(metadata.target_y), 0, science.shape[0] - 1))
        if not valid[target_y, target_x]:
            warnings.append(QualityWarning(
                code="TARGET_MASKED",
                message="The target's nearest input pixel is masked. Other field pixels may remain usable; this frame cannot establish a target-source measurement.",
            ))
        if not np.any(valid):
            raise ProcessingError("NO_USABLE_COVERAGE", "Every pixel in this observation is masked or invalid.")
        return LoadedObservation(
            metadata.observation, metadata.spatial_wcs, metadata.target_x,
            metadata.target_y, metadata.image_shape, metadata.wavelength_um,
            metadata.bandwidth_um, metadata.flux_scale, metadata.flag_definitions,
            metadata.processing_version, warnings, science, variance, valid,
        )
    except ProcessingError:
        raise
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise ProcessingError("INVALID_FITS", "The observation's calibrated arrays could not be read safely.") from exc
