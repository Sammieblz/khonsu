"""Bounded, optional Gaia DR3 context. This is not a science image adapter."""
from collections import OrderedDict
import csv
from datetime import datetime, timezone
import hashlib
import math
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

from ..jobs import JobError
from ..schemas import GaiaContext

CATALOG_URL = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv'
MAX_ROWS = 500
MAX_BYTES = 1024 * 1024
CACHE_SECONDS = 600
_cache = OrderedDict()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(2)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def catalog_query(ra, dec, radius):
    # Values come exclusively from a validated server-owned manifest, never SQL.
    return CATALOG_URL + '?' + urlencode({
        '-source': 'I/355/gaiadr3', '-c': f'{ra:.10f} {dec:.10f}', '-c.rd': f'{radius:.10f}',
        '-out': 'Source,RA_ICRS,DE_ICRS,pmRA,pmDE,Gmag', '-out.max': str(MAX_ROWS+1), '-sort': 'Gmag',
    })


def fetch_catalog(query):
    request = Request(query, headers={'Accept': 'text/plain', 'User-Agent': 'Khonsu/1.0 context'})
    deadline = time.monotonic() + 25
    with build_opener(NoRedirect).open(request, timeout=15) as response:
        if int(response.headers.get('Content-Length', '0')) > MAX_BYTES:
            raise ValueError('Catalog exceeds byte limit')
        data = bytearray()
        while True:
            chunk = response.read1(min(16384, MAX_BYTES + 1 - len(data)))
            data.extend(chunk)
            if len(data) > MAX_BYTES or time.monotonic() > deadline:
                raise ValueError('Catalog exceeds byte or time limit')
            if not chunk:
                break
    return bytes(data)


def parse_catalog(data):
    if len(data) > MAX_BYTES:
        raise ValueError('Catalog exceeds byte limit')
    text = data.decode('utf-8-sig')
    if '#Name: I/355/gaiadr3' not in text or '#Coosys\tH_2016.000:\tICRS' not in text:
        raise ValueError('Catalog release or epoch is not the expected Gaia DR3 table')
    lines = [line for line in text.splitlines() if line.strip() and not line.startswith('#')]
    reader = csv.DictReader(lines, delimiter='\t')
    names = {'Source':'source_id', 'RA_ICRS':'ra', 'DE_ICRS':'dec', 'pmRA':'pmra', 'pmDE':'pmdec', 'Gmag':'phot_g_mean_mag'}
    if not names.keys() <= set(reader.fieldnames or []):
        raise ValueError('Catalog response has no expected columns')
    # ASU TSV puts units and a separator immediately after column names.
    next(reader, None)
    separator = next(reader, None)
    if not separator or any(set(value.strip()) - {'-'} for value in separator.values()):
        raise ValueError('Invalid catalog table header')
    rows, seen, skipped = [], set(), 0
    count = 0
    for raw in reader:
        count += 1
        if count > MAX_ROWS:
            break
        try:
            identity = raw['Source'].strip()
            if not identity.isascii() or not identity.isdigit() or len(identity) > 20 or identity in seen:
                raise ValueError('Invalid source identifier')
            row = {'source_id': identity, 'ref_epoch': 2016.0}
            for column, name in names.items():
                if name == 'source_id':
                    continue
                value = raw[column].strip()
                row[name] = float(value) if value.lower() not in ('', 'null', 'nan') else None
                if row[name] is not None and not math.isfinite(row[name]):
                    raise ValueError('Nonfinite catalog field')
            if not (0 <= row['ra'] < 360 and -90 <= row['dec'] <= 90 and 1900 <= row['ref_epoch'] <= 2100):
                raise ValueError('Invalid position or epoch')
            seen.add(identity)
            rows.append(row)
        except (ValueError, TypeError, AttributeError):
            skipped += 1
    return rows, count > MAX_ROWS, skipped


def gaia_context(manifest):
    if manifest.data_mode == 'synthetic' or not manifest.grid.wcs_header:
        raise JobError(409, 'CONTEXT_UNAVAILABLE', 'Catalog context requires real observations with a celestial grid.')
    key = hashlib.sha256(manifest.model_dump_json().encode()).hexdigest()
    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
    if not _slots.acquire(blocking=False):
        raise JobError(429, 'CONTEXT_BUSY', 'Two catalog lookups are already running. Retry shortly; observations remain available.')
    try:
        from ..processing.catalog import project_sources, query_radius
        radius = query_radius(manifest)
        query = catalog_query(manifest.target.ra_deg, manifest.target.dec_deg, radius)
        rows, truncated, skipped = parse_catalog(fetch_catalog(query))
        sources = project_sources(manifest, rows)
        notes = [
            'Gaia DR3 optical catalog context, not SPHEREx detections or confirmed associations. Absence is not evidence of a new object.',
            'Positions use catalog proper motion at each exposure start when available. Annual parallax, perspective acceleration and uncertainty propagation are not applied.',
            'Sources missing either proper-motion component stay at their catalog epoch and use dashed markers.',
            'The query adds a 6 arcmin motion margin. Very fast sources outside that margin can be missed.',
        ]
        if truncated:
            notes.append('Catalog limited to the first 500 rows ordered by G magnitude before grid clipping. Fainter sources can be omitted; use a smaller field.')
        if skipped:
            notes.append(f'{skipped} malformed catalog rows were excluded.')
        result = GaiaContext(
            sequence_id=manifest.sequence_id, retrieved_at_utc=datetime.now(timezone.utc),
            query_ra_deg=manifest.target.ra_deg, query_dec_deg=manifest.target.dec_deg,
            query_radius_deg=radius, query_url=query, truncated=truncated, sources=sources, notes=notes,
        )
        with _lock:
            _cache[key] = (time.monotonic() + CACHE_SECONDS, result)
            _cache.move_to_end(key)
            while len(_cache) > 16:
                _cache.popitem(last=False)
        return result
    except JobError:
        raise
    except Exception as exc:
        raise JobError(503, 'CONTEXT_UNAVAILABLE', 'Gaia context could not be loaded from VizieR. Retry later; SPHEREx playback is unaffected.') from exc
    finally:
        _slots.release()
