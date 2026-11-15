"""Synthetic controls only: no real source resolution or detection is asserted."""
from copy import deepcopy
import numpy as np
import pytest
from app.processing.composites import EpochPlane, epoch_coadd, epoch_compatibility, subtract_zodi


def records():
    return [dict(observation_id=f'synthetic-{i}', detector=1, release='DR1', wavelength_um=1., bandwidth_um=.04,
                 observed_start_utc=f'2026-01-01T00:0{i}:00Z', observed_end_utc=f'2026-01-01T00:0{i}:30Z') for i in range(2)]


def test_coadd_reduces_independent_noise_and_fills_only_measured_gaps():
    rng = np.random.default_rng(64)
    planes = [EpochPlane(5+rng.normal(0, 1, (128, 128)), np.ones((128, 128)), np.ones((128, 128), bool),
                         np.ones((128, 128)), np.full((128, 128), .04)) for _ in range(2)]
    planes[0].valid[0, :2] = False; planes[1].valid[0, 0] = False
    planes[0].values[0, :2] = 1e9
    image, good, variance, weight, count, meta = epoch_coadd(records(), planes)
    assert not good[0, 0] and np.isnan(image[0, 0]) and count[0, 0] == 0
    assert image[0, 1] == planes[1].values[0, 1] and count[0, 1] == 1
    assert np.std(image[1:]-5) < .76 and np.mean(image[1:]) == pytest.approx(5, abs=.02)
    assert np.all(variance[1:] == .5) and np.all(weight[1:] == 2)
    assert meta['observed_end_utc'].startswith('2026-01-01T00:01:30')
    planes[1].wavelength[:, 10] = 1.02
    assert not epoch_coadd(records(), planes)[1][:, 10].any()


def test_time_wave_release_and_duplicate_gates_prevent_false_epochs():
    for mutate, reason in [(lambda r:r[1].update(observed_start_utc='2026-03-01T00:00:00Z', observed_end_utc='2026-03-01T00:01:00Z'), 'window'),
                           (lambda r:r[1].update(wavelength_um=1.02), 'wavelength'),
                           (lambda r:r[1].update(release='QR3'), 'release'),
                           (lambda r:r[1].update(observation_id=r[0]['observation_id']), 'Duplicate')]:
        r = deepcopy(records()); mutate(r)
        assert reason in epoch_compatibility(r)


def test_background_subtraction_preserves_gaps_signed_values_and_input():
    source = np.array([[3., 2.], [8., 4.]])
    valid = np.array([[True, False], [True, True]])
    original = source.copy()
    corrected, good = subtract_zodi(source, valid, np.array([[5., 1.], [np.nan, 1.]]))
    assert corrected[0, 0] == -2 and corrected[1, 1] == 3
    assert not good[0, 1] and not good[1, 0]
    assert np.array_equal(source, original)
