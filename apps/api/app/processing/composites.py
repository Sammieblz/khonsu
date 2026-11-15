"""Bounded research coadds on an explicitly shared grid, outside live playback.

Inputs are linear MJy/sr, never PNG values. These quick-look means do not match
PSFs or estimate model/covariance uncertainty and are not calibrated photometry.
"""
from dataclasses import dataclass
from datetime import datetime

import numpy as np


def epoch_compatibility(records, *, max_hours=24, band_fraction=.1):
    """Time and target-wavelength gate, followed by per-pixel checks in coadd."""
    if not 2 <= len(records) <= 16:
        return 'Need two to sixteen distinct exposures'
    if not 0 < max_hours <= 24 or not 0 < band_fraction <= .1:
        return 'Invalid experiment bounds'
    try:
        if len({(r['observation_id'], r['detector']) for r in records}) != len(records):
            return 'Duplicate observation'
        if len({r['detector'] for r in records}) != 1 or len({r['release'] for r in records}) != 1:
            return 'Detector or release mismatch'
        if records[0]['release'] not in {'DR1', 'QR3'}:
            return 'Unsupported release'
        starts = [datetime.fromisoformat(r['observed_start_utc'].replace('Z', '+00:00')) for r in records]
        ends = [datetime.fromisoformat(r['observed_end_utc'].replace('Z', '+00:00')) for r in records]
        if any(s.utcoffset() is None or e.utcoffset() is None or e < s for s, e in zip(starts, ends)):
            return 'Invalid exposure interval'
        if (max(ends)-min(starts)).total_seconds() > max_hours*3600:
            return 'Exposures exceed the 24-hour window'
        waves = np.array([r['wavelength_um'] for r in records])
        widths = np.array([r['bandwidth_um'] for r in records])
        if not np.isfinite(waves).all() or not np.isfinite(widths).all() or np.min(widths) <= 0:
            return 'Invalid spectral metadata'
        if np.ptp(waves) > band_fraction*np.min(widths):
            return 'Target wavelength mismatch'
    except (ValueError, TypeError, KeyError):
        return 'Incomplete provenance'
    return None


def subtract_zodi(values, valid, model):
    """Subtract the supplied same-grid ZODI model without filling any gap."""
    if values.ndim != 2 or values.size > 2048**2 or model.shape != values.shape or valid.shape != values.shape:
        raise ValueError('Invalid zodiacal model grid')
    good = valid & np.isfinite(values) & np.isfinite(model)
    return np.where(good, values-model, np.nan), good


@dataclass
class EpochPlane:
    values: np.ndarray
    variance: np.ndarray
    valid: np.ndarray
    wavelength: np.ndarray
    bandwidth: np.ndarray


def epoch_coadd(records, planes):
    """Inverse-variance mean with strict flags and per-pixel spectral gating.

    Caller supplies a shared celestial grid and one nearest native sample per
    exposure/output pixel. No interpolation uncertainty is hidden in the weight.
    Diagonal variance assumes independent exposures; model errors, PSF changes
    and correlations between output pixels remain unaccounted for.
    """
    reason = epoch_compatibility(records)
    if reason:
        raise ValueError(reason)
    if len(planes) != len(records):
        raise ValueError('Plane/source count mismatch')
    shape = planes[0].values.shape
    if len(shape) != 2 or min(shape) < 1 or max(shape) > 512:
        raise ValueError('Coadd exceeds 512-square experiment bound')
    for plane in planes:
        if any(array.shape != shape for array in (plane.values, plane.variance, plane.valid, plane.wavelength, plane.bandwidth)):
            raise ValueError('All planes must share the supplied output grid')
    # Require the whole local spectral range to match, not just each value to
    # sit near a reference (which could admit twice the intended spread).
    waves = np.stack([p.wavelength for p in planes])
    widths = np.stack([p.bandwidth for p in planes])
    spectral = np.isfinite(waves).all(axis=0) & np.isfinite(widths).all(axis=0) & (widths.min(axis=0) > 0)
    spectral &= np.ptp(waves, axis=0) <= .1*widths.min(axis=0)
    total, weight = np.zeros(shape), np.zeros(shape)
    coverage = np.zeros(shape, dtype=np.uint16)
    for plane in planes:
        good = plane.valid & spectral & np.isfinite(plane.values) & np.isfinite(plane.variance) & (plane.variance > 0)
        w = np.divide(1., plane.variance, out=np.zeros(shape), where=good)
        total += np.where(good, plane.values, 0)*w
        weight += w
        coverage += good
    good = weight > 0
    image = np.divide(total, weight, out=np.full(shape, np.nan), where=good)
    variance = np.divide(1., weight, out=np.full(shape, np.nan), where=good)
    starts = [datetime.fromisoformat(r['observed_start_utc'].replace('Z', '+00:00')) for r in records]
    ends = [datetime.fromisoformat(r['observed_end_utc'].replace('Z', '+00:00')) for r in records]
    provenance = {'observed_start_utc': min(starts).isoformat(), 'observed_end_utc': max(ends).isoformat(),
                  'sources': records, 'method': 'strict inverse-variance mean; nearest native samples on common WCS',
                  'target_and_pixel_band_fraction': .1, 'max_hours': 24,
                  'psf_matched': False, 'model_uncertainty_propagated': False, 'covariance_propagated': False,
                  'spectral_rejected_fraction': float(1-spectral.mean()),
                  'covered_fraction': float(good.mean()), 'multiple_contributor_fraction': float((coverage >= 2).mean())}
    return image, good, variance, weight, coverage, provenance
