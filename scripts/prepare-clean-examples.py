"""Add reproducible display estimates without changing any source raster or PNG.

Offline, bounded to the two reviewed bundles. Also usable after rebuilding their
warning rasters. The original FITS acquisition and source manifests stay intact.
"""
import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.examples import validate_bundle
from app.processing.gap_fill import POLICY, write_gap_fill


def prepare():
    for name in ('real-wise-0855', 'real-epsilon-indi-b'):
        bundle = ROOT / 'fixtures/real' / name
        validate_bundle(bundle)
        manifest = json.loads((bundle / 'manifest.json').read_text())
        lineage = json.loads((bundle / 'lineage.json').read_text())
        width, height = manifest['grid']['width_px'], manifest['grid']['height_px']
        scale = manifest['processing']['native_pixel_scale_arcsec'] / (manifest['requested_fov_arcmin'] * 60 / width)
        manifest['processing'] = {key: value for key, value in manifest['processing'].items() if not key.startswith('gap_fill_')}
        manifest['processing'].update(POLICY)
        for frame in manifest['frames']:
            raw = (bundle / (frame['frame_id'] + '.bin')).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == frame['raster']['sha256']
            count = width * height
            image = np.flipud(np.frombuffer(raw, '<f4', count=count).reshape(height, width))
            valid = np.flipud(np.frombuffer(raw, np.uint8, offset=count*4).reshape(height, width)) == 1
            filename = frame['frame_id'] + '-fill.bin'
            asset, fraction = write_gap_fill(bundle / filename, image, valid, scale)
            frame['gap_fill'] = {**asset, 'url': f'/v1/examples/{name}/frames/{filename}'} if asset else None
            frame['estimated_fraction'] = fraction
            if asset:
                lineage['files'][filename] = {key: asset[key] for key in ('sha256', 'size_bytes')}
                lineage.setdefault('gap_fill_revision', {})[frame['frame_id']] = {
                    'input_raster_sha256': frame['raster']['sha256'],
                    'method': POLICY['gap_fill_method'], 'estimated_fraction': fraction,
                }
            else:
                lineage['files'].pop(filename, None)
                lineage.get('gap_fill_revision', {}).pop(frame['frame_id'], None)
            print(name, frame['frame_id'], f'{fraction:.2%} estimated; {frame["masked_fraction"]:.2%} originally masked')
        (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        lineage['source_observations'] = [{k: v for k, v in f.items() if k not in {'image_url', 'raster', 'gap_fill', 'refinement'}} for f in manifest['frames']]
        data = (bundle / 'manifest.json').read_bytes()
        lineage['files']['manifest.json'] = {'sha256': hashlib.sha256(data).hexdigest(), 'size_bytes': len(data)}
        (bundle / 'lineage.json').write_text(json.dumps(lineage, indent=2) + '\n', encoding='utf-8')
        validate_bundle(bundle)


if __name__ == '__main__':
    prepare()
