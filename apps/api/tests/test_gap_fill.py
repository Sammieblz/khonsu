import numpy as np
import pytest
from app.processing.gap_fill import estimate_gaps, write_gap_fill


def test_planar_background_is_recovered_without_changing_inputs():
    y, x = np.indices((64, 64))
    truth = (x + 2*y).astype(float)
    valid = np.ones(truth.shape, bool)
    valid[25:29, 26:30] = False
    broken = np.where(valid, truth, np.nan)
    before = broken.copy()
    values, estimated = estimate_gaps(broken, valid)
    np.testing.assert_allclose(values[estimated], truth[estimated], atol=1e-5)
    np.testing.assert_array_equal(estimated, ~valid)
    np.testing.assert_array_equal(broken, before)
    assert not values[valid].any()


def test_edges_large_holes_diagonal_coverage_and_bright_cores_stay_unknown():
    rng = np.random.default_rng(66)
    image = rng.normal(0, .1, (128, 128))
    valid = np.ones(image.shape, bool)
    valid[0:3, 5:8] = False
    valid[30:50, 30:50] = False
    for i in range(10):
        valid[70+i, 70+i] = False
    image[90:98, 90:98] = 20
    valid[92:96, 92:96] = False
    _, estimated = estimate_gaps(image, valid)
    assert not estimated.any()


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
    valid[20:25, 20:25] = False
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
