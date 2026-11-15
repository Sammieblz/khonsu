"""Resource and grid regressions for wide-field display, with synthetic inputs."""
from dataclasses import replace
import numpy as np
import pytest
from astropy.io import fits
from PIL import Image
from pydantic import ValidationError

from app.limits import MAX_GRID_SIDE, MAX_RASTER_BYTES
from app.schemas import SequenceRequest
from app.processing.service import AstronomyProcessor
from app.processing.errors import ProcessingError
from test_processing import make_observation, options


def test_wide_field_request_boundary_and_hd_raster_contract():
    assert SequenceRequest(ra_deg=0, dec_deg=0, fov_arcmin=120).fov_arcmin == 120
    with pytest.raises(ValidationError):
        SequenceRequest(ra_deg=0, dec_deg=0, fov_arcmin=120.1)


def test_hd_grid_preserves_fits_values_mask_and_source_lineage(tmp_path):
    # This deliberately enlarges a small synthetic field to verify transport,
    # not to claim that enlarging it reveals any additional native detail.
    sources = [make_observation(tmp_path, 0, defects=True), make_observation(tmp_path, 1)]
    dest = tmp_path / 'hd'
    manifest = AstronomyProcessor().process(sources, replace(options(), output_size_px=1080), dest)
    assert manifest.grid.width_px == 1080
    assert [f.observation_id for f in manifest.frames] == [s.observation_id for s in sources]
    for frame in manifest.frames:
        raw = (dest / (frame.frame_id + '.bin')).read_bytes()
        assert frame.raster.size_bytes == len(raw) == 1080**2 * 5 <= MAX_RASTER_BYTES
        values = np.frombuffer(raw, dtype='<f4', count=1080**2).reshape(1080,1080)
        valid = np.frombuffer(raw, dtype=np.uint8, offset=1080**2*4).reshape(1080,1080)
        with fits.open(dest / (frame.frame_id + '.fits')) as hdus:
            np.testing.assert_array_equal(valid, np.flipud(hdus['VALID'].data))
            np.testing.assert_allclose(values[valid>0], np.flipud(hdus['IMAGE'].data)[valid>0])
        with Image.open(dest / (frame.frame_id + '.png')) as png:
            np.testing.assert_array_equal(np.asarray(png.getchannel('A'))>0, valid>0)


def test_total_pixel_budget_still_rejects_too_many_large_frames(tmp_path):
    sources = [make_observation(tmp_path, i) for i in range(7)]
    with pytest.raises(ProcessingError, match='fewer frames') as caught:
        AstronomyProcessor().process(sources, replace(options(), output_size_px=MAX_GRID_SIDE), tmp_path/'too-big')
    assert caught.value.code == 'RESOURCE_LIMIT'
    assert not (tmp_path/'too-big').exists()
