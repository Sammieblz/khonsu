"""Upgrade the two reviewed examples with auditable warning-only display samples.

Original PNGs, source manifests, acquisition records, strict intensities and
timestamps remain unchanged. --download permits at most five fixed IRSA cutouts
(16 MiB each, 80 MiB total, 300 seconds); cached inputs are preferred.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'apps/api'))
from app.examples import validate_bundle
from app.interfaces import ObservationInput
from app.processing.fits_reader import read_observation
from app.processing.alignment import reproject_quality, write_prepared_raster
from app.retrieval.service import IrsaRetriever, _ByteBudget


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    retriever = IrsaRetriever(timeout_seconds=25, deadline_seconds=300)
    retriever._deadline = time.monotonic()+300
    budget = _ByteBudget(limit=80*1024*1024)
    cache = ROOT/'.cache/quality'; cache.mkdir(exist_ok=True)
    for name in ['real-wise-0855', 'real-epsilon-indi-b']:
        bundle = ROOT/'fixtures/real'/name
        manifest = json.loads((bundle/'manifest.json').read_text())
        lineage = json.loads((bundle/'lineage.json').read_text())
        staged = []
        for i, frame in enumerate(manifest['frames']):
            path = ROOT/f'.cache/enhancement/{name}-raw.fits' if i == 0 else cache/f'{name}-{i+1}.fits'
            if not path.exists():
                if not args.download:
                    raise ValueError(f'Input not cached: {path}; use --download for bounded acquisition')
                retriever._read(frame['source_fits_url'], 16*1024*1024, path, attempts=3, budget=budget)
            if path.stat().st_size > 16*1024*1024:
                raise ValueError('Raw input exceeds limit')
            source = ObservationInput(path, frame['observation_id'], datetime.fromisoformat(frame['observed_start_utc'].replace('Z','+00:00')),
                                      datetime.fromisoformat(frame['observed_end_utc'].replace('Z','+00:00')), frame['detector'], frame['release'], frame['source_fits_url'])
            loaded = read_observation(source, manifest['target']['ra_deg'], manifest['target']['dec_deg'])
            size = manifest['grid']['width_px']; count = size*size
            image, quality = reproject_quality(loaded, WCS(manifest['grid']['wcs_header']), size)
            raw = (bundle/(frame['frame_id']+'.bin')).read_bytes()
            old = np.flipud(np.frombuffer(raw, '<f4', count=count).reshape(size,size))
            strict = np.flipud(np.frombuffer(raw, np.uint8, offset=count*4).reshape(size,size)) == 1
            if not np.array_equal(strict, quality == 1) or not np.allclose(image[strict], old[strict], rtol=0, atol=1e-6):
                raise ValueError('New source does not reproduce the reviewed strict samples')
            image[strict] = old[strict]  # Preserve the exact previously reviewed bytes.
            temporary = cache/f'{name}-{i+1}.bin'
            record = write_prepared_raster(temporary, image, strict, quality=quality)
            frame['raster'] = {**record, 'url':frame['raster']['url']}
            frame['warning_fraction'] = float(np.mean(quality == 2))
            staged.append((temporary, frame['frame_id']+'.bin'))
            lineage.setdefault('quality_revision', {})[frame['frame_id']] = {
                'source_fits_url': frame['source_fits_url'], 'raw_sha256': digest(path), 'raw_bytes': path.stat().st_size,
                'raw_cache': path.relative_to(ROOT).as_posix(),
                'verified_strict_samples_unchanged': True, 'warning_fraction': frame['warning_fraction'],
                'method': 'IRSA OUTLIER/OVERFLOW-only finite samples; separate weighted reprojection; strict values unchanged',
            }
            print(name, frame['frame_id'], f"{frame['warning_fraction']:.4%} warning-only", flush=True)
        manifest['processing']['browser_raster_encoding'] = 'float32-le-quality8-v2'
        manifest['processing']['browser_quality_policy'] = '0 unavailable; 1 strict-valid; 2 OUTLIER/OVERFLOW-only. Strict PNGs, stretch and source manifest unchanged.'
        for path, filename in staged:
            (bundle/filename).write_bytes(path.read_bytes())
        (bundle/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        lineage['quality_updated_at_utc'] = datetime.now(timezone.utc).isoformat()
        lineage['source_observations'] = [{k:v for k,v in f.items() if k not in {'image_url','raster','gap_fill'}} for f in manifest['frames']]
        for filename in ['manifest.json', *(f for _,f in staged)]:
            path = bundle/filename
            lineage['files'][filename] = {'size_bytes':path.stat().st_size,'sha256':digest(path)}
        (bundle/'lineage.json').write_text(json.dumps(lineage, indent=2)+'\n')
        validate_bundle(bundle)


if __name__ == '__main__':
    main()
