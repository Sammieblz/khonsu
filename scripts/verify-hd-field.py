"""Reproduce a bounded 2-degree field from two known real SPHEREx exposures.

Network access requires --download. Reuses recorded immutable cutouts on rerun.
FITS and full-sized products stay in .cache; the small evidence report is tracked.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.interfaces import ObservationInput, ProcessingOptions
from app.limits import MAX_FITS_BYTES
from app.processing.fits_reader import read_observation
from app.processing.service import AstronomyProcessor
from app.retrieval.service import IrsaRetriever, _ByteBudget, cutout_url
from app.schemas import SequenceRequest


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    cached = ROOT / '.cache/hd-field'
    cached.mkdir(parents=True, exist_ok=True)
    record_path = cached / 'acquisition.json'
    records = json.loads(record_path.read_text()) if record_path.exists() else []
    original = json.loads((ROOT/'fixtures/real/real-wise-0855/manifest.json').read_text())
    request = SequenceRequest(**original['target'], fov_arcmin=120, max_frames=2)
    retriever = IrsaRetriever(timeout_seconds=60, deadline_seconds=600)
    retriever._deadline = time.monotonic()+600
    budget = _ByteBudget(limit=128*1024*1024)
    observations = []
    for index, frame in enumerate(original['frames'][:2]):
        url = cutout_url(frame['source_fits_url'], request)
        path = cached / f'source-{index+1}.fits'
        existing = next((r for r in records if r['url']==url), None)
        if path.exists() and existing and path.stat().st_size==existing['bytes'] and digest(path)==existing['sha256']:
            budget.take(path.stat().st_size)
        elif args.download:
            print(f"Retrieving bounded wide cutout {index+1}/2", flush=True)
            partial = path.with_suffix('.part')
            retriever._read(url, MAX_FITS_BYTES, partial, attempts=3, budget=budget)
            partial.replace(path)
            record = {'url':url, 'bytes':path.stat().st_size, 'sha256':digest(path),
                      'acquired_at_utc':datetime.now(timezone.utc).isoformat(),
                      'observation_id':frame['observation_id'], 'release':frame['release']}
            records = [r for r in records if r['url']!=url]+[record]
            record_path.write_text(json.dumps(records,indent=2)+'\n')
        else:
            raise RuntimeError('Verified cutout missing. Run with --download for the bounded two-file acquisition.')
        observations.append(ObservationInput(path, frame['observation_id'],
            datetime.fromisoformat(frame['observed_start_utc']), datetime.fromisoformat(frame['observed_end_utc']),
            frame['detector'], frame['release'], url))
    started = time.monotonic()
    manifest = AstronomyProcessor().process(observations,
        ProcessingOptions('hd-verification', request.ra_deg, request.dec_deg, request.fov_arcmin), cached/'output')
    report = {'verified_at_utc':datetime.now(timezone.utc).isoformat(), 'kind':'real',
              'scope':'Two previously validated exposure identities, larger native cutouts; no new archive discovery or stacking.',
              'download_limits':{'files':2, 'per_file_bytes':MAX_FITS_BYTES, 'total_bytes':128*1024*1024, 'deadline_seconds':600},
              'sources':records, 'processing_seconds':time.monotonic()-started,
              'manifest':manifest.model_dump(mode='json'), 'source_shapes':[]}
    for observation in observations:
        loaded = read_observation(observation, request.ra_deg, request.dec_deg)
        report['source_shapes'].append(list(loaded.science.shape))
    report['native_samples_across'] = request.fov_arcmin*60/manifest.processing['native_pixel_scale_arcsec']
    evidence=ROOT/'docs/evidence/hd-field'
    evidence.mkdir(parents=True,exist_ok=True)
    (evidence/'acquisition.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'grid':manifest.grid.width_px, 'frames':len(manifest.frames),
                      'native_samples_across':report['native_samples_across'],
                      'masked_fractions':[f.masked_fraction for f in manifest.frames],
                      'processing_seconds':report['processing_seconds']}),flush=True)


if __name__=='__main__':
    main()
