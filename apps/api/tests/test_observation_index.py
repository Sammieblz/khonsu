"""Synthetic metadata exercises spherical coverage and outage recovery policy."""
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import time
from unittest.mock import patch
from urllib.error import HTTPError

import pytest

from app.paths import fixture_directory
from app.retrieval.index import ObservationIndex, csv_bytes, footprint, unit, dot
from app.retrieval.service import IrsaRetriever, RetrievalError, query_url
from app.schemas import SequenceRequest

RECORDED = '2026-11-15T00:00:00+00:00'
SOURCE = 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/test/1/observation.fits'


def request(**changes):
    return SequenceRequest(**{'ra_deg': 0, 'dec_deg': 0, 'fov_arcmin': 6, 'max_frames': 2, **changes})


def row(**changes):
    return {'obs_id': 'synthetic-test', 't_min': '61000', 't_max': '61000.001',
            'energy_bandpassname': 'SPHEREx-D1', 'access_url': SOURCE,
            's_region': 'POLYGON ICRS 359 -1 1 -1 1 1 359 1 359 -1',
            'em_min': '1e-6', 'em_max': '2e-6', 'obs_collection': 'spherex_dr1', **changes}


def seed(index, rows=None, **kwargs):
    return index.ingest(csv_bytes(rows or [row()]), query_url=query_url(request()),
                        recorded_utc=kwargs.get('recorded_utc', RECORDED))


@pytest.fixture
def index(tmp_path):
    value = ObservationIndex(tmp_path / 'index.sqlite3')
    seed(value)
    return value


def test_spatial_query_handles_ra_wrap_poles_edges_and_antipodes(index):
    for ra in (0, .9, 359.1):
        assert len(index.search(request(ra_deg=ra)).observations) == 1
    for ra, dec in ((180, 0), (2, 0), (0, 2), (0, 90)):
        assert not index.search(request(ra_deg=ra, dec_deg=dec)).observations
    seed(index, [row(access_url=SOURCE.replace('observation', 'polar'), obs_id='polar',
                     s_region='POLYGON ICRS 0 88 120 88 240 88 0 88')])
    assert len(index.search(request(ra_deg=359, dec_deg=90)).observations) == 1
    assert not index.search(request(dec_deg=-90)).observations
    centre, limit, normals = footprint('POLYGON ICRS 359 1 1 1 1 -1 359 -1')
    assert all(dot(unit(0, 0), n) >= 0 for n in normals)


@pytest.mark.parametrize('region', [
    'CIRCLE ICRS 0 0 2', 'POLYGON ICRS 0 0 1 0 2 0',
    'POLYGON ICRS nan 0 1 0 1 1', 'POLYGON ICRS 0 -91 1 0 1 1',
    'POLYGON ICRS 0 0 120 0 240 0',
    'POLYGON ICRS 359 -1 1 1 1 -1 359 1',
])
def test_invalid_footprints_never_claim_coverage(tmp_path, region):
    index = ObservationIndex(tmp_path / 'index.db')
    assert seed(index, [row(s_region=region)]) == 0
    assert not index.search(request()).observations


def test_dates_detector_and_spectral_intervals_are_respected(index):
    assert len(index.search(request(wavelength_min_um=1.5, wavelength_max_um=1.8)).observations) == 1
    assert not index.search(request(wavelength_min_um=3)).observations
    assert not index.search(request(wavelength_max_um=.9)).observations
    assert not index.search(request(detector=2)).observations
    assert not index.search(request(start_utc=datetime(2026, 1, 1, tzinfo=timezone.utc))).observations
    assert not index.search(request(end_utc=datetime(2025, 1, 1, tzinfo=timezone.utc))).observations


def test_bad_sources_cannot_enter_index(index):
    for source in ('https://attacker.invalid/file.fits', SOURCE.replace('/dr1/', '/qr2/')):
        with pytest.raises(RetrievalError):
            seed(index, [row(access_url=source)])
    assert seed(index, [row(access_url=SOURCE + '?center=0,0&size=1')]) == 0
    with pytest.raises(ValueError):
        seed(index, [row(obs_collection='spherex_qr3')])
    with pytest.raises(ValueError):
        seed(index, recorded_utc='2100-01-01T00:00:00+00:00')
    assert index.status()['observations'] == 1


def test_restart_idempotence_age_and_capacity(index):
    seed(index, [row(obs_id='newer')], recorded_utc='2026-11-15T01:00:00+00:00')
    seed(index)
    reopened = ObservationIndex(index.path)
    assert reopened.search(request()).observations[0].observation_id == 'newer'
    assert reopened.search(request()).newest_recorded_utc == '2026-11-15T01:00:00+00:00'
    with patch('app.retrieval.index.MAX_INDEX_ROWS', 2):
        seed(reopened, [row(access_url=SOURCE.replace('observation', f'new{i}'), obs_id=f'new{i}') for i in range(3)])
    assert reopened.status()['observations'] == 2


def test_seed_integrity_and_idempotence(tmp_path):
    directory = tmp_path / 'seeds'
    directory.mkdir()
    payload = csv_bytes([row()])
    (directory / 'sample.csv.gz').write_bytes(gzip.compress(payload))
    manifest = {'schema_version': 1, 'snapshots': [{'file': 'sample.csv.gz',
                'sha256': hashlib.sha256(payload).hexdigest(), 'query_url': query_url(request()),
                'recorded_utc': RECORDED}]}
    (directory / 'manifest.json').write_text(json.dumps(manifest))
    index = ObservationIndex(tmp_path / 'index.db')
    index.seed(directory)
    index.seed(directory)
    assert index.status()['observations'] == 1
    manifest['snapshots'][0]['sha256'] = '0' * 64
    (directory / 'manifest.json').write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match='checksum'):
        index.seed(directory)


def retriever(index):
    value = IrsaRetriever(observation_index=index)
    value._deadline = time.monotonic() + 60
    return value


def test_upstream_outage_uses_index_and_discloses_age(index):
    client = retriever(index)
    with patch.object(client, '_read', side_effect=RetrievalError('archive_unavailable', 'test outage')):
        rows = client._search(request())
    assert rows[0].source_fits_url == SOURCE
    assert client.discovery_notice['code'] == 'LOCAL_OBSERVATION_INDEX'
    assert client.discovery_metadata['observation_index_coverage'] == 'partial'
    assert client.discovery_metadata['observation_metadata_oldest_utc'] == RECORDED


def test_live_success_refreshes_index_and_live_empty_is_authoritative(index):
    client = retriever(index)
    with patch.object(client, '_read', return_value=csv_bytes([row(obs_id='updated')])):
        assert client._search(request())[0].observation_id == 'updated'
    assert index.search(request()).observations[0].observation_id == 'updated'
    assert client.discovery_notice is None
    with patch.object(client, '_read', return_value=csv_bytes([])):
        assert client._search(request()) == []
    # Prior records remain available only during a subsequent outage, with age disclosed.
    assert index.status()['observations'] == 1


def test_unindexed_query_during_outage_is_not_no_coverage(index):
    client = retriever(index)
    with patch.object(client, '_read', side_effect=RetrievalError('archive_unavailable', 'test outage')):
        with pytest.raises(RetrievalError) as exc:
            client._search(request(ra_deg=180))
    assert exc.value.code == 'archive_unavailable'
    assert 'does not mean' in exc.value.message


@pytest.mark.parametrize('code', ['cancelled', 'unsafe_source_url', 'invalid_archive_response', 'too_many_observations'])
def test_non_transient_failures_never_use_index(index, code):
    client = retriever(index)
    with patch.object(client, '_read', side_effect=RetrievalError(code, 'test')), patch.object(index, 'search') as lookup:
        with pytest.raises(RetrievalError) as exc:
            client._search(request())
    assert exc.value.code == code
    lookup.assert_not_called()


def test_nonretryable_http_error_and_cancellation_never_use_index(index):
    client = retriever(index)
    failure = RetrievalError('archive_unavailable', 'HTTP 404')
    failure.__cause__ = HTTPError(query_url(request()), 404, 'Not Found', {}, None)
    with patch.object(client, '_read', side_effect=failure), patch.object(index, 'search') as lookup:
        with pytest.raises(RetrievalError):
            client._search(request())
        lookup.assert_not_called()
    client.cancel()
    with pytest.raises(RetrievalError) as exc:
        index.search(request(), check=client._check)
    assert exc.value.code == 'cancelled'


def test_disk_failure_does_not_break_live_queries(index):
    client = retriever(index)
    with patch.object(client, '_read', return_value=csv_bytes([row()])), \
            patch.object(index, 'ingest', side_effect=sqlite3.OperationalError('disk full')):
        assert len(client._search(request())) == 1


def test_committed_real_metadata_seeds_support_fresh_nearby_coordinates(tmp_path):
    index = ObservationIndex(tmp_path / 'real-index.db')
    index.seed(fixture_directory(Path(__file__), None) / 'archive-index')
    assert index.status()['observations'] == 1387
    for ra, dec in ((133.79512917, -7.24514722), (270.02, 66.51), (331.1, -56.8)):
        result = index.search(request(ra_deg=ra, dec_deg=dec))
        assert len(result.observations) >= 2
        assert all(r.release in ('DR1', 'QR3') for r in result.observations)
    assert not index.search(request(ra_deg=42, dec_deg=10)).observations


def test_operator_refresh_reports_live_failure_without_replacing_index(index, monkeypatch, capsys):
    from app.retrieval import sync_index
    monkeypatch.setattr(sync_index, 'configured_index', lambda: index)
    monkeypatch.setattr('sys.argv', ['sync_index', 'refresh', '--ra', '0', '--dec', '0'])
    with patch.object(IrsaRetriever, '_read', side_effect=RetrievalError('archive_unavailable', 'test outage')):
        assert sync_index.main() == 1
    assert '"status": "failed"' in capsys.readouterr().out
    assert index.status()['observations'] == 1


def test_operator_refresh_adds_new_live_metadata(index, monkeypatch, capsys):
    from app.retrieval import sync_index
    monkeypatch.setattr(sync_index, 'configured_index', lambda: index)
    monkeypatch.setattr('sys.argv', ['sync_index', 'refresh', '--ra', '0', '--dec', '0'])
    payload = csv_bytes([row(obs_id='additional', access_url=SOURCE.replace('observation', 'additional'))])
    with patch.object(IrsaRetriever, '_read', return_value=payload):
        assert sync_index.main() == 0
    assert '"status": "refreshed"' in capsys.readouterr().out
    assert index.status()['observations'] == 2
