"""Experimental resolution-lab primitives, not used by the production processor.

Arrays contain surface brightness, never display RGB. Drizzle uses polygon
overlap and inverse variance; its diagonal variance omits inter-pixel covariance.
"""
from dataclasses import dataclass
from datetime import datetime
import math

import numpy as np
from scipy.ndimage import convolve


def reduce_grain(values, valid, variance, *, strength=.85):
    """Bounded, mask-normalized local Wiener display filter on native samples.

    Noise is estimated from adjacent Haar diagonal differences, capped by the
    median archive sigma on low-intensity pixels. No quality flag is relaxed.
    This visual copy is not photometry: faint structure can be attenuated.
    """
    values = np.asarray(values, dtype=float)
    variance = np.asarray(variance, dtype=float)
    valid = np.asarray(valid, dtype=bool)
    if values.ndim != 2 or min(values.shape) < 2 or values.size > 2048**2:
        raise ValueError('Invalid or unbounded denoising image')
    if valid.shape != values.shape or variance.shape != values.shape:
        raise ValueError('Denoising shapes must match')
    if not np.isfinite(strength) or not 0 <= strength <= 1:
        raise ValueError('Invalid denoising strength')
    good = valid & np.isfinite(values) & np.isfinite(variance) & (variance > 0)
    if not np.array_equal(good, valid):
        raise ValueError('Valid samples need finite values and positive variance')
    clean = np.where(good, values, 0.)
    hh_good = good[:-1, :-1] & good[1:, :-1] & good[:-1, 1:] & good[1:, 1:]
    hh = (clean[:-1, :-1]-clean[1:, :-1]-clean[:-1, 1:]+clean[1:, 1:])/2
    detail = hh[hh_good]
    robust_sigma = float(1.4826*np.median(abs(detail-np.median(detail)))) if detail.size >= 16 else 0.
    sky = good & (clean <= np.median(clean[good])) if np.any(good) else good
    archive_sigma = float(np.median(np.sqrt(variance[sky]))) if np.any(sky) else 0.
    sigma = min(robust_sigma, archive_sigma)
    kernel = np.outer([1., 2., 1.], [1., 2., 1.])/16
    mass = convolve(good.astype(float), kernel, mode='constant')
    mean = np.divide(convolve(clean, kernel, mode='constant'), mass, out=clean.copy(), where=mass > 0)
    second = np.divide(convolve(clean*clean, kernel, mode='constant'), mass, out=clean*clean, where=mass > 0)
    local_variance = np.maximum(0, second-mean*mean)
    gain = np.maximum(0, 1-sigma*sigma/np.maximum(local_variance, 1e-30))
    correction = strength*(1-gain)*(mean-clean)
    correction = np.clip(correction, -2*sigma, 2*sigma)
    output = np.where(good, clean+correction, np.nan)
    return output, {'method': 'native-mask-normalized-local-wiener', 'strength': strength,
                    'kernel': '3x3 binomial', 'robust_haar_sigma': robust_sigma,
                    'archive_sky_sigma': archive_sigma, 'used_sigma': sigma,
                    'maximum_correction_sigma': 2, 'validity_unchanged': True,
                    'note': 'Display only. Faint sources and diffuse structure can be attenuated; use Original for evidence.'}


def sample_masked(values, valid, x, y, *, cubic=False):
    """Valid-weighted bilinear or bounded Catmull-Rom display interpolation.

    Cubic requires all 16 neighbours valid, otherwise use bilinear. A local
    four-sample clamp prevents overshoot. Nearest-input validity always wins.
    """
    values = np.asarray(values, dtype=float)
    valid = np.asarray(valid, dtype=bool) & np.isfinite(values)
    if values.ndim != 2 or valid.shape != values.shape or x.shape != y.shape:
        raise ValueError('Incompatible sample shapes')
    height, width = values.shape
    finite = np.isfinite(x) & np.isfinite(y)
    x, y = np.where(finite, x, 0), np.where(finite, y, 0)
    nx, ny = np.floor(x + .5).astype(int), np.floor(y + .5).astype(int)
    good = finite & (nx >= 0) & (nx < width) & (ny >= 0) & (ny < height)
    good &= valid[ny.clip(0, height-1), nx.clip(0, width-1)]
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x-x0, y-y0
    total, weight = np.zeros(x.shape), np.zeros(x.shape)
    lower, upper = np.full(x.shape, np.inf), np.full(x.shape, -np.inf)
    clean = np.where(valid, values, 0)
    for dy in range(2):
        for dx in range(2):
            xx, yy = (x0+dx).clip(0, width-1), (y0+dy).clip(0, height-1)
            w = (fx if dx else 1-fx) * (fy if dy else 1-fy) * valid[yy, xx]
            total += clean[yy, xx] * w
            weight += w
            lower, upper = np.minimum(lower, clean[yy, xx]), np.maximum(upper, clean[yy, xx])
    result = np.divide(total, weight, out=np.zeros_like(total), where=weight > 0)
    if cubic:
        def kernel(t):
            t = np.abs(t)
            return np.where(t <= 1, 1.5*t**3 - 2.5*t**2 + 1,
                            np.where(t < 2, -.5*t**3 + 2.5*t**2 - 4*t + 2, 0))
        smooth, safe = np.zeros(x.shape), np.ones(x.shape, dtype=bool)
        for dy in range(-1, 3):
            for dx in range(-1, 3):
                xx, yy = x0+dx, y0+dy
                inside = (xx >= 0) & (xx < width) & (yy >= 0) & (yy < height)
                xx, yy = xx.clip(0, width-1), yy.clip(0, height-1)
                safe &= inside & valid[yy, xx]
                smooth += clean[yy, xx] * kernel(fx-dx) * kernel(fy-dy)
        result = np.where(safe, np.clip(smooth, lower, upper), result)
    good &= weight > 0
    return np.where(good, result, np.nan), good


def tone(values, low, high, *, shoulder=False, softness=.1):
    """Current asinh mapping or a C1-continuous highlight shoulder for display."""
    if not np.isfinite([low, high, softness]).all() or high <= low or softness <= 0:
        raise ValueError('Invalid display range')
    x = np.maximum(0, (np.nan_to_num(values, nan=low)-low)/(high-low))
    if not shoulder:
        x = np.minimum(1, x)
    mapped = np.arcsinh(x/softness) / np.arcsinh(1/softness)
    if shoulder:
        above = np.maximum(0, mapped-.65)
        mapped = np.where(mapped > .65, .65 + .35 * (-np.expm1(-above/.35)), mapped)
    return np.clip(mapped, 0, 1)


def compatibility(records, *, max_hours=24, band_fraction=.1):
    """Conservative *candidate* gate; spatial spectral checks follow separately."""
    if not 3 <= len(records) <= 16:
        return 'At least three and at most sixteen exposures are required'
    if len({(r['observation_id'], r['detector']) for r in records}) != len(records):
        return 'Duplicate observations cannot supply independent information'
    if len({r['detector'] for r in records}) != 1 or any(r['release'] not in {'DR1', 'QR3'} for r in records):
        return 'Detector or release mismatch'
    try:
        starts = [datetime.fromisoformat(r['observed_start_utc'].replace('Z', '+00:00')) for r in records]
        ends = [datetime.fromisoformat(r['observed_end_utc'].replace('Z', '+00:00')) for r in records]
        if any(s.utcoffset() is None or e.utcoffset() is None or e < s for s, e in zip(starts, ends)):
            return 'Invalid exposure interval'
        if (max(ends)-min(starts)).total_seconds() > max_hours*3600:
            return 'Exposures span more than the allowed time window'
        wavelengths = np.array([r['wavelength_um'] for r in records])
        bandwidths = np.array([r['bandwidth_um'] for r in records])
        if not np.isfinite(wavelengths).all() or not np.isfinite(bandwidths).all() or np.min(bandwidths) <= 0:
            return 'Invalid spectral metadata'
        if np.ptp(wavelengths) > band_fraction * np.min(bandwidths):
            return 'Target wavelength spread exceeds the allowed band fraction'
        phases = np.mod([r['target_detector_pixel'] for r in records], 1.)
        offsets = (phases-phases[0]+.5) % 1.-.5
        if not np.isfinite(offsets).all() or offsets.shape != (len(records), 2):
            return 'Invalid pixel offsets'
        eigenvalues = np.linalg.eigvalsh(np.cov(offsets.T))
        if np.min(eigenvalues) < .005:
            return 'Insufficient two-dimensional subpixel diversity'
    except (ValueError, TypeError, KeyError):
        return 'Incomplete or invalid compatibility metadata'
    return None


def polygon_area(points):
    if len(points) < 3:
        return 0.
    points = np.asarray(points)
    return .5 * abs(np.dot(points[:, 0], np.roll(points[:, 1], 1)) -
                    np.dot(points[:, 1], np.roll(points[:, 0], 1)))


def overlap(points, x, y):
    """Sutherland-Hodgman clipping against the output pixel's four edges."""
    polygon = list(points)
    for axis, boundary, sign in [(0, x-.5, 1), (0, x+.5, -1), (1, y-.5, 1), (1, y+.5, -1)]:
        if not polygon:
            return 0.
        clipped = []
        previous = polygon[-1]
        previous_inside = sign*(previous[axis]-boundary) >= 0
        for current in polygon:
            inside = sign*(current[axis]-boundary) >= 0
            if inside != previous_inside:
                t = (boundary-previous[axis])/(current[axis]-previous[axis])
                clipped.append(previous + t*(current-previous))
            if inside:
                clipped.append(current)
            previous, previous_inside = current, inside
        polygon = clipped
    return polygon_area(polygon)


@dataclass
class DropPlane:
    values: np.ndarray
    variance: np.ndarray
    valid: np.ndarray
    # Native pixel corners already mapped into output pixel coordinates.
    corners: np.ndarray


def drizzle(planes, shape, *, pixfrac=.7):
    """Surface-brightness reconstruction with independent-input diagonal variance.

    No inpainting, PSF matching, background matching or temporal interpolation.
    Caller verifies distinct sources, wavelength compatibility and registration.
    """
    if not 1 <= len(planes) <= 16 or len(shape) != 2 or not all(1 <= n <= 512 for n in shape):
        raise ValueError('Reconstruction exceeds the bounded experiment')
    if not np.isfinite(pixfrac) or not .1 <= pixfrac <= 1:
        raise ValueError('Invalid pixel drop size')
    total, weights, varsum = (np.zeros(shape) for _ in range(3))
    contributors = np.zeros(shape, dtype=np.uint16)
    for plane in planes:
        if plane.values.size > 2048**2 or plane.variance.shape != plane.values.shape or plane.valid.shape != plane.values.shape:
            raise ValueError('Invalid input planes')
        if plane.corners.shape != (*plane.values.shape, 4, 2):
            raise ValueError('Invalid pixel geometry')
        good = plane.valid & np.isfinite(plane.values) & np.isfinite(plane.variance) & (plane.variance > 0)
        contributed = np.zeros(shape, dtype=bool)
        for value, variance, corners in zip(plane.values[good], plane.variance[good], plane.corners[good]):
            if not np.isfinite(corners).all():
                continue
            centre = corners.mean(axis=0)
            drop = centre + pixfrac * (corners-centre)
            area = polygon_area(drop)
            if not 1e-8 < area < 256:
                continue
            x0 = max(0, math.floor(drop[:, 0].min()+.5))
            x1 = min(shape[1]-1, math.floor(drop[:, 0].max()+.5))
            y0 = max(0, math.floor(drop[:, 1].min()+.5))
            y1 = min(shape[0]-1, math.floor(drop[:, 1].max()+.5))
            for y in range(y0, y1+1):
                for x in range(x0, x1+1):
                    fraction = overlap(drop, x, y)/area
                    if fraction <= 1e-12:
                        continue
                    weight = fraction/variance
                    total[y, x] += weight*value
                    weights[y, x] += weight
                    varsum[y, x] += fraction*fraction/variance
                    contributed[y, x] = True
        contributors += contributed
    valid = weights > 0
    image = np.divide(total, weights, out=np.full(shape, np.nan), where=valid)
    variance = np.divide(varsum, weights**2, out=np.full(shape, np.nan), where=valid)
    return image, valid, variance, weights, contributors
