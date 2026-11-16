import numpy as np
import pytest
from app.processing.gap_fill import estimate_gaps, write_gap_fill


def test_planar_background_is_recovered_without_changing_inputs():
    y, x = np.indices((64, 64))
    truth = (x + 2*y).astype(float)
    valid = np.ones(truth.shape, bool)
    valid[25:35, 26:33] = False  # The screenshot's 7 by 10 pixel shape.
    broken = np.where(valid, truth, np.nan)
    before = broken.copy()
    values, estimated = estimate_gaps(broken, valid)
    np.testing.assert_allclose(values[estimated], truth[estimated], atol=1e-5)
    np.testing.assert_array_equal(estimated, ~valid)
    np.testing.assert_array_equal(broken, before)
    assert not values[valid].any()


def test_broad_holes_and_long_diagonal_coverage_stay_unknown():
    rng = np.random.default_rng(66)
    image = rng.normal(0, .1, (128, 128))
    valid = np.ones(image.shape, bool)
    valid[0:12, 5:25] = False
    valid[30:50, 30:50] = False
    for i in range(20):
        valid[70+i, 70+i] = False
    _, estimated = estimate_gaps(image, valid)
    assert not estimated.any()


def test_small_edge_notches_use_observed_neighbors_and_preserve_signed_values():
    image = np.full((64, 64), -7.0)
    valid = np.ones_like(image, bool)
    valid[0:3, 0:3] = False
    valid[20:28, 0:6] = False
    valid[35:38, -2:] = False
    before = valid.copy()
    values, estimated = estimate_gaps(image, valid)
    np.testing.assert_array_equal(estimated, ~valid)
    np.testing.assert_array_equal(values[estimated], -7)
    np.testing.assert_array_equal(valid, before)
    np.testing.assert_array_equal(image, -7)


def test_bright_boundary_can_fill_but_cannot_recover_a_hidden_peak():
    from scipy.ndimage import binary_dilation
    y, x = np.indices((64, 64))
    truth = 100*np.exp(-((x-32)**2+(y-32)**2)/18)
    valid = np.ones_like(truth, bool); valid[30:35, 30:35] = False
    image = np.where(valid, truth, np.nan)
    boundary = binary_dilation(~valid) & valid
    values, estimated = estimate_gaps(image, valid)
    np.testing.assert_array_equal(estimated, ~valid)
    assert values[estimated].min() >= truth[boundary].min()-1e-5
    assert values[estimated].max() <= truth[boundary].max()+1e-5
    assert values[estimated].max() < truth[~valid].max()
    np.testing.assert_array_equal(image[valid], truth[valid])


def test_total_estimation_budget_is_still_ten_percent():
    image = np.ones((64, 64))
    valid = np.ones_like(image, bool); valid[2::3, 2::3] = False
    values, estimated = estimate_gaps(image, valid)
    assert 0 < estimated.sum() <= int(image.size*.1)
    assert (~valid & ~estimated).any()
    assert not (estimated & valid).any()
    np.testing.assert_array_equal(values[estimated], 1)


def test_estimates_are_bounded_by_neighbors_and_single_frame_deterministic():
    image = np.random.default_rng(42).normal(0, 1, (64, 64))
    valid = np.ones(image.shape, bool)
    valid[20:24, 20:24] = False
    first, mask = estimate_gaps(image, valid)
    altered = image.copy()
    altered[~valid] = 1e30  # Rejected samples must never influence the estimate.
    second, _ = estimate_gaps(altered, valid)
    np.testing.assert_array_equal(first, second)
    assert mask.sum() == 16
    assert first[mask].min() >= image[19:25, 19:25][valid[19:25, 19:25]].min()
    assert first[mask].max() <= image[19:25, 19:25][valid[19:25, 19:25]].max()


def test_empty_missing_native_limits_and_resource_bounds():
    image = np.zeros((64, 64))
    assert not estimate_gaps(image, np.zeros_like(image, bool))[1].any()
    assert not estimate_gaps(image, np.ones_like(image, bool))[1].any()
    valid = np.ones_like(image, bool)
    valid[20:29, 20:29] = False
    assert not estimate_gaps(image, valid, pixels_per_native=1)[1].any()
    with pytest.raises(ValueError):
        estimate_gaps(image, valid, pixels_per_native=0)
    with pytest.raises(ValueError):
        estimate_gaps(np.zeros((2049, 1)), np.ones((2049, 1), bool))


def test_estimate_asset_is_separate_and_top_left(tmp_path):
    image = np.ones((32, 32), dtype=float)
    valid = np.ones_like(image, bool)
    valid[6:8, 10:12] = False
    path = tmp_path / 'fill.bin'
    asset, fraction = write_gap_fill(path, image, valid, 2)
    assert asset['encoding'] == 'float32-le-estimate8-v1'
    assert fraction == 4/1024
    data = path.read_bytes()
    mask = np.frombuffer(data, np.uint8, offset=32*32*4).reshape(32, 32)
    np.testing.assert_array_equal(mask, np.flipud(~valid))
