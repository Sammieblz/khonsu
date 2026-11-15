"""Celestial reprojection and one shared display mapping for genuine frames."""

import math
import hashlib

from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
import numpy as np
from PIL import Image
from reproject import reproject_interp

from ..interfaces import ProcessingOptions
from ..limits import MAX_GRID_SIDE
from .errors import ProcessingError

# Output pixels per native detector pixel. Two keeps registration error near
# 1.5 arcsec for SPHEREx's ~6.15 arcsec pixels without smearing one measured
# pixel across many display pixels (512 px at 6 arcmin was ~9x).
GRID_OVERSAMPLE = 2.0
MIN_GRID_PX = 32
# Large fields retain native samples; the processor also enforces a total
# sequence pixel budget before allocating output arrays.
MAX_AUTO_GRID_PX = MAX_GRID_SIDE

# Display stretch, shared by every frame in a comparison. Limits come from the
# empty sky so noise stays dark instead of filling the gray range.
STRETCH_SKY_SIGMA_BELOW = 2.0
STRETCH_HIGH_PERCENTILE = 99.5
STRETCH_MIN_SPAN_SIGMA = 50.0
ASINH_A = 0.1
MAD_TO_SIGMA = 1.4826


def native_pixel_scale_arcsec(spatial_wcs: WCS) -> float:
    scales = proj_plane_pixel_scales(spatial_wcs.celestial)
    value = float(np.mean(scales)) * 3600.0
    if not math.isfinite(value) or value <= 0:
        raise ProcessingError("INVALID_WCS", "The observation pixel scale could not be determined.")
    return value


def auto_grid_size(fov_arcmin: float, native_scale_arcsec: float) -> int:
    # Round first so float noise (3.3 * 60 is not exactly 198) cannot add a pixel.
    size = math.ceil(round(fov_arcmin * 60.0 * GRID_OVERSAMPLE / native_scale_arcsec, 6))
    return min(MAX_AUTO_GRID_PX, max(MIN_GRID_PX, size))


def output_wcs(options: ProcessingOptions, size: int | None = None) -> WCS:
    size = options.output_size_px if size is None else size
    scale_deg = options.fov_arcmin / 60.0 / size
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.cunit = ["deg", "deg"]
    wcs.wcs.radesys = "ICRS"
    wcs.wcs.crval = [options.ra_deg, options.dec_deg]
    wcs.wcs.crpix = [(size + 1) / 2.0, (size + 1) / 2.0]
    wcs.wcs.cdelt = [-scale_deg, scale_deg]
    return wcs


def reproject_observation(loaded, wcs: WCS, size: int):
    """Resample valid pixels only, so a masked pixel never grows a hole.

    Bilinear interpolation over an array holding NaN turns every output pixel
    that touches one masked input pixel into NaN, which made each bad pixel a
    hole about four native pixels wide. Instead, interpolate the zero-filled
    image and the validity weights separately and divide: each value is the
    bilinear average of valid neighbours only. An output pixel is kept only
    when its nearest input pixel is valid and inside coverage, so masked areas
    keep their true size and position and no value is invented for them.
    """
    shape = (size, size)
    weights = loaded.valid.astype(np.float32)
    source = np.where(loaded.valid, loaded.science, 0.0).astype(np.float32)
    total, footprint = reproject_interp(
        (source, loaded.spatial_wcs), wcs, shape_out=shape, order="bilinear", parallel=False,
    )
    weight, _ = reproject_interp(
        (weights, loaded.spatial_wcs), wcs, shape_out=shape, order="bilinear", parallel=False,
    )
    nearest, nearest_footprint = reproject_interp(
        (weights, loaded.spatial_wcs), wcs, shape_out=shape, order="nearest-neighbor", parallel=False,
    )
    valid = (
        np.isfinite(total) & np.isfinite(weight) & (weight > 0)
        & (footprint > 0) & (nearest_footprint > 0) & (nearest > 0.5)
    )
    image = np.full(shape, np.nan, dtype=np.float32)
    image[valid] = total[valid] / weight[valid]
    if np.count_nonzero(valid) < max(4, int(size * size * 0.01)):
        raise ProcessingError("NO_USABLE_COVERAGE", "Less than one percent of the output field has valid coverage.")
    return image, valid


def shared_limits(projected) -> tuple[float, float]:
    """One display range for the whole comparison, anchored on the empty sky.

    The sky median and robust sigma (1.4826 x median absolute deviation) put
    black just below the sky so noise stays dark. White is the 99.5th
    percentile, but never closer than 50 sigma so a starless field is not
    stretched until its noise looks like structure.
    """
    # Bound memory while sampling each frame with the same policy.
    samples = []
    for _, image, valid in projected:
        values = image[valid]
        stride = max(1, int(np.ceil(values.size / 65536)))
        samples.append(values[::stride])
    combined = np.concatenate(samples)
    sky = float(np.median(combined))
    sigma = MAD_TO_SIGMA * float(np.median(np.abs(combined - sky)))
    low = sky - STRETCH_SKY_SIGMA_BELOW * sigma
    high = max(float(np.percentile(combined, STRETCH_HIGH_PERCENTILE)), sky + STRETCH_MIN_SPAN_SIGMA * sigma)
    if high <= low:
        span = max(abs(low) * 0.01, 1e-6)
        low, high = low - span, high + span
    return low, high


def write_png(path, image, valid, low: float, high: float):
    normalized = np.clip((np.nan_to_num(image, nan=low) - low) / (high - low), 0.0, 1.0)
    stretched = np.arcsinh(normalized / ASINH_A) / np.arcsinh(1.0 / ASINH_A)
    gray = np.rint(stretched * 255.0).astype(np.uint8)
    rgba = np.stack((gray, gray, gray, valid.astype(np.uint8) * 255), axis=-1)
    # FITS/Astropy y increases upward on this grid. Browser raster y increases
    # downward, so north is up and the inverse transform is explicitly flip-y.
    rgba = np.flipud(rgba).copy()
    temporary = path.with_suffix(".png.tmp")
    Image.fromarray(rgba, mode="RGBA").save(temporary, format="PNG")
    temporary.replace(path)


def write_calibrated_grid(path, image, valid, wcs: WCS):
    """Preserve aligned float values separately from the display PNG.

    No propagated variance is claimed: interpolation induces correlations and
    source variance is used for validity only in this visual-comparison MVP.
    """
    header = wcs.to_header(relax=True)
    header["BUNIT"] = "MJy/sr"
    header["HISTORY"] = "Khonsu display grid; validity-weighted bilinear reprojection; no PSF/background matching"
    fits.HDUList([
        fits.PrimaryHDU(), fits.ImageHDU(image, header=header, name="IMAGE"),
        fits.ImageHDU(valid.astype(np.uint8), name="VALID"),
    ]).writeto(path, overwrite=True)


def write_prepared_raster(path, image, valid):
    """Top-left row-major float32 LE intensities followed by one validity byte.

    Invalid samples are zero-filled only for transport; their mask stays zero.
    Valid negative and above-display-limit intensities are preserved.
    """
    values = np.flipud(np.where(valid, image, 0)).astype("<f4")
    mask = np.flipud(valid).astype(np.uint8)
    data = values.tobytes(order="C") + mask.tobytes(order="C")
    temporary = path.with_suffix(".bin.tmp")
    temporary.write_bytes(data)
    temporary.replace(path)
    return {"encoding": "float32-le-mask8-v1", "size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}
