"""Operator-only observation index status and bounded live metadata refresh.

Run in Docker: python -m app.retrieval.sync_index status
Refresh: python -m app.retrieval.sync_index refresh --presets
One field: python -m app.retrieval.sync_index refresh --ra 270 --dec 66.56
No fallback is used by refresh: failures retain the existing index and exit 1.
"""
import argparse
from datetime import datetime, timezone
import json
import time

from .index import configured_index
from .presets import PRESETS, preset_position
from .service import IrsaRetriever, MAX_METADATA_BYTES, RetrievalError, query_url
from ..schemas import SequenceRequest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['status', 'refresh'])
    parser.add_argument('--presets', action='store_true')
    parser.add_argument('--ra', type=float)
    parser.add_argument('--dec', type=float)
    args = parser.parse_args()
    index = configured_index()
    if index is None:
        parser.error('Set KHONSU_OBSERVATION_INDEX_DB to a persistent server-side path')
    if args.command == 'status':
        print(json.dumps(index.status()))
        return 0
    targets = []
    if args.presets:
        if args.ra is not None or args.dec is not None:
            parser.error('Choose --presets or --ra and --dec')
        for name in PRESETS:
            ra, dec = preset_position(name)
            targets.append((name, ra, dec))
    elif args.ra is not None and args.dec is not None:
        targets.append(('custom', args.ra, args.dec))
    else:
        parser.error('Refresh needs --presets or both --ra and --dec')
    failed = False
    for name, ra, dec in targets:
        request = SequenceRequest(ra_deg=ra, dec_deg=dec, fov_arcmin=6, max_frames=2)
        retriever = IrsaRetriever(deadline_seconds=60)
        retriever._deadline = time.monotonic() + 60
        try:
            url = query_url(request)
            payload = retriever._read(url, MAX_METADATA_BYTES)
            count = index.ingest(payload, query_url=url, recorded_utc=datetime.now(timezone.utc).isoformat())
            print(json.dumps({'target': name, 'status': 'refreshed', 'records': count}), flush=True)
        except RetrievalError as exc:
            failed = True
            print(json.dumps({'target': name, 'status': 'failed', 'code': exc.code, 'message': exc.message}), flush=True)
    print(json.dumps(index.status()))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
