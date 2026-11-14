"""Celestial reprojection and one shared display mapping for genuine frames."""

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from PIL import Image
from reproject import reproject_interp

from ..interfaces import ProcessingOptions
from .errors import ProcessingError


def output_wcs(options: ProcessingOptions) -> WCS:
    size = options.output_size_px
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
    source = np.where(loaded.valid, loaded.science, np.nan).astype(np.float32)
    image, footprint = reproject_interp(
        (source, loaded.spatial_wcs), wcs,
        shape_out=(size, size), order="bilinear", parallel=False,
    )
    mask, mask_footprint = reproject_interp(
        (loaded.valid.astype(np.float32), loaded.spatial_wcs), wcs,
        shape_out=(size, size), order="nearest-neighbor", parallel=False,
    )
    valid = np.isfinite(image) & (footprint > 0) & (mask_footprint > 0) & (mask > 0.5)
    image = np.asarray(image, dtype=np.float32)
    image[~valid] = np.nan
    if np.count_nonzero(valid) < max(4, int(size * size * 0.01)):
        raise ProcessingError("NO_USABLE_COVERAGE", "Less than one percent of the output field has valid coverage.")
    return image, valid


def shared_limits(projected) -> tuple[float, float]:
    # Bound percentile memory while sampling each frame with the same policy.
    samples = []
    for _, image, valid in projected:
        values = image[valid]
        stride = max(1, int(np.ceil(values.size / 65536)))
        samples.append(values[::stride])
    combined = np.concatenate(samples)
    low, high = (float(value) for value in np.percentile(combined, [0.5, 99.5]))
    if high <= low:
        span = max(abs(low) * 0.01, 1e-6)
        low, high = low - span, high + span
    return low, high


def write_png(path, image, valid, low: float, high: float):
    normalized = np.clip((np.nan_to_num(image, nan=low) - low) / (high - low), 0.0, 1.0)
    stretched = np.arcsinh(normalized / 0.1) / np.arcsinh(10.0)
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
    header["HISTORY"] = "Khonsu display grid; bilinear reprojection; no PSF/background matching"
    fits.HDUList([
        fits.PrimaryHDU(), fits.ImageHDU(image, header=header, name="IMAGE"),
        fits.ImageHDU(valid.astype(np.uint8), name="VALID"),
    ]).writeto(path, overwrite=True)
