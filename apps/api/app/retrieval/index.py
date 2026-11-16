"""Bounded, persistent discovery metadata, never a cache of rendered images.

SPHEREx SIA footprints are small convex spherical polygons. Unit vectors avoid
RA wrap and polar singularities. Only the centre needs to be covered, matching
live discovery; the scientific processor still masks incomplete field edges.
"""
from __future__ import annotations

import csv
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
import gzip
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit

from .service import (COLLECTIONS, MAX_METADATA_BYTES, MAX_METADATA_ROWS,
                      ObservationMetadata, RetrievalError, parse_metadata, validate_irsa_url)
from ..schemas import SequenceRequest

MAX_INDEX_ROWS = 25_000
MAX_RADIUS_DEG = 10
MAX_CHORD = 2 * math.sin(math.radians(MAX_RADIUS_DEG) / 2)
FIELDS = ('obs_id', 't_min', 't_max', 'energy_bandpassname', 'access_url',
          's_region', 'em_min', 'em_max', 'obs_collection')


def unit(ra, dec):
    ra, dec = math.radians(ra), math.radians(dec)
    return (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def normalized(v):
    length = math.sqrt(dot(v, v))
    if length < 1e-12:
        raise ValueError('Degenerate spherical polygon')
    return tuple(x / length for x in v)


def footprint(region):
    """Reject unsupported/degenerate regions rather than guessing coverage."""
    words = region.split()
    if words[:2] != ['POLYGON', 'ICRS'] or not 8 <= len(words) <= 36 or len(words) % 2:
        raise ValueError('Only small ICRS polygons are supported')
    values = [float(x) for x in words[2:]]
    points = []
    for ra, dec in zip(values[::2], values[1::2]):
        if not (math.isfinite(ra) and math.isfinite(dec) and 0 <= ra <= 360 and -90 <= dec <= 90):
            raise ValueError('Invalid footprint coordinate')
        points.append(unit(ra, dec))
    if math.dist(points[0], points[-1]) < 1e-10:
        points.pop()
    if len(points) < 3:
        raise ValueError('Insufficient footprint vertices')
    centre = normalized(tuple(sum(p[i] for p in points) for i in range(3)))
    minimum_dot = min(dot(centre, p) for p in points)
    if minimum_dot < math.cos(math.radians(MAX_RADIUS_DEG)):
        raise ValueError('Footprint exceeds the supported angular radius')
    normals = []
    for a, b in zip(points, points[1:] + points[:1]):
        n = normalized(cross(a, b))
        orientation = dot(n, centre)
        if abs(orientation) < 1e-10:
            raise ValueError('Degenerate footprint edge')
        n = tuple(x if orientation > 0 else -x for x in n)
        if any(dot(n, p) < -1e-9 for p in points):
            raise ValueError('Non-convex footprint')
        normals.append(n)
    return centre, minimum_dot, normals


def csv_bytes(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, FIELDS, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode('utf-8')


def utc(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed > datetime.now(timezone.utc):
        raise ValueError('Metadata date must be a past, timezone-aware date')
    return parsed.astimezone(timezone.utc).isoformat()


@dataclass
class IndexedSearch:
    observations: list[ObservationMetadata]
    oldest_recorded_utc: str
    newest_recorded_utc: str


class ObservationIndex:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise ValueError('Unsupported observation index version')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS observations (
                    url TEXT PRIMARY KEY, metadata TEXT NOT NULL, normals TEXT NOT NULL,
                    cx REAL NOT NULL, cy REAL NOT NULL, cz REAL NOT NULL, min_dot REAL NOT NULL,
                    start_mjd REAL NOT NULL, end_mjd REAL NOT NULL, detector INTEGER NOT NULL,
                    em_min REAL NOT NULL, em_max REAL NOT NULL, recorded_utc TEXT NOT NULL,
                    query_url TEXT NOT NULL, response_sha256 TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS observation_position ON observations(cx);
                CREATE INDEX IF NOT EXISTS observation_age ON observations(recorded_utc);
                CREATE TABLE IF NOT EXISTS seeds (sha256 TEXT PRIMARY KEY);
                PRAGMA user_version=1;
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=2)
        db.row_factory = sqlite3.Row
        # 64 MiB with SQLite's normal 4096-byte pages. No unbounded WAL sidecar.
        page_size = db.execute('PRAGMA page_size').fetchone()[0]
        db.execute(f'PRAGMA max_page_count={64 * 1024 * 1024 // page_size}')
        try:
            with db:
                yield db
        finally:
            db.close()

    def ingest(self, payload: bytes, *, query_url: str, recorded_utc: str, seed_sha=None):
        validate_irsa_url(query_url, metadata=True)
        if len(query_url) > 4096 or len(payload) > MAX_METADATA_BYTES:
            raise ValueError('Metadata import exceeds its size limit')
        recorded_utc = utc(recorded_utc)
        # Validate the science identities, real times and URL allowlist first.
        unfiltered = SequenceRequest(ra_deg=0, dec_deg=0, fov_arcmin=1, max_frames=2)
        identities = {r.source_fits_url: r for r in parse_metadata(payload, unfiltered)}
        checksum = hashlib.sha256(payload).hexdigest()
        if seed_sha is not None and checksum != seed_sha:
            raise ValueError('Seed checksum mismatch')
        records = []
        for row in csv.DictReader(io.StringIO(payload.decode('utf-8-sig'))):
            source = row['access_url'].strip()
            item = identities.get(source)
            if item is None:
                continue
            # Never index a preselected crop or a different release/survey.
            if urlsplit(source).query or row.get('obs_collection') not in COLLECTIONS:
                continue
            if row['obs_collection'] != 'spherex_' + item.release.lower():
                raise ValueError('Metadata collection differs from the source release')
            try:
                centre, minimum_dot, normals = footprint(row['s_region'])
                lo, hi = float(row['em_min']), float(row['em_max'])
                if not (math.isfinite(lo) and math.isfinite(hi) and 0 < lo <= hi < 1e-3):
                    raise ValueError('Invalid wavelength interval')
            except (KeyError, TypeError, ValueError, AttributeError):
                # Missing/unsupported spatial data cannot support local discovery.
                continue
            metadata = {key: row[key] for key in FIELDS}
            metadata['access_url'] = source
            records.append((source, json.dumps(metadata), json.dumps(normals), *centre, minimum_dot,
                            float(row['t_min']), float(row['t_max']), item.detector, lo, hi,
                            recorded_utc, query_url, checksum))
        with self.connect() as db:
            db.executemany('''INSERT INTO observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(url) DO UPDATE SET
                    metadata=excluded.metadata, normals=excluded.normals,
                    cx=excluded.cx, cy=excluded.cy, cz=excluded.cz, min_dot=excluded.min_dot,
                    start_mjd=excluded.start_mjd, end_mjd=excluded.end_mjd,
                    detector=excluded.detector, em_min=excluded.em_min, em_max=excluded.em_max,
                    recorded_utc=excluded.recorded_utc, query_url=excluded.query_url,
                    response_sha256=excluded.response_sha256
                WHERE excluded.recorded_utc >= observations.recorded_utc''', records)
            db.execute('''DELETE FROM observations WHERE rowid IN (
                SELECT rowid FROM observations ORDER BY recorded_utc DESC, url LIMIT -1 OFFSET ?
            )''', (MAX_INDEX_ROWS,))
            if seed_sha:
                db.execute('INSERT OR IGNORE INTO seeds VALUES (?)', (seed_sha,))
        return len(records)

    def seed(self, directory: Path):
        manifest_path = directory / 'manifest.json'
        if manifest_path.stat().st_size > 64 * 1024:
            raise ValueError('Seed manifest exceeds its limit')
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest['schema_version'] != 1 or len(manifest['snapshots']) > 16:
            raise ValueError('Unsupported seed manifest')
        for entry in manifest['snapshots']:
            with self.connect() as db:
                if db.execute('SELECT 1 FROM seeds WHERE sha256=?', (entry['sha256'],)).fetchone():
                    continue
            name = entry['file']
            if Path(name).name != name or not name.endswith('.csv.gz'):
                raise ValueError('Invalid seed filename')
            with gzip.open(directory / name, 'rb') as stream:
                payload = stream.read(MAX_METADATA_BYTES + 1)
            self.ingest(payload, query_url=entry['query_url'], recorded_utc=entry['recorded_utc'],
                        seed_sha=entry['sha256'])

    def search(self, request: SequenceRequest, *, check=lambda: None) -> IndexedSearch:
        from .service import _mjd
        q = unit(request.ra_deg, request.dec_deg)
        clauses = ['cx BETWEEN ? AND ?', 'cy BETWEEN ? AND ?', 'cz BETWEEN ? AND ?']
        params = [value for coord in q for value in (coord - MAX_CHORD, coord + MAX_CHORD)]
        if request.detector is not None:
            clauses.append('detector=?')
            params.append(request.detector)
        if request.start_utc is not None:
            clauses.append('end_mjd>=?')
            params.append(_mjd(request.start_utc))
        if request.end_utc is not None:
            clauses.append('start_mjd<=?')
            params.append(_mjd(request.end_utc))
        if request.wavelength_min_um is not None:
            clauses.append('em_max>=?')
            params.append(request.wavelength_min_um * 1e-6)
        if request.wavelength_max_um is not None:
            clauses.append('em_min<=?')
            params.append(request.wavelength_max_um * 1e-6)
        matched, dates = [], []
        with self.connect() as db:
            for row in db.execute('SELECT * FROM observations WHERE ' + ' AND '.join(clauses), params):
                check()
                if dot(q, (row['cx'], row['cy'], row['cz'])) < row['min_dot'] - 1e-10:
                    continue
                if any(dot(q, n) < -1e-10 for n in json.loads(row['normals'])):
                    continue
                matched.append(json.loads(row['metadata']))
                dates.append(row['recorded_utc'])
                if len(matched) > MAX_METADATA_ROWS:
                    raise RetrievalError('too_many_observations', 'Narrow the date range before searching this indexed field.')
        observations = parse_metadata(csv_bytes(matched), request)
        return IndexedSearch(observations, min(dates, default=''), max(dates, default=''))

    def status(self):
        with self.connect() as db:
            row = db.execute('''SELECT count(*) AS observations, min(recorded_utc) AS oldest_metadata_utc,
                max(recorded_utc) AS newest_metadata_utc FROM observations''').fetchone()
            return {**dict(row), 'coverage': 'partial', 'max_observations': MAX_INDEX_ROWS}


@lru_cache(maxsize=4)
def _configured(path, seeds):
    index = ObservationIndex(Path(path))
    if seeds:
        index.seed(Path(seeds))
    return index


def configured_index():
    path = os.environ.get('KHONSU_OBSERVATION_INDEX_DB')
    return _configured(path, os.environ.get('KHONSU_OBSERVATION_INDEX_SEEDS', '')) if path else None
