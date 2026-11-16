# Production observation discovery during IRSA search outages

GitHub #85 / Linear BYT-56. Samuel authorized this bounded metadata database on
November 16, 2026. It restores fresh downloads for indexed footprints when IRSA
discovery fails. It does not mirror IRSA's complete observation catalog.

## Request path

The public frontend sends coordinates to the Docker API through the existing
named Cloudflare Tunnel. The backend tries the official DR1/QR3 SIA search with
bounded retries. A successful response is authoritative, including an empty
result; its usable metadata also updates the local SQLite index.

Only transient discovery failures allow the local lookup. Bad responses, unsafe
URLs, invalid requests and cancellation do not trigger it. The lookup tests the
requested centre against real convex spherical ICRS footprints, including RA
wrap and polar fields. Time, detector and spectral-interval filters apply.
The existing CPython processor still checks the target's actual wavelength,
aligns WCS, preserves masks and selects compatible real observation dates.

Each matched FITS cutout is downloaded anew using the user's coordinates and
field size. No PNG from a cached example is substituted. The resulting manifest
keeps `data_mode: live`, and adds existing-contract provenance values:

- `processing.observation_discovery`: `irsa-sia` or `local-index`.
- For a local lookup: `observation_index_coverage: partial`, record count,
  `observation_metadata_oldest_utc` and `observation_metadata_newest_utc`.
- A `LOCAL_OBSERVATION_INDEX` warning explains metadata age and incompleteness.
- The console labels this result `LIVE / INDEXED SEARCH`; Info retains the
  complete warning and original file/observation provenance.

An unmatched local query during an outage returns `archive_unavailable` and
explains that no matching indexed records exist. It does not claim no sky
coverage. Previously indexed records can be outdated or removed upstream;
download failures remain explicit and normal bounded skip rules still apply.

## Persistence, bootstrap and limits

Compose sets `KHONSU_OBSERVATION_INDEX_DB=/app/data/observations.sqlite3` on the
existing persistent `notebook-data` volume. This separate database survives API
recreation and does not change notebook contents or temporary science jobs.
`KHONSU_OBSERVATION_INDEX_SEEDS=/app/fixtures/archive-index` enables the verified
[bootstrap snapshots](../fixtures/archive-index/README.md). Without the database
environment variable, retrieval remains live-only.

Seed imports are checksummed and idempotent. Older seed data cannot overwrite
newer metadata for the same URL. The initial 1,387 records cover footprints
around WISE 0855, Epsilon Indi B and the north ecliptic pole. Other challenge
targets have no guaranteed outage coverage until their metadata is refreshed.
The archive service must be reachable to discover currently unindexed regions.

SQLite storage is capped at 64 MiB and 25,000 observation rows; oldest metadata
is evicted first. Each response is bounded to 8 MiB and 5,000 rows. Unsupported
footprints are not indexed. No client can supply an arbitrary index file, data
source URL or import payload. Disk/import problems never disable a successful
live search. The existing 256 MiB download cap and 240-second job limit remain.

## Operator commands

Inspect persistent metadata without contacting IRSA:

```sh
docker compose exec -T api python -m app.retrieval.sync_index status
```

Refresh a bounded field from live SIA, or the five named challenge presets:

```sh
docker compose exec -T api python -m app.retrieval.sync_index refresh --ra 270 --dec 66.5607
docker compose exec -T api python -m app.retrieval.sync_index refresh --presets
```

Refresh never reports saved records as a successful live refresh. A failure
exits nonzero and preserves existing data. Normal successful visitor searches
also grow the index. Refresh is an operator command, not a public ingestion API
or an unbounded crawler. No paid services or credentials are added.

After deploying with the [named tunnel overlay](tunnel-deployment.md), require
a completed fresh query, not just health or cached image checks:

```sh
python scripts/verify-tunnel.py --base-url https://api.khonsulive.earth --live-search
```

That command requests RA 270.02 degrees, Dec 66.51 degrees, a six-arcminute field
and up to 24 frames. It checks live mode, target agreement, distinct real dates,
source provenance and two actual frame downloads. A failed or timed-out job
fails verification. Use `--ra`, `--dec` and `--max-frames` for another field.

For manual testing, enter the same coordinates at `/console/` and start a new
archive search. Expect `LIVE / INDEXED SEARCH` while discovery is unavailable,
with real dates and the metadata warning in Info. A different unindexed field
must show the unavailable-index message, not silently open an example.

## Source and verification

IRSA documents separate SIA discovery, original FITS URLs and coordinate cutout
downloads in its [SPHEREx data access guide](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/).
The [official cloud mirror](https://irsa.ipac.caltech.edu/cloud_access/) exposes
files, but does not by itself replace coordinate metadata discovery. This pass
uses the verified working IRSA cutout service; it does not add an untested S3
processing path.

Automated checks exercise footprint geometry, invalid metadata, date/band
filters, restart, row limits, seed integrity, cancellation, upstream recovery,
failed refresh and provenance publication. Real production acceptance is
recorded below only after the new Docker image completes a public query.

## Verified production API, November 16, 2026

- Fresh public HTTPS request at RA 270.02, Dec 66.51 completed in 49.3 seconds
  with three real frames from May 5, 2025, March 28, 2026 and September 7, 2026.
  Target wavelengths were approximately 3.998 micrometres. The request used
  the partial index while the live SIA service continued returning HTTP 502.
- CORS/preflight, PNG delivery, validation, notebook privacy and the existing
  cached-example path passed the same production-origin smoke check.
- Replacing the API container preserved the 2,252,800-byte SQLite database
  exactly, including its hash and modification time, before reinitialization.
- Local Docker browser search at RA 270.03, Dec 66.52 used the normal form's
  16-frame request and produced two compatible QR3 observations. Stepping,
  indexed-search labelling, Info provenance, actual image assets and desktop/
  mobile layouts passed without page errors.
- 178 API/science tests, 111 frontend tests, typecheck, static build, authoritative
  contract checks, Compose validation and repository checks passed.

The [public API record](evidence/observation-index/public-api.json) preserves the
query, source identities, real dates, wavelengths and discovery disclosure.
This establishes the verified fields at test time, not all-sky availability or
uninterrupted IRSA service. Re-run the live verification after hosting changes.
