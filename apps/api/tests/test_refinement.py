"""Known synthetic controls for a display aid, never a source-detection claim."""
import hashlib

import numpy as np
import pytest

from app.processing.refinement import STRENGTH
from app.processing.resolution import reduce_grain, tone
from app.schemas import Frame


def test_noise_reduction_preserves_signed_samples_masks_and_original_inputs():
    rng = np.random.default_rng(68)
    values = rng.normal(-4, 1, (96, 96))
    valid = np.ones(values.shape, bool); valid[15:20, 15:20] = False
    variance = np.ones(values.shape)
    original = values.copy(); mask = valid.copy()
    output, settings = reduce_grain(values, valid, variance, strength=STRENGTH)
    assert np.std(output[valid]) < .85 * np.std(values[valid])
    assert np.mean(output[valid]) == pytest.approx(np.mean(values[valid]), abs=.02)
    assert (output[valid] < 0).mean() > .99
    assert np.isnan(output[~valid]).all()
    values[~valid] = 1e30
    np.testing.assert_array_equal(output, reduce_grain(values, valid, variance, strength=STRENGTH)[0])
    np.testing.assert_array_equal(original[valid], values[valid])
    np.testing.assert_array_equal(valid, mask)
    assert np.max(abs(output[valid]-original[valid])) <= 2*settings['used_sigma']


def test_fixed_highlight_curve_keeps_faint_mapping_and_bright_order():
    source = np.array([-2., 0., .01, .04, .3, 1., 2., 4.])
    before = source.copy()
    original = tone(source, 0, 1, softness=.3)
    mapped = tone(source, 0, 1, softness=.3, shoulder=True)
    np.testing.assert_array_equal(mapped[:4], original[:4])
    assert np.all(np.diff(mapped[1:]) > 0)
    assert np.all(original[-3:] == 1) and np.all(mapped[-3:] < 1)
    np.testing.assert_array_equal(source, before)


def test_live_pipeline_emits_separate_refinement_and_keeps_original_fits(tmp_path):
    from astropy.io import fits
    from app.processing.service import AstronomyProcessor
    from test_processing import make_observation, options
    inputs = [make_observation(tmp_path, i, wavelength_um=1+.005*i) for i in range(2)]
    for i, source in enumerate(inputs):
        with fits.open(source.fits_path, mode='update') as hdus:
            hdus['IMAGE'].data += np.random.default_rng(i).normal(0, .01, hdus['IMAGE'].data.shape)
    hashes = [hashlib.sha256(source.fits_path.read_bytes()).hexdigest() for source in inputs]
    destination = tmp_path / 'processed'
    manifest = AstronomyProcessor().process(inputs, options(), destination)
    assert all(frame.refinement for frame in manifest.frames)
    assert [hashlib.sha256(source.fits_path.read_bytes()).hexdigest() for source in inputs] == hashes
    for frame in manifest.frames:
        raw = (destination / (frame.frame_id+'.bin')).read_bytes(); count = len(raw)//5
        source_values = np.frombuffer(raw, '<f4', count=count)
        source_mask = np.frombuffer(raw, np.uint8, offset=count*4) == 1
        with fits.open(destination / (frame.frame_id+'.fits')) as hdus:
            np.testing.assert_array_equal(source_values[source_mask], np.flipud(hdus['IMAGE'].data).ravel()[source_mask])
        assert frame.refinement.input_raster_sha256 == frame.raster.sha256
        changed = frame.model_dump(mode='json'); changed['raster'] = changed['refinement']['raster']
        with pytest.raises(ValueError, match='observation raster'):
            Frame.model_validate(changed)
