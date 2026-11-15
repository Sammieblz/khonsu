import hashlib
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.processing.alignment import write_prepared_raster


def test_prepared_raster_preserves_negative_and_unclipped_values_and_orientation(tmp_path):
    values = np.array([[-3., 12000.], [np.nan, .125]], dtype=np.float32)
    valid = np.isfinite(values)
    path = tmp_path / 'frame.bin'
    record = write_prepared_raster(path, values, valid)
    raw = path.read_bytes()
    assert record['sha256'] == hashlib.sha256(raw).hexdigest()
    assert record['size_bytes'] == 20
    assert np.array_equal(np.frombuffer(raw[:16],dtype='<f4'), [0,.125,-3,12000])
    assert list(raw[16:]) == [0,1,1,1]


def test_cached_browser_assets_are_bounded_and_allowlisted():
    client = TestClient(app)
    response = client.get('/v1/examples')
    assert response.status_code == 200
    for example in response.json():
        count = example['grid']['width_px'] * example['grid']['height_px']
        for frame in example['frames']:
            raster = frame['raster']
            result = client.get(raster['url'])
            assert result.status_code == 200
            assert result.headers['content-type'] == 'application/octet-stream'
            assert len(result.content) == count * 5 == raster['size_bytes']
            assert hashlib.sha256(result.content).hexdigest() == raster['sha256']
            if frame['gap_fill']:
                fill = frame['gap_fill']
                estimates = client.get(fill['url'])
                assert estimates.status_code == 200
                assert len(estimates.content) == count * 5
                assert hashlib.sha256(estimates.content).hexdigest() == fill['sha256']
                quality = np.frombuffer(result.content, np.uint8, offset=count*4)
                mask = np.frombuffer(estimates.content, np.uint8, offset=count*4)
                assert not ((quality == 1) & (mask == 1)).any()
            if frame['refinement']:
                meta = frame['refinement']['raster']
                refined = client.get(meta['url'])
                assert refined.status_code == 200
                assert len(refined.content) == count * 5
                assert hashlib.sha256(refined.content).hexdigest() == meta['sha256']
                quality = np.frombuffer(result.content, np.uint8, offset=count*4)
                mask = np.frombuffer(refined.content, np.uint8, offset=count*4)
                assert np.array_equal(mask, quality == 1)
                assert frame['refinement']['input_raster_sha256'] == raster['sha256']
    assert client.get('/v1/examples/real-wise-0855/frames/unknown.bin').status_code == 404
