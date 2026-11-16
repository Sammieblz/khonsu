"""Persistence, privacy and concurrency using explicit synthetic notebook records."""
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.main import app

KEY = 'a' * 64
EMPTY = '{"schema":"khonsu-candidates","version":2,"candidates":[],"sequences":{}}'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('KHONSU_NOTEBOOK_DB', str(tmp_path / 'notes.sqlite3'))
    with TestClient(app) as client:
        yield client


def document(text='Synthetic test note'):
    return {'candidate_snapshot': EMPTY, 'observation_notes': [{'id': 'test-note', 'text': text, 'created_at': '2026-11-16T03:00:00Z', 'updated_at': '2026-11-16T03:00:00Z', 'sequence': None, 'frame_id': None}]}


def test_private_crud_and_restart(client, tmp_path):
    headers = {'X-Khonsu-Notebook': KEY}
    assert client.get('/v1/notebook').status_code == 422
    assert client.get('/v1/notebook', headers=headers).json() == {'revision': 0, 'document': None}
    assert client.put('/v1/notebook', headers=headers, json={'revision': 0, 'document': document()}).json()['revision'] == 1
    assert client.get('/v1/notebook', headers={'X-Khonsu-Notebook': 'b'*64}).json()['document'] is None
    with TestClient(app) as restarted:
        read = restarted.get('/v1/notebook', headers=headers)
        assert read.json()['document']['observation_notes'][0]['text'] == 'Synthetic test note'
        assert read.headers['cache-control'] == 'private, no-store'
    db = sqlite3.connect(tmp_path / 'notes.sqlite3')
    assert db.execute('SELECT key_hash FROM notebooks').fetchone()[0] != KEY
    db.close()
    updated = document('Edited test note')
    assert client.put('/v1/notebook', headers=headers, json={'revision': 1, 'document': updated}).status_code == 200
    updated['observation_notes'] = []
    assert client.put('/v1/notebook', headers=headers, json={'revision': 2, 'document': updated}).json()['document']['observation_notes'] == []


def test_conflicting_tabs_do_not_overwrite(client):
    def save(text):
        return client.put('/v1/notebook', headers={'X-Khonsu-Notebook': KEY}, json={'revision': 0, 'document': document(text)})
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(save, ['tab one', 'tab two']))
    assert sorted(r.status_code for r in results) == [200, 409]
    winner = next(r for r in results if r.status_code == 200).json()['document']
    assert client.get('/v1/notebook', headers={'X-Khonsu-Notebook': KEY}).json()['document'] == winner


def test_bounded_input_and_schema(client):
    headers = {'X-Khonsu-Notebook': KEY}
    for bad in ({'candidate_snapshot': '{}', 'observation_notes': []}, document(' '), document('x'*2001)):
        assert client.put('/v1/notebook', headers=headers, json={'revision': 0, 'document': bad}).status_code == 422
    too_big = client.put('/v1/notebook', headers=headers, content=b'x'*(4*1024*1024+1))
    assert too_big.status_code == 413
    response = client.options('/v1/notebook', headers={'Origin':'http://localhost:3000','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'x-khonsu-notebook,content-type'})
    assert response.status_code == 200


def test_unconfigured_is_explicit(client, monkeypatch):
    monkeypatch.delenv('KHONSU_NOTEBOOK_DB')
    response = client.get('/v1/notebook', headers={'X-Khonsu-Notebook': KEY})
    assert response.status_code == 503
    assert response.json()['code'] == 'NOTEBOOK_UNAVAILABLE'


def test_capacity_still_allows_existing_notebook_updates(client, monkeypatch):
    from app import notebooks
    monkeypatch.setattr(notebooks, 'MAX_NOTEBOOKS', 1)
    headers = {'X-Khonsu-Notebook': KEY}
    assert client.put('/v1/notebook', headers=headers, json={'revision': 0, 'document': document()}).status_code == 200
    other = {'X-Khonsu-Notebook': 'b'*64}
    assert client.get('/v1/notebook', headers=other).json()['document'] is None
    rejected = client.put('/v1/notebook', headers=other, json={'revision': 0, 'document': document()})
    assert rejected.status_code == 507
    assert rejected.json()['code'] == 'NOTEBOOK_CAPACITY'
    assert client.put('/v1/notebook', headers=headers, json={'revision': 1, 'document': document('still editable')}).status_code == 200
    assert client.put('/v1/notebook', headers=headers, content=iter([b'x'*(2*1024*1024), b'x'*(2*1024*1024+1)])).status_code == 413
