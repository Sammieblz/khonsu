"""Acquisition-policy controls with a fake archive; no network in tests."""
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import numpy as np

from app.retrieval.service import ObservationMetadata, RetrievalError

spec = importlib.util.spec_from_file_location('resolution_probe', Path(__file__).resolve().parents[3] / 'scripts/probe-resolution.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def sandbox_probe(tmp_path, monkeypatch):
    for name in ['real-wise-0855', 'real-epsilon-indi-b']:
        relative = f'fixtures/real/{name}/manifest.json'
        destination = tmp_path / relative
        destination.parent.mkdir(parents=True)
        destination.write_bytes((probe.ROOT / relative).read_bytes())
    cache = tmp_path / '.cache/resolution'
    cache.mkdir(parents=True)
    monkeypatch.setattr(probe, 'ROOT', tmp_path)
    monkeypatch.setattr(probe, 'CACHE', cache)


def test_near_time_selection_is_bounded_and_keeps_distinct_observations():
    start = datetime(2026, 7, 10, tzinfo=timezone.utc)
    rows = [ObservationMetadata(str(i), start+timedelta(minutes=i), start+timedelta(minutes=i+1), 2, 'DR1', 'https://example.invalid') for i in range(30)]
    chosen = probe.temporal_candidates(rows, 12)
    assert len(chosen) == 12
    assert len({r.observation_id for r in chosen}) == 12
    assert max(r.observed_end_utc for r in chosen)-min(r.observed_start_utc for r in chosen) < timedelta(days=1)


def test_one_exposure_per_month_does_not_become_a_near_time_candidate():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = [ObservationMetadata(str(i), start+timedelta(days=30*i), start+timedelta(days=30*i, minutes=2), 2, 'DR1', 'https://example.invalid') for i in range(5)]
    assert probe.temporal_candidates(rows) == []


def test_failed_overview_acquisition_records_failure_without_a_substitute(tmp_path, monkeypatch):
    sandbox_probe(tmp_path, monkeypatch)
    class Unavailable:
        def _read(self, *args, **kwargs):
            raise RetrievalError('archive_busy', 'The real archive is busy')
    report = {}
    probe.acquire_overviews(report, Unavailable(), probe._ByteBudget(), True)
    assert len(report['overviews']) == 2
    assert all(row['status'] == 'failed' and row['error_code'] == 'archive_busy' for row in report['overviews'])
    assert not list(probe.CACHE.iterdir())


def test_offline_run_never_fetches_missing_inputs(tmp_path, monkeypatch):
    sandbox_probe(tmp_path, monkeypatch)
    class ForbiddenNetwork:
        def _read(self, *args, **kwargs):
            raise AssertionError('No network call is allowed')
    report = {}
    probe.acquire_overviews(report, ForbiddenNetwork(), probe._ByteBudget(), False)
    assert all(row['error_code'] == 'not_cached' for row in report['overviews'])


def test_peak_diagnostics_exclude_diagonally_masked_patches():
    spec = importlib.util.spec_from_file_location('resolution_experiment', Path(__file__).resolve().parents[3] / 'scripts/experiment-resolution.py')
    experiment = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(experiment)
    values = np.ones((24, 24))
    values[6, 6], values[17, 17] = 10, 8
    values += np.arange(24)[None, :]*.001
    trial, good = values.copy(), np.ones(values.shape, dtype=bool)
    trial[9, 9] = np.nan
    good[9, 9] = False
    metrics = experiment.diagnostics(values, trial, good, 1)
    json.dumps(metrics, allow_nan=False)
    assert metrics['reference_peaks'] == 1
    assert metrics['max_centroid_change_arcsec'] == 0
