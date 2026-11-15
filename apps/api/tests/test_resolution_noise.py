"""Controls for reversible display denoising, not calibrated photometry."""
import importlib.util
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.processing.resolution import reduce_grain


def test_noise_reduction_reduces_known_background_error_without_filling_holes():
    rng = np.random.default_rng(576)
    values = .2+rng.normal(0, .03, (96, 96))
    valid = rng.random(values.shape) > .03
    valid[35:50, 30:48] = False
    values[~valid] = np.nan
    original, original_mask = values.copy(), valid.copy()
    filtered, settings = reduce_grain(values, valid, np.full_like(values, .03**2))
    assert np.sqrt(np.mean((filtered[valid]-.2)**2)) < .72*np.sqrt(np.mean((values[valid]-.2)**2))
    assert np.array_equal(np.isfinite(filtered), valid)
    np.testing.assert_array_equal(values, original)
    np.testing.assert_array_equal(valid, original_mask)
    assert np.max(abs(filtered[valid]-values[valid])) <= 2*settings['used_sigma']


def test_bright_source_position_and_aperture_survive_with_bounded_changes():
    rng = np.random.default_rng(57)
    y, x = np.indices((96, 96), dtype=float)
    truth = 1.5*np.exp(-((x-47.2)**2+(y-48.1)**2)/(2*.85**2))
    values = .2+truth+rng.normal(0, .015, truth.shape)
    filtered, _ = reduce_grain(values, np.ones_like(values, dtype=bool), np.full_like(values, .015**2))
    aperture = (x-47.2)**2+(y-48.1)**2 <= 4**2
    def centroid(image):
        weight = np.maximum(0, image-.2)*aperture
        return np.array([np.sum(weight*x), np.sum(weight*y)])/np.sum(weight)
    assert np.linalg.norm(centroid(filtered)-centroid(values)) < .04
    assert np.sum(filtered[aperture]-.2) == pytest.approx(np.sum(values[aperture]-.2), rel=.03)
    assert np.max(filtered) == pytest.approx(np.max(values), rel=.01)


def test_filter_is_invariant_to_masked_values_and_does_not_pull_gaps_to_zero():
    rng = np.random.default_rng(12)
    values = 50+rng.normal(0, .02, (24, 24))
    valid = np.ones_like(values, dtype=bool)
    valid[8:16, 8:16] = False
    variance = np.full_like(values, .02**2)
    one, _ = reduce_grain(values, valid, variance)
    values[~valid] = 1e30
    two, _ = reduce_grain(values, valid, variance)
    np.testing.assert_array_equal(one, two)
    assert np.min(two[valid]) > 49.9


def test_no_strength_and_constant_or_missing_data_have_explicit_results():
    values = np.full((12, 12), -2.)
    valid = np.ones_like(values, dtype=bool)
    variance = np.ones_like(values)
    filtered, _ = reduce_grain(values, valid, variance)
    np.testing.assert_array_equal(filtered, values)
    values[5, 5] = 19
    filtered, _ = reduce_grain(values, valid, variance, strength=0)
    np.testing.assert_array_equal(filtered, values)
    filtered, settings = reduce_grain(values, ~valid, variance)
    assert np.isnan(filtered).all() and settings['used_sigma'] == 0


def test_invalid_variance_shapes_and_strength_are_rejected():
    values = np.ones((4, 4))
    valid = np.ones_like(values, dtype=bool)
    for variance, strength in [(np.zeros_like(values), .5), (values, 2), (values, float('nan')), (np.ones((2, 2)), .5)]:
        with pytest.raises(ValueError):
            reduce_grain(values, valid, variance, strength=strength)


def test_png_alpha_preserves_unknown_pixels_and_valid_measured_black(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('resolution_experiment', Path(__file__).resolve().parents[3] / 'scripts/experiment-resolution.py')
    experiment = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(experiment)
    monkeypatch.setattr(experiment, 'OUTPUT', tmp_path)
    values = np.array([[0., .5], [1000., .9]])
    valid = np.array([[True, True], [False, True]])
    experiment.save_view('control', values, valid, (0, 1))
    for path in tmp_path.glob('*.png'):
        image = np.flipud(np.asarray(Image.open(path)))
        np.testing.assert_array_equal(image[..., 3] == 255, valid)
        assert np.all(image[0, 0, :3] == 0) and image[0, 0, 3] == 255
        assert np.all(image[1, 0] == 0)
