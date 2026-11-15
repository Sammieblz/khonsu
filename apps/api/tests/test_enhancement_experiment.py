"""Analytic controls for the offline research script, not API restoration."""
import importlib.util
from pathlib import Path

import numpy as np
from scipy.ndimage import convolve

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('enhancement_experiment', ROOT / 'scripts/experiment-enhancement.py')
experiment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(experiment)


def test_fourier_kernel_origin_matches_an_asymmetric_spatial_convolution():
    kernel = np.array([[0., .1, 0], [.2, .4, 0], [0, .3, 0]])
    image = np.zeros((32, 32))
    image[16, 16] = 1
    transformed = np.fft.ifft2(np.fft.fft2(image) * experiment.otf(kernel, image.shape)).real
    np.testing.assert_allclose(transformed, convolve(image, kernel, mode='wrap'), atol=1e-14)


def test_restoration_preserves_a_constant_with_masked_input():
    values = np.full((32, 32), 3.)
    valid = np.ones(values.shape, dtype=bool)
    valid[14:17, 14:17] = False
    kernel = experiment.BINOMIAL
    np.testing.assert_allclose(experiment.wiener(values, valid, kernel)[valid], 3., atol=1e-12)
    np.testing.assert_allclose(experiment.richardson_lucy(values, valid, kernel, 5)[valid], 3., atol=1e-12)


def test_known_blur_restoration_improves_controlled_synthetic_truth():
    yy, xx = np.mgrid[:48, :48]
    truth = .3 + 2 * np.exp(-((xx-23.2)**2 + (yy-25.1)**2) / (2*.8**2))
    observed = convolve(truth, experiment.BINOMIAL, mode='reflect')
    observed += np.random.default_rng(49).normal(0, .002, truth.shape)
    valid = np.ones(truth.shape, dtype=bool)
    baseline = np.mean((observed-truth)**2)
    for output in [experiment.wiener(observed, valid, experiment.BINOMIAL),
                   experiment.richardson_lucy(observed, valid, experiment.BINOMIAL, 5)]:
        assert np.isfinite(output).all()
        assert np.mean((output-truth)**2) < baseline


def test_detail_preserves_input_and_avoids_mask_neighborhoods():
    values = np.full((15, 15), 3.)
    values[7, 7] = 20.
    valid = np.ones(values.shape, dtype=bool)
    original = values.copy()
    output = experiment.detail_display(values, valid, 10, .5)
    assert output[7, 7] > values[7, 7]
    assert np.max(np.abs(output-values)) <= .40000001
    np.testing.assert_array_equal(original, values)
    valid[7, 6] = False
    assert experiment.detail_display(values, valid, 10, .5)[7, 7] == values[7, 7]
