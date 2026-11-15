#!/usr/bin/env python3
"""Package previously acquired, authentic PNG frames without querying IRSA."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps' / 'api'))

from app.examples import MAX_BUNDLE_BYTES, MAX_RECORD_BYTES, read_bounded, validate_bundle
from app.schemas import SequenceManifest


def package(manifest_path: Path, assets: Path, output: Path, sequence_id: str,
            title: str, acquired_at: str, acquisition_reference: str, provenance_report: Path, role: str = 'example') -> Path:
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', sequence_id):
        raise ValueError('Sequence ID must contain only letters, digits, hyphens and underscores.')
    acquired = datetime.fromisoformat(acquired_at.replace('Z', '+00:00'))
    if acquired.utcoffset() is None or not acquisition_reference.strip():
        raise ValueError('Supply a timezone-qualified acquisition timestamp and a source reference.')
    original = read_bounded(manifest_path, MAX_RECORD_BYTES)
    source = SequenceManifest.model_validate_json(original)
    if source.data_mode == 'synthetic':
        raise ValueError('This command never relabels synthetic fixtures as real data.')
    report = json.loads(read_bounded(provenance_report, MAX_RECORD_BYTES))
    matches = [entry for entry in report['targets'] if entry.get('example_sequence_id') == source.sequence_id]
    if len(matches) != 1 or SequenceManifest.model_validate(matches[0]['manifest']) != source:
        raise ValueError('The source manifest must match one successful target in the actual acquisition report.')
    record = {key: value for key, value in matches[0].items() if key != 'manifest'}
    if acquired != datetime.fromisoformat(record['processing_timestamp_utc'].replace('Z', '+00:00')):
        raise ValueError('Use the actual processing timestamp in the acquisition report.')
    payload = source.model_dump(mode='json')
    payload.update(sequence_id=sequence_id, data_mode='cached-real', title=title,
                   disclosure=f'Cached real SPHEREx observations acquired {acquired_at}. This is a saved field, not a live result for your form coordinates. Approximate display wavelengths and unmatched PSFs/backgrounds limit interpretation; no target detection or variability is established.')
    payload['processing'] = {**payload['processing'], 'cache_acquired_at_utc': acquired_at,
                             'cache_acquisition_reference': acquisition_reference, 'cache_role': role}
    files = {'source-manifest.json': original,
             'acquisition-record.json': (json.dumps(record, indent=2) + '\n').encode()}
    for frame in payload['frames']:
        old_name = frame['image_url'].rsplit('/', 1)[-1]
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}\.png', old_name):
            raise ValueError('Only local prepared PNG filenames are accepted.')
        name = frame['frame_id'] + '.png'
        files[name] = read_bounded(assets / old_name, MAX_BUNDLE_BYTES)
        frame['image_url'] = f'/v1/examples/{sequence_id}/frames/{name}'
        if frame.get('raster'):
            old_raster = frame['raster']['url'].rsplit('/', 1)[-1]
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}\.bin', old_raster):
                raise ValueError('Only local prepared raster filenames are accepted.')
            raster_name = frame['frame_id'] + '.bin'
            files[raster_name] = read_bounded(assets / old_raster, MAX_BUNDLE_BYTES)
            frame['raster']['url'] = f'/v1/examples/{sequence_id}/frames/{raster_name}'
        if frame.get('gap_fill'):
            old_fill = frame['gap_fill']['url'].rsplit('/', 1)[-1]
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,85}\.bin', old_fill):
                raise ValueError('Only local prepared estimate filenames are accepted.')
            fill_name = frame['frame_id'] + '-fill.bin'
            files[fill_name] = read_bounded(assets / old_fill, MAX_BUNDLE_BYTES)
            frame['gap_fill']['url'] = f'/v1/examples/{sequence_id}/frames/{fill_name}'
    validated = SequenceManifest.model_validate(payload)
    files['manifest.json'] = (validated.model_dump_json(indent=2) + '\n').encode()
    if sum(map(len, files.values())) > MAX_BUNDLE_BYTES:
        raise ValueError('The example is larger than the small-bundle limit.')
    destination = output / sequence_id
    if destination.exists():
        raise ValueError('Output already exists; choose a new sequence ID rather than replacing a reviewed example.')
    lineage = {
        'schema_version': '1.0', 'sequence_id': sequence_id,
        'acquired_at_utc': acquired_at, 'acquisition_reference': acquisition_reference,
        'packaged_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_manifest_sha256': hashlib.sha256(original).hexdigest(),
        'source_observations': [frame.model_dump(mode='json', exclude={'image_url', 'raster', 'gap_fill'}) for frame in validated.frames],
        'gap_fill_revision': {frame.frame_id: {'input_raster_sha256': frame.raster.sha256,
                             'method': validated.processing.get('gap_fill_method'),
                             'estimated_fraction': frame.estimated_fraction}
                             for frame in validated.frames if frame.gap_fill},
        'files': {name: {'size_bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(files.items())},
        'data_use_terms': 'https://irsa.ipac.caltech.edu/data_use_terms.html',
        'irsa_acknowledgements': 'https://irsa.ipac.caltech.edu/ack.html',
        'spherex_acknowledgements': 'https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html',
        'dr1_spectral_image_doi': 'https://doi.org/10.26131/IRSA678',
    }
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.packaging-', dir=output) as temporary:
        staging_root = Path(temporary).resolve()
        if not staging_root.is_relative_to(output.resolve()) or destination.resolve().parent != output.resolve():
            raise ValueError('The staging and final paths must stay inside the selected output directory.')
        staging = staging_root / sequence_id
        staging.mkdir()
        for name, data in files.items():
            (staging / name).write_bytes(data)
        (staging / 'lineage.json').write_text(json.dumps(lineage, indent=2) + '\n', encoding='utf-8')
        validate_bundle(staging)
        staging.rename(destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'fixtures' / 'real')
    parser.add_argument('--sequence-id', required=True)
    parser.add_argument('--title', required=True)
    parser.add_argument('--acquired-at', required=True, help='Actual acquisition/probe record timestamp with UTC offset')
    parser.add_argument('--acquisition-reference', required=True, help='Probe report, recorded job, or reproducible acquisition record')
    parser.add_argument('--provenance-report', type=Path, required=True, help='Actual five-target probe report containing source FITS hashes')
    parser.add_argument('--role', choices=('primary', 'backup', 'example'), default='example')
    args = parser.parse_args()
    destination = package(args.manifest, args.assets, args.output, args.sequence_id,
                          args.title, args.acquired_at, args.acquisition_reference, args.provenance_report, args.role)
    print(destination)


if __name__ == '__main__':
    main()
