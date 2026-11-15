"""Exercise the real small bundles and fail closed on damaged local copies."""

import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import sys
import zlib

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from app import main
from app.retrieval.service import IrsaRetriever

REPOSITORY = Path(__file__).resolve().parents[3]
client = TestClient(main.app)


@pytest.fixture
def copied_bundles(tmp_path, monkeypatch):
    fixtures = tmp_path / 'fixtures'
    shutil.copytree(REPOSITORY / 'fixtures' / 'real', fixtures / 'real')
    monkeypatch.setattr(main, 'FIXTURES', fixtures)
    return fixtures


def rewrite_inventory(bundle, name):
    path = bundle / name
    lineage_path = bundle / 'lineage.json'
    lineage = json.loads(lineage_path.read_text())
    lineage['files'][name] = {'size_bytes': path.stat().st_size,
                             'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    lineage_path.write_text(json.dumps(lineage))


def test_cached_fields_load_without_any_archive_requests(copied_bundles, monkeypatch):
    async def no_archive(*args, **kwargs):
        raise AssertionError('A cached example must never contact IRSA')
    monkeypatch.setattr(IrsaRetriever, 'search', no_archive)
    monkeypatch.setattr(IrsaRetriever, 'retrieve', no_archive)
    response = client.get('/v1/examples')
    assert response.status_code == 200
    examples = response.json()
    assert [item['sequence_id'] for item in examples] == ['real-wise-0855', 'real-epsilon-indi-b']
    assert [len(item['frames']) for item in examples] == [3, 2]
    for example in examples:
        assert example['data_mode'] == 'cached-real'
        assert 'not a live result' in example['disclosure']
        assert example['grid']['wcs_header']
        assert example['processing']['cache_acquired_at_utc'].startswith('2026-11-14T')
        bundle = copied_bundles / 'real' / example['sequence_id']
        lineage = json.loads((bundle / 'lineage.json').read_text())
        for frame in example['frames']:
            asset = client.get(frame['image_url'])
            name = frame['image_url'].rsplit('/', 1)[-1]
            assert asset.status_code == 200
            assert hashlib.sha256(asset.content).hexdigest() == lineage['files'][name]['sha256']
            assert asset.content == (bundle / name).read_bytes()
            assert frame['source_fits_url'].startswith('https://irsa.ipac.caltech.edu/')
            assert frame['observed_start_utc'] < '2026-11-14T'
    assert client.get('/v1/examples/real-wise-0855/frames/lineage.json').status_code == 404
    assert client.get('/v1/examples/real-wise-0855/frames/..%5Cmanifest.json').status_code == 404


@pytest.mark.parametrize('damage', ['missing_manifest', 'missing_png', 'changed_bytes', 'wrong_dimensions',
                                  'corrupt_png', 'oversized_png_header', 'mask_mismatch', 'manifest_mismatch',
                                  'source_manifest_mismatch', 'lineage_mismatch', 'external_asset_url'])
def test_damaged_example_is_explicit_and_does_not_select_another_field(copied_bundles, damage):
    bundle = copied_bundles / 'real' / 'real-wise-0855'
    manifest_path = bundle / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    name = manifest['frames'][0]['frame_id'] + '.png'
    asset = bundle / name
    if damage == 'missing_manifest':
        manifest_path.unlink()
    elif damage == 'missing_png':
        asset.unlink()
    elif damage == 'changed_bytes':
        asset.write_bytes(asset.read_bytes() + b'changed')
    elif damage == 'wrong_dimensions':
        Image.new('RGBA', (1, 1)).save(asset)
        rewrite_inventory(bundle, name)
    elif damage == 'mask_mismatch':
        with Image.open(asset) as image:
            pixels = image.copy()
        pixels.putalpha(17)
        pixels.save(asset)
        rewrite_inventory(bundle, name)
    elif damage == 'corrupt_png':
        asset.write_bytes(b'not an image')
        rewrite_inventory(bundle, name)
    elif damage == 'oversized_png_header':
        data = bytearray(asset.read_bytes())
        data[16:24] = struct.pack('>II', 100000, 100000)
        data[29:33] = struct.pack('>I', zlib.crc32(data[12:29]))
        asset.write_bytes(data)
        rewrite_inventory(bundle, name)
    elif damage in {'manifest_mismatch', 'external_asset_url'}:
        if damage == 'manifest_mismatch':
            manifest['frames'][0]['observed_start_utc'] = '2025-01-01T00:00:00Z'
        else:
            manifest['frames'][0]['image_url'] = 'https://example.invalid/unrelated.png'
        manifest_path.write_text(json.dumps(manifest))
        rewrite_inventory(bundle, 'manifest.json')
    elif damage == 'source_manifest_mismatch':
        source_path = bundle / 'source-manifest.json'
        source = json.loads(source_path.read_text())
        source['display']['vmax'] += 1
        source_path.write_text(json.dumps(source))
        rewrite_inventory(bundle, 'source-manifest.json')
    else:
        lineage_path = bundle / 'lineage.json'
        lineage = json.loads(lineage_path.read_text())
        lineage['source_observations'][0]['observation_id'] = 'unrelated-source'
        lineage_path.write_text(json.dumps(lineage))
    response = client.get('/v1/examples')
    assert response.status_code == 503
    assert response.json()['code'] == 'CACHED_EXAMPLE_UNAVAILABLE'
    assert 'no substitute data was loaded' in response.json()['message']
    assert client.get('/v1/examples/real-wise-0855/frames/' + name).status_code == 503


def test_empty_catalog_works_without_the_optional_image_libraries(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'FIXTURES', tmp_path)
    monkeypatch.setitem(sys.modules, 'PIL', None)
    assert client.get('/v1/examples').json() == []


def test_cached_assets_remain_separate_from_synthetic_development_fixture():
    assert client.get('/v1/demo/manifest').json()['data_mode'] == 'synthetic'
    assert client.get('/v1/examples/real-wise-0855/frames/frame-01.svg').status_code == 404


def test_legacy_binary_masks_remain_readable_and_warning_counts_fail_closed(copied_bundles):
    import numpy as np
    from app.examples import validate_bundle, CachedExampleError
    bundle = copied_bundles/'real'/'real-wise-0855'
    payload = json.loads((bundle/'manifest.json').read_text())
    lineage = json.loads((bundle/'lineage.json').read_text())
    frame = payload['frames'][0]
    filename = frame['frame_id']+'.bin'
    raw = bytearray((bundle/filename).read_bytes()); count = len(raw)//5
    values = np.frombuffer(raw, '<f4', count=count)
    quality = np.frombuffer(raw, np.uint8, offset=count*4)
    values[quality == 2] = 0; quality[quality == 2] = 0
    (bundle/filename).write_bytes(raw)
    frame['raster']['encoding'] = 'float32-le-mask8-v1'
    frame['raster']['sha256'] = hashlib.sha256(raw).hexdigest()
    frame['warning_fraction'] = 0
    lineage['source_observations'][0]['warning_fraction'] = 0
    (bundle/'manifest.json').write_text(json.dumps(payload))
    (bundle/'lineage.json').write_text(json.dumps(lineage))
    rewrite_inventory(bundle,filename);rewrite_inventory(bundle,'manifest.json')
    assert validate_bundle(bundle).frames[0].raster.encoding == 'float32-le-mask8-v1'
    payload['frames'][1]['warning_fraction'] = 0
    lineage = json.loads((bundle/'lineage.json').read_text())
    lineage['source_observations'][1]['warning_fraction'] = 0
    lineage['quality_revision'][payload['frames'][1]['frame_id']]['warning_fraction'] = 0
    (bundle/'manifest.json').write_text(json.dumps(payload));(bundle/'lineage.json').write_text(json.dumps(lineage))
    rewrite_inventory(bundle,'manifest.json')
    with pytest.raises(CachedExampleError, match='warning fraction'):
        validate_bundle(bundle)


@pytest.mark.parametrize('damage', [None, 'invented_acquisition_time', 'corrupt_source_png'])
def test_packaging_preserves_real_bytes_and_publishes_only_valid_bundles(tmp_path, damage):
    specification = importlib.util.spec_from_file_location('package_example', REPOSITORY / 'scripts' / 'package-real-example.py')
    script = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(script)
    bundle = REPOSITORY / 'fixtures' / 'real' / 'real-wise-0855'
    source = json.loads((bundle / 'source-manifest.json').read_text())
    record = json.loads((bundle / 'acquisition-record.json').read_text())
    record['manifest'] = source
    report = tmp_path / 'probe-report.json'
    report.write_text(json.dumps({'targets': [record]}))
    assets = tmp_path / 'source-assets'
    shutil.copytree(bundle, assets)
    acquired = record['processing_timestamp_utc']
    if damage == 'invented_acquisition_time':
        acquired = '2026-11-15T00:00:00Z'
    if damage == 'corrupt_source_png':
        (assets / (source['frames'][0]['frame_id'] + '.png')).write_bytes(b'not a prepared PNG')
    output = tmp_path / 'fixtures' / 'real'
    arguments = (assets / 'source-manifest.json', assets, output, 'verified-copy',
                 'Copy of the verified WISE field', acquired, 'actual captured probe record', report)
    if damage:
        with pytest.raises(ValueError):
            script.package(*arguments)
        assert not (output / 'verified-copy').exists()
        assert not list(output.glob('*/manifest.json'))
    else:
        destination = script.package(*arguments)
        from app.examples import validate_bundle
        actual = validate_bundle(destination)
        assert actual.data_mode == 'cached-real'
        assert [str(frame.observation_id) for frame in actual.frames] == [frame['observation_id'] for frame in source['frames']]
        for frame in actual.frames:
            name = frame.frame_id + '.png'
            assert (destination / name).read_bytes() == (bundle / name).read_bytes()
