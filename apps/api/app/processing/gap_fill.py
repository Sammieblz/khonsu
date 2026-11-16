"""Display-only harmonic estimates for bounded gaps in one observation.

The source image and validity mask are immutable. These values are never passed
to photometry, reprojection, coadds or differences. Small and medium gaps may
include edges or bright boundaries; their true signal remains unknown.
Broad missing regions stay unfilled. No neighboring epoch supplies a pixel.
"""
import numpy as np
from scipy.ndimage import find_objects, label

ENCODING = "float32-le-estimate8-v1"
POLICY = {
    "gap_fill_method": "bounded-gap-harmonic-v2",
    "gap_fill_max_native_span": 8.0,
    "gap_fill_max_native_area": 32.0,
    "gap_fill_edge_policy": "in-bounds neighbors only; zero outward flux; bounded visual extrapolation",
    "gap_fill_bright_boundary_policy": "clamp to observed boundary; no recovered peak or flux claim",
    "gap_fill_max_components": 2048,
    "gap_fill_max_pixels": 65536,
    "gap_fill_scope": "display estimates only; strict neighbors in this observation; no measured coverage added",
}


def estimate_gaps(image, valid, pixels_per_native=2.0):
    """Return separate float estimates and a boolean estimated-area mask.

    Solve the discrete four-neighbor Laplace equation with fixed valid boundary
    samples. The maximum principle bounds estimates by that boundary: a smooth
    continuation cannot introduce a new interior peak. Eight-connected grouping
    keeps diagonal chains of missing coverage together. Limits use native sample
    size as well as hard array/work caps. At an image edge, use only in-bounds
    neighbors (zero outward flux). A bright boundary can produce a smooth visual
    continuation, but cannot recover the unknown peak or flux behind a mask.
    """
    image = np.asarray(image)
    valid = np.asarray(valid, dtype=bool)
    if (image.ndim != 2 or image.shape != valid.shape or min(image.shape) < 1
            or max(image.shape) > 2048 or not np.isfinite(pixels_per_native)
            or pixels_per_native <= 0 or not np.isfinite(image[valid]).all()):
        raise ValueError("Invalid gap-fill input or resource bound")
    estimates = np.zeros(image.shape, dtype=np.float32)
    estimated = np.zeros(image.shape, dtype=bool)
    samples = image[valid]
    if samples.size < 16:
        return estimates, estimated
    span_limit = min(16, int(np.floor(POLICY["gap_fill_max_native_span"] * pixels_per_native)))
    area_limit = min(128, int(np.floor(POLICY["gap_fill_max_native_area"] * pixels_per_native ** 2)))
    labels, _ = label(~valid, structure=np.ones((3, 3)))
    areas = np.bincount(labels.ravel())
    remaining = min(POLICY["gap_fill_max_pixels"], int(image.size * .1))
    processed = 0
    for identity, bounds in enumerate(find_objects(labels), 1):
        if bounds is None or areas[identity] > area_limit or areas[identity] > remaining:
            continue
        y, x = bounds
        if max(y.stop - y.start, x.stop - x.start) > span_limit:
            continue
        ys, xs = np.where(labels[y, x] == identity)
        ys, xs = ys + y.start, xs + x.start
        coordinates = list(zip(ys.tolist(), xs.tolist()))
        indices = {point: index for index, point in enumerate(coordinates)}
        matrix = np.zeros((len(coordinates), len(coordinates)), dtype=np.float64)
        rhs = np.zeros(len(coordinates), dtype=np.float64)
        boundary = []
        for row, (cy, cx) in enumerate(coordinates):
            for neighbor in ((cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)):
                if not (0 <= neighbor[0] < image.shape[0] and 0 <= neighbor[1] < image.shape[1]):
                    continue
                matrix[row, row] += 1
                if neighbor in indices:
                    matrix[row, indices[neighbor]] -= 1
                else:
                    value = float(image[neighbor])
                    boundary.append(value)
                    rhs[row] += value
        # Every solved component needs observed boundary information. The fill
        # remains an estimate, including at an edge or inside a bright source.
        if not boundary:
            continue
        values = np.linalg.solve(matrix, rhs)
        estimates[ys, xs] = np.clip(values, min(boundary), max(boundary))
        estimated[ys, xs] = True
        remaining -= len(coordinates)
        processed += 1
        if processed >= POLICY["gap_fill_max_components"] or remaining == 0:
            break
    return estimates, estimated


def write_gap_fill(path, image, valid, pixels_per_native):
    from .alignment import write_prepared_raster
    estimates, estimated = estimate_gaps(image, valid, pixels_per_native)
    fraction = float(estimated.mean())
    if not estimated.any():
        return None, fraction
    asset = write_prepared_raster(path, estimates, estimated)
    asset["encoding"] = ENCODING
    return asset, fraction
