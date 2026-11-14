# Integration contracts

The authoritative public models live in `apps/api/app/schemas.py`. Export them through FastAPI's OpenAPI document into `contracts/openapi.json`, then regenerate `apps/web/src/lib/api/generated.d.ts`. Read the contracts README for the current snapshot status and exporter commands. Any bootstrap snapshot must be regenerated and checked against a running dependency-enabled API before release.

## Request lifecycle

1. The frontend validates explicit RA and Dec units and converts the search to ICRS decimal degrees. The API independently validates every bound. Dates require timezone offsets; display observation times in UTC.
2. `POST /v1/sequences` accepts a bounded search and returns a sequence/job identifier when the job implementation exists. The scaffold explicitly returns an unavailable response rather than claiming to have submitted a job.
3. Poll `GET /v1/sequences/{sequence_id}` with capped backoff. The current job schema defines queued, retrieving, processing, ready and failed states. Cancellation and expiry need a coordinated schema update when implemented. Stop polling on terminal state, cancellation, route change or component unmount.
4. On completion, fetch `GET /v1/sequences/{sequence_id}/manifest`. Load only the current frame and a small adjacent prefetch window through API-controlled artifact routes.
5. Keep real dates on irregular time-axis positions. Select the nearest actual observation; never interpolate a new science image. A/B comparison references two real frame IDs.
6. On expiry or restart, offer to repeat the saved query. A stable query URL contains source, units, coordinates, field of view and filters, not local files or an assumed permanent artifact ID.

## HTTP surface

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Process health, not a claim the archive is available |
| `GET /v1/presets` | Five challenge target names and honest readiness metadata |
| `POST /v1/sequences` | Validate and start a bounded retrieval/processing job |
| `GET /v1/sequences/{sequence_id}` | Progress, actionable error or completed manifest reference |
| `GET /v1/sequences/{sequence_id}/manifest` | Prepared chronological frame manifest |
| `GET /v1/demo/manifest` | Explicit synthetic development manifest |
| `GET /v1/demo/frames/{filename}` | Allowlisted synthetic assets only |

The checked-in OpenAPI file is the exact field and status-code contract. Real frame delivery will use an API-controlled artifact route added with the live pipeline. Do not assume all planned routes are functional in the scaffold. Avoid returning internal paths, upstream credentials, or unbounded archive response bodies in errors.

## Scientific handoff

Tyrone's retrieval adapter returns downloaded local files plus source URL, release, observation ID, detector, actual observation time, wavelength metadata, quality information and target position. Samuel's processing entry point receives these files, query, processing settings and an output directory. It returns a manifest and artifacts or a typed, actionable failure. Network retries belong to retrieval. Scientific validation belongs to processing.

The manifest must carry common output WCS and angular field of view, image dimensions, mask information, actual per-frame dates, effective wavelength information at the target, processing/stretch settings, and traceable source identifiers. A detector number alone does not establish spectral compatibility. See `docs/science-integrity.md` before choosing or combining frames.

## Frontend feature seam

The explorer owns active sequence, current frame index, A/B frame IDs, selected tool, playback preference, and active candidate. Michael's viewer takes controlled state and emits frame and pixel-selection events. Aryan's annotations consume the same frame ID and output WCS metadata, convert the selected position through one tested coordinate utility, and preserve both pixel and sky coordinates with units. Avoid separate copies of active-frame state in child features.

The browser reads `NEXT_PUBLIC_API_BASE_URL` at build time. Static Cloudflare Pages cannot read a changed API base at runtime without a rebuild or an explicitly designed configuration asset. Local defaults use http://localhost:8000. Production must use an HTTPS API origin with configured CORS.

## Error and data modes

The UI distinguishes live data, previously acquired real data, and synthetic development fixtures. Labels persist through exported evidence. Show actionable states for missing coverage, too few comparable epochs, incompatible wavelengths, masked targets, timeouts, download bounds, processing failure, job expiry, failed frame loads and unavailable backend. Do not switch silently to synthetic data.

## Change procedure

Agree field names and units in the linked issue. Change Python schemas, regenerate OpenAPI and TypeScript, update fixtures and examples, then adjust both client and server in the same PR. Tyrone reviews the public contract. Samuel reviews science fields. Robel reviews composition changes. Run the contract and API checks in `docs/testing.md` before merge.
