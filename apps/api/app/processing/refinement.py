"""Optional visual refinement from the same native observation, before resampling."""
from dataclasses import replace

import numpy as np

from .alignment import reproject_observation, write_prepared_raster
from .resolution import reduce_grain

ENCODING = 'float32-le-refined8-v1'
STRENGTH = .5
POLICY = {
    'refinement_method': 'native-mask-normalized-local-wiener',
    'refinement_strength': STRENGTH,
    'refinement_scope': 'optional display copy; native linear values before WCS resampling; no temporal averaging or measurement change',
    'refinement_highlights': 'shared display shoulder after stretch: knee 0.65, width 0.35; no saturation recovery',
}


def prepare_refinement(loaded, wcs, size, original_valid):
    """Reuse the lab filter without altering IMAGE, VARIANCE or strict validity."""
    filtered, settings = reduce_grain(loaded.science, loaded.valid, loaded.variance, strength=STRENGTH)
    if settings['used_sigma'] <= 0:
        return None
    image, valid = reproject_observation(replace(loaded, science=filtered), wcs, size)
    if not np.array_equal(valid, original_valid):
        raise ValueError('Display refinement must preserve the original footprint')
    return image, {
        'method': settings['method'], 'strength': STRENGTH,
        'noise_sigma_mjy_sr': settings['used_sigma'],
        'robust_haar_sigma_mjy_sr': settings['robust_haar_sigma'],
        'archive_sky_sigma_mjy_sr': settings['archive_sky_sigma'],
    }


def write_refinement(path, prepared, valid, original_raster_sha256):
    if prepared is None:
        return None
    image, settings = prepared
    raster = write_prepared_raster(path, image, valid)
    raster['encoding'] = ENCODING
    return {**settings, 'raster': raster, 'input_raster_sha256': original_raster_sha256}
