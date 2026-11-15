"""Offline native refinement of the five reviewed cached observations.

Use prepare-quality-examples.py --download only if its bounded inputs are absent.
This script verifies their recorded hashes and adds no observations or coverage.
"""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from astropy import log
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.examples import validate_bundle
from app.interfaces import ObservationInput
from app.processing.alignment import reproject_observation
from app.processing.fits_reader import read_observation
from app.processing.refinement import POLICY, prepare_refinement, write_refinement


def load_source(bundle, manifest, frame, lineage):
    record = lineage['quality_revision'][frame['frame_id']]
    path = (ROOT / record['raw_cache']).resolve()
    if not path.is_relative_to(ROOT / '.cache') or path.stat().st_size > 16 * 1024**2:
        raise ValueError('Unexpected source path or size')
    if hashlib.sha256(path.read_bytes()).hexdigest() != record['raw_sha256']:
        raise ValueError('Native source checksum mismatch')
    source = ObservationInput(path, frame['observation_id'],
        datetime.fromisoformat(frame['observed_start_utc'].replace('Z', '+00:00')),
        datetime.fromisoformat(frame['observed_end_utc'].replace('Z', '+00:00')),
        frame['detector'], frame['release'], frame['source_fits_url'])
    return read_observation(source, manifest['target']['ra_deg'], manifest['target']['dec_deg'])


def main():
    log.setLevel('WARNING')
    for name in ('real-wise-0855', 'real-epsilon-indi-b'):
        bundle = ROOT / 'fixtures/real' / name
        validate_bundle(bundle)
        manifest = json.loads((bundle / 'manifest.json').read_text())
        lineage = json.loads((bundle / 'lineage.json').read_text())
        size = manifest['grid']['width_px']
        wcs = WCS(manifest['grid']['wcs_header'])
        for frame in manifest['frames']:
            loaded = load_source(bundle, manifest, frame, lineage)
            baseline, valid = reproject_observation(loaded, wcs, size)
            raw = (bundle / (frame['frame_id'] + '.bin')).read_bytes()
            original = np.flipud(np.frombuffer(raw, '<f4', count=size*size).reshape(size, size))
            mask = np.flipud(np.frombuffer(raw, np.uint8, offset=size*size*4).reshape(size, size)) == 1
            if not np.array_equal(valid, mask) or not np.allclose(original[valid], baseline[valid], atol=1e-6, rtol=0):
                raise ValueError('Native input does not reproduce the unchanged original')
            filename = frame['frame_id'] + '-refined.bin'
            meta = write_refinement(bundle / filename, prepare_refinement(loaded, wcs, size, valid), valid, frame['raster']['sha256'])
            if meta is None:
                raise ValueError('Reviewed cached observation lacks a usable noise estimate')
            meta['raster']['url'] = f'/v1/examples/{name}/frames/{filename}'
            frame['refinement'] = meta
            lineage['files'][filename] = {key: meta['raster'][key] for key in ('size_bytes', 'sha256')}
            lineage.setdefault('refinement_revision', {})[frame['frame_id']] = {
                'settings': {key: value for key, value in meta.items() if key != 'raster'},
                'raw_sha256': lineage['quality_revision'][frame['frame_id']]['raw_sha256'],
            }
            print(name, frame['frame_id'], meta['noise_sigma_mjy_sr'], flush=True)
        manifest['processing'].update(POLICY)
        data = (json.dumps(manifest, indent=2) + '\n').encode()
        (bundle / 'manifest.json').write_bytes(data)
        lineage['files']['manifest.json'] = {'sha256': hashlib.sha256(data).hexdigest(), 'size_bytes': len(data)}
        (bundle / 'lineage.json').write_text(json.dumps(lineage, indent=2) + '\n', encoding='utf-8')
        validate_bundle(bundle)


if __name__ == '__main__':
    main()
