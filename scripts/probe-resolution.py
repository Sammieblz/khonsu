"""Bounded acquisition for the resolution lab, separate from production queries.

Only native SPHEREx DR1/QR3 FITS cutouts are eligible. A near-time metadata
window is a download candidate, never a spectral compatibility claim.
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import time
from astropy import log

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api'))
from app.interfaces import ObservationInput
from app.processing.fits_reader import inspect_observation
from app.retrieval.service import (
    IrsaRetriever, RetrievalError, _ByteBudget, cutout_url, parse_metadata, query_url,
)
from app.schemas import SequenceRequest

CACHE = ROOT / '.cache/resolution'
REPORT = ROOT / 'docs/evidence/resolution/acquisition.json'
MAX_FILES = 50
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def temporal_candidates(rows, limit=12):
    """Prefer populated same-detector 24-hour windows, bounded and deterministic."""
    windows = []
    for first in rows:
        group = [r for r in rows if r.detector == first.detector
                 and 0 <= (r.observed_start_utc - first.observed_start_utc).total_seconds() <= 86400]
        if len(group) >= 2:
            windows.append(group)
    windows.sort(key=lambda g: (-len(g), (g[-1].observed_start_utc - g[0].observed_start_utc).total_seconds(),
                                g[0].observed_start_utc, g[0].detector))
    chosen, seen = [], set()
    for group in windows:
        for row in group:
            key = (row.observation_id, row.detector)
            if key not in seen:
                seen.add(key)
                chosen.append(row)
                if len(chosen) == limit:
                    return chosen
    return chosen


def targets():
    result = []
    for name in ['real-wise-0855', 'real-epsilon-indi-b']:
        manifest = json.loads((ROOT / f'fixtures/real/{name}/manifest.json').read_text())
        result.append({'id': name, 'title': manifest['title'], **manifest['target']})
    result.append({'id': 'north-ecliptic-pole', 'title': 'North ecliptic pole field',
                   'ra_deg': 270., 'dec_deg': 66.5607})
    result.append({'id': 'north-pole-deep', 'title': 'North ecliptic pole deep survey',
                   'ra_deg': 270., 'dec_deg': 66.5607, 'deep': True})
    return result


def deep_candidates(rows, payload, limit=12):
    """Prefer nearly repeated pointings; FITS wavelengths still decide eligibility."""
    centres = {(r['obs_id'], int(r['energy_bandpassname'].upper().rsplit('D', 1)[1])): (float(r['s_ra']), float(r['s_dec']))
               for r in csv.DictReader(io.StringIO(payload.decode('utf-8-sig')))}
    groups = []
    for first in rows:
        ra, dec = centres[first.observation_id, first.detector]
        nearby = []
        for row in rows:
            if row.detector != first.detector:
                continue
            dra, ddec = centres[row.observation_id, row.detector]
            separation = math.hypot(((dra - ra + 180) % 360 - 180) * math.cos(math.radians(dec)), ddec - dec)
            if separation <= .08:
                nearby.append((separation, row))
        nearby.sort(key=lambda pair: (pair[0], pair[1].observed_start_utc))
        if len(nearby) >= 3:
            groups.append(nearby)
    if not groups:
        return temporal_candidates(rows, limit)
    groups.sort(key=lambda group: (-len(group), group[min(len(group), limit) - 1][0], group[0][1].observation_id))
    return [row for _, row in groups[0][:limit]]


def write_report(report):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')


def acquire_overviews(report, retriever, budget, download):
    """Two wider crops of the exact baseline exposures, never additional epochs."""
    report['overviews'] = []
    for name in ['real-wise-0855', 'real-epsilon-indi-b']:
        manifest = json.loads((ROOT / f'fixtures/real/{name}/manifest.json').read_text())
        frame = manifest['frames'][0]
        request = SequenceRequest(ra_deg=manifest['target']['ra_deg'], dec_deg=manifest['target']['dec_deg'], fov_arcmin=20, max_frames=2)
        url = cutout_url(frame['source_fits_url'], request)
        path = CACHE / f'overview-{name}.fits'
        record = {'id': name, 'fov_arcmin': 20, 'source_fits_url': url, 'observation_id': frame['observation_id'],
                  'local_cache': path.relative_to(ROOT).as_posix()}
        report['overviews'].append(record)
        try:
            if not path.exists():
                if not download:
                    raise RetrievalError('not_cached', 'Overview FITS is not cached')
                retriever._read(url, MAX_FILE_BYTES, path, attempts=2, budget=budget)
            else:
                if path.stat().st_size > MAX_FILE_BYTES:
                    raise RetrievalError('archive_size_limit', 'Cached overview exceeds its cap')
                budget.take(path.stat().st_size)
            record.update(status='downloaded', sha256=sha(path.read_bytes()), size_bytes=path.stat().st_size,
                          retrieved_at_utc=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat())
        except Exception as exc:
            record.update(status='failed', error_code=getattr(exc, 'code', type(exc).__name__), error=str(exc))
        print('overview', name, record['status'], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true', help='Allow bounded IRSA requests; cached files are reused')
    parser.add_argument('--overview-only', action='store_true', help='Keep the completed coverage audit and acquire only two wider baseline crops')
    args = parser.parse_args()
    log.setLevel('WARNING')
    CACHE.mkdir(parents=True, exist_ok=True)
    report = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'schema_version': 1,
              'policy': {'max_files': MAX_FILES, 'max_file_bytes': MAX_FILE_BYTES,
                         'max_total_bytes': MAX_TOTAL_BYTES, 'max_seconds': 600,
                         'time_window_hours': 24, 'files_per_target': 12,
                         'collections': ['spherex_dr1', 'spherex_qr3', 'spherex_dr1_deep', 'spherex_qr3_deep'],
                         'selection': 'Most populated same-detector 24-hour windows, then shortest span',
                         'spectral_note': 'Target wavelengths are display approximations, not calibrated spectrophotometry'},
              'targets': []}
    retriever = IrsaRetriever(timeout_seconds=25, deadline_seconds=600)
    retriever._deadline = time.monotonic() + 600
    budget = _ByteBudget(limit=MAX_TOTAL_BYTES)
    if args.overview_only:
        report = json.loads(REPORT.read_text())
        report['policy']['max_files'] = MAX_FILES
        budget.take(sum(r.get('size_bytes', 0) for target in report['targets'] for r in target['candidates']))
        acquire_overviews(report, retriever, budget, args.download)
        report.update(accounted_bytes=budget.used, finished_at_utc=datetime.now(timezone.utc).isoformat(),
                      attempted_files=sum(len(t['candidates']) for t in report['targets'])+len(report['overviews']))
        write_report(report)
        return
    attempted = 0
    for target in targets():
        request = SequenceRequest(ra_deg=target['ra_deg'], dec_deg=target['dec_deg'], fov_arcmin=6, max_frames=96)
        if target.get('deep'):
            request = request.model_copy(update={'start_utc': datetime(2026, 7, 10, tzinfo=timezone.utc),
                                                 'end_utc': datetime(2026, 7, 11, tzinfo=timezone.utc)})
        folder = CACHE / target['id']
        folder.mkdir(exist_ok=True)
        query = query_url(request)
        if target.get('deep'):
            query = query.replace('COLLECTION=spherex_dr1', 'COLLECTION=spherex_dr1_deep').replace('COLLECTION=spherex_qr3', 'COLLECTION=spherex_qr3_deep')
        entry = {**target, 'query_url': query, 'candidates': [], 'status': 'in_progress'}
        report['targets'].append(entry)
        metadata = folder / 'metadata.csv'
        try:
            if not metadata.exists():
                if not args.download:
                    raise RetrievalError('not_cached', 'Run with --download for this bounded metadata query')
                metadata.write_bytes(retriever._read(query, 8 * 1024 * 1024, attempts=2))
            payload = metadata.read_bytes()
            if len(payload) > 8 * 1024 * 1024:
                raise RetrievalError('archive_size_limit', 'Cached metadata exceeds the cap')
            rows = parse_metadata(payload, request)
            entry.update(metadata_rows=len(rows), metadata_sha256=sha(payload),
                         metadata_retrieved_at_utc=datetime.fromtimestamp(metadata.stat().st_mtime, timezone.utc).isoformat())
            candidates = deep_candidates(rows, payload) if target.get('deep') else temporal_candidates(rows)
            entry['selection'] = 'Nearest repeated pointing centres within one bounded day' if target.get('deep') else report['policy']['selection']
            print(target['id'], len(rows), 'metadata rows;', len(candidates), 'near-time candidates', flush=True)
            for row in candidates:
                if attempted >= MAX_FILES:
                    break
                attempted += 1
                url = cutout_url(row.source_fits_url, request)
                path = folder / (sha(url.encode())[:24] + '.fits')
                record = {**asdict(row), 'source_fits_url': url,
                          'observed_start_utc': row.observed_start_utc.isoformat(),
                          'observed_end_utc': row.observed_end_utc.isoformat(),
                          'local_cache': path.relative_to(ROOT).as_posix()}
                entry['candidates'].append(record)
                try:
                    if not path.exists():
                        if not args.download:
                            raise RetrievalError('not_cached', 'Source is not cached; no network requested')
                        retriever._read(url, MAX_FILE_BYTES, path, attempts=2, budget=budget)
                    else:
                        if path.stat().st_size > MAX_FILE_BYTES:
                            raise RetrievalError('archive_size_limit', 'Cached FITS exceeds the per-file cap')
                        budget.take(path.stat().st_size)
                    data = path.read_bytes()
                    observation = ObservationInput(path, row.observation_id, row.observed_start_utc,
                                                   row.observed_end_utc, row.detector, row.release, url)
                    info = inspect_observation(observation, request.ra_deg, request.dec_deg)
                    record.update(status='inspected', size_bytes=len(data), sha256=sha(data),
                                  retrieved_at_utc=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                                  wavelength_um=info.wavelength_um, bandwidth_um=info.bandwidth_um,
                                  target_detector_pixel=[info.target_x, info.target_y],
                                  processing_version=info.processing_version, input_shape=list(info.image_shape))
                    print(row.observation_id, row.detector, round(info.wavelength_um, 6), 'um', flush=True)
                except Exception as exc:
                    record.update(status='failed', error_code=getattr(exc, 'code', type(exc).__name__), error=str(exc))
                    print(row.observation_id, record['error_code'], flush=True)
                write_report(report)
            entry['status'] = 'inspected' if any(c['status'] == 'inspected' for c in entry['candidates']) else 'insufficient_inputs'
        except Exception as exc:
            entry.update(status='failed', error_code=getattr(exc, 'code', type(exc).__name__), error=str(exc))
        write_report(report)
    acquire_overviews(report, retriever, budget, args.download)
    report.update(finished_at_utc=datetime.now(timezone.utc).isoformat(), attempted_files=attempted+2, accounted_bytes=budget.used)
    write_report(report)


if __name__ == '__main__':
    main()
