"""Scientific controls for the isolated reconstruction experiment."""
import numpy as np
import pytest

from app.processing.resolution import DropPlane, compatibility, drizzle, overlap, sample_masked, tone


def corners(shape, scale=1, shift=(0, 0)):
    y, x = np.indices(shape, dtype=float)
    offsets = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]])
    return (np.stack((x, y), axis=-1)[..., None, :] + offsets) * scale + shift


def records():
    return [dict(observation_id=str(i), detector=2, release='DR1',
                 observed_start_utc=f'2026-07-10T0{i}:00:00Z', observed_end_utc=f'2026-07-10T0{i}:02:00Z',
                 wavelength_um=1.4, bandwidth_um=.03, target_detector_pixel=phase)
            for i, phase in enumerate([(20., 20.), (20.4, 20.), (20., 20.4), (20.4, 20.4)])]


def test_constant_surface_brightness_and_variance_are_not_scaled_as_flux_per_pixel():
    data = np.full((8, 8), 7.)
    original = data.copy()
    planes = [DropPlane(data, np.full_like(data, 4), np.ones_like(data, dtype=bool), corners(data.shape)) for _ in range(4)]
    image, valid, variance, _, count = drizzle(planes, (8, 8), pixfrac=1)
    assert valid.all()
    np.testing.assert_allclose(image, 7.)
    np.testing.assert_allclose(variance, 1.)
    assert np.all(count == 4)
    np.testing.assert_array_equal(data, original)
    image, valid, *_ = drizzle([DropPlane(data, np.ones_like(data), np.ones_like(data, dtype=bool), corners(data.shape, 2))], (16, 16))
    np.testing.assert_allclose(image[valid], 7.)


def test_unobserved_cells_stay_invalid_and_variance_invalidates_inputs():
    shape = (7, 7)
    good = np.ones(shape, dtype=bool)
    good[3, 3] = False
    variance = np.ones(shape)
    variance[2, 2] = 0
    result = drizzle([DropPlane(np.ones(shape), variance, good, corners(shape))], shape, pixfrac=1)
    assert not result[1][3, 3] and not result[1][2, 2]
    assert np.isnan(result[0][3, 3]) and result[4][3, 3] == 0


def test_polygon_overlap_handles_rotation_and_translation():
    square = np.array([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]])
    assert overlap(square, 0, 0) == pytest.approx(1.)
    assert overlap(square + [.5, 0], 0, 0) == pytest.approx(.5)
    theta = .4
    rotated = square @ np.array([[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]])
    assert sum(overlap(rotated, x, y) for y in range(-2, 3) for x in range(-2, 3)) == pytest.approx(1.)


def test_known_subpixel_offsets_preserve_source_position_and_surface_brightness_integral():
    # Four phases of an already pixel-convolved, undersampled point source.
    shape = (17, 17)
    yy, xx = np.indices(shape, dtype=float)
    planes = []
    for dx, dy in [(0, 0), (.5, 0), (0, .5), (.5, .5)]:
        values = np.exp(-((xx+dx-8.2)**2 + (yy+dy-8.1)**2)/(2*.8**2))
        planes.append(DropPlane(values, np.ones(shape), np.ones(shape, dtype=bool), corners(shape, 2, (2*dx, 2*dy))))
    image, valid, *_ = drizzle(planes, (34, 34), pixfrac=.5)
    y, x = np.indices(image.shape)
    weights = np.where(valid, image, 0)
    assert np.sum(weights*x)/np.sum(weights)/2 == pytest.approx(8.2, abs=.035)
    assert np.sum(weights*y)/np.sum(weights)/2 == pytest.approx(8.1, abs=.035)
    assert np.sum(weights)/4 == pytest.approx(2*np.pi*.8**2, rel=.025)


def test_cubic_is_bounded_preserves_constant_sky_and_does_not_fill_masks():
    values = np.full((9, 9), 3.)
    values[4, 4] = 90
    valid = np.ones_like(values, dtype=bool)
    valid[2, 2] = False
    y, x = np.mgrid[0:8:81j, 0:8:81j]
    image, good = sample_masked(values, valid, x, y, cubic=True)
    assert np.nanmin(image) >= 3-1e-12 and np.nanmax(image) <= 90+1e-12
    assert not good[20, 20] and np.isnan(image[20, 20])
    np.testing.assert_allclose(image[60:, 60:], 3.)
    values[:] = 3
    image, good = sample_masked(values, valid, x, y, cubic=True)
    np.testing.assert_allclose(image[good], 3.)


def test_display_shoulder_preserves_bright_value_order_instead_of_clipping():
    values = np.array([0, .1, .5, 1, 2, 4.])
    assert np.all(np.diff(tone(values, 0, 1, shoulder=True)) > 0)
    assert np.all(tone(values, 0, 1)[3:] == 1)
    np.testing.assert_array_equal(values, [0, .1, .5, 1, 2, 4.])


def test_compatibility_requires_real_independent_near_time_spectral_and_phase_evidence():
    rows = records()
    assert compatibility(rows) is None
    rows[1]['observation_id'] = rows[0]['observation_id']
    assert 'Duplicate' in compatibility(rows)
    rows = records()
    rows[1]['wavelength_um'] = 1.44
    assert 'wavelength' in compatibility(rows)
    rows = records()
    rows[-1]['observed_end_utc'] = '2026-09-10T03:00:00Z'
    assert 'time window' in compatibility(rows)
    rows = records()
    for row in rows:
        row['target_detector_pixel'] = [20, 20]
    assert 'diversity' in compatibility(rows)
    rows = records()
    rows[0]['detector'] = 3
    assert 'Detector' in compatibility(rows)


def test_rejects_unbounded_reconstruction():
    with pytest.raises(ValueError):
        drizzle([], (100, 100))
    with pytest.raises(ValueError):
        drizzle([None], (4096, 4096))
