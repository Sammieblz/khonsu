# Integration contracts

The authoritative public models live in `apps/api/app/schemas.py`. Export them through FastAPI's OpenAPI document into `contracts/openapi.json`, then regenerate `apps/web/src/lib/api/generated.d.ts`. Read the contracts README for the current snapshot status and exporter commands. The checked-in snapshot and declarations were exported from the actual dependency-enabled FastAPI app in CI. CI verifies semantic agreement and generated types without rewriting tracked files.

## Request lifecycle

1. The frontend validates explicit RA and Dec units and converts the search to ICRS decimal degrees. The API independently validates every bound. Dates require timezone offsets; display observation times in UTC.
2. `POST /v1/sequences` accepts a bounded search and returns a sequence/job identifier when the job implementation exists. The API returns HTTP 202 and a temporary sequence/job record; completion must be polled.
3. Poll `GET /v1/sequences/{sequence_id}` with capped backoff. The job schema defines queued, retrieving, processing, ready, failed, cancelled and expired states. POST `/v1/sequences/{sequence_id}/cancel` cancels cooperatively; expired or unknown jobs return HTTP 410. Stop polling on terminal state, cancellation, route change or component unmount.
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
| `POST /v1/sequences/{sequence_id}/cancel` | Cooperative cancellation |
| `GET /v1/sequences/{sequence_id}/frames/{filename}` | Manifest-allowlisted PNG frame |
| `GET /v1/examples` | List of bundled, verified cached-real manifests, possibly empty |
| `GET /v1/examples/{example_id}/frames/{filename}` | Allowlisted cached-real PNG frame |
| `GET /v1/demo/manifest` | Explicit synthetic development manifest |
| `GET /v1/demo/frames/{filename}` | Allowlisted synthetic assets only |

The checked-in OpenAPI file is the exact field and status-code contract. Real frame delivery uses API-controlled artifact routes. The browser client in `apps/web/src/lib/api/client.ts` implements this lifecycle: `runSequenceJob` creates the job, polls with capped backoff (1 s growing to 5 s, abandoned and cancelled after 10 minutes), maps HTTP 410 to a repeat-the-search state and fetches the manifest when ready. It also:

- Cancels the server job whenever the caller aborts, including during job creation. The create request is allowed to finish so its job identifier is known, then cancelled. No request follows the cancel.
- Tolerates up to two consecutive unreachable polls, so a brief backend restart ends in the 410 expired state instead of a network error.
- Returns a manifest only when its `sequence_id`, `data_mode: "live"` and target coordinates match the job and search that requested it.

`SequenceSession` in `apps/web/src/lib/api/session.ts` keeps one live search per screen. A new search aborts the previous one and waits for that job's cancellation before creating its own, so a replaced search cannot deliver frames, report progress, keep polling or be merged with the new request by the server's duplicate-request reuse. Avoid returning internal paths, upstream credentials, or unbounded archive response bodies in errors.

## Scientific handoff

Tyrone's retrieval adapter returns downloaded local files plus source URL, release, observation ID, detector, actual observation time, wavelength metadata, quality information and target position. Samuel's processing entry point receives these files, query, processing settings and an output directory. It returns a manifest and artifacts or a typed, actionable failure. Network retries belong to retrieval. Scientific validation belongs to processing.

The manifest must carry common output WCS and angular field of view, image dimensions, mask information, actual per-frame dates, effective wavelength information at the target, processing/stretch settings, and traceable source identifiers. A detector number alone does not establish spectral compatibility. See `docs/science-integrity.md` before choosing or combining frames.

## Frontend feature seam

The explorer owns active sequence, current frame index, A/B frame IDs, selected tool, playback preference, and active candidate. Michael's viewer takes controlled state and emits frame and pixel-selection events. Aryan's annotations consume the same frame ID and output WCS metadata, convert the selected position through one tested coordinate utility, and preserve both pixel and sky coordinates with units. Avoid separate copies of active-frame state in child features.

The browser reads `NEXT_PUBLIC_API_BASE_URL` at build time. Static Cloudflare Pages cannot read a changed API base at runtime without a rebuild or an explicitly designed configuration asset. Local defaults use http://localhost:8000. Production must use an HTTPS API origin with configured CORS.

## Error and data modes

The UI distinguishes live data, previously acquired real data, and synthetic development fixtures. Labels persist through exported evidence. Show actionable states for missing coverage, too few comparable epochs, incompatible wavelengths, masked targets, timeouts, download bounds, processing failure, job expiry, failed frame loads and unavailable backend. Do not switch silently to synthetic data.

`describeFailure(code)` in the API client maps every search error code to one of these states. The search panel shows the state's heading, the server's message and validation details, guidance, and only the actions that can help. The cached real example is offered only when the backend has bundled examples, and loading it is always a deliberate click that keeps the `CACHED REAL EXAMPLE` label.

| State heading | Error codes | Actions offered |
| --- | --- | --- |
| CHECK THE SEARCH | `INVALID_REQUEST`, `invalid_target`, `INVALID_PROCESSING_OPTIONS` | Edit search |
| NOT ENOUGH COMPARABLE OBSERVATIONS | `NO_USABLE_COVERAGE`, `INSUFFICIENT_EPOCHS`, `INSUFFICIENT_COMPARABLE_EPOCHS`, `INSUFFICIENT_SPECTRAL_OVERLAP` | Edit search, cached example |
| SEARCH TOO LARGE | `too_many_observations`, `archive_size_limit`, `RESOURCE_LIMIT` | Edit search |
| IRSA ARCHIVE UNAVAILABLE | `archive_busy`, `archive_unavailable`, `empty_archive_response`, `invalid_archive_response`, `invalid_fits`, `unsafe_source_url` | Retry, cached example |
| OBSERVATION SERVICE BUSY | `QUEUE_FULL`, `CACHE_FULL`, `CACHE_UNAVAILABLE` | Retry, cached example |
| SEARCH TOOK TOO LONG | `JOB_TIMEOUT`, `archive_timeout`, `POLL_TIMEOUT` | Retry, edit search, cached example |
| ARCHIVE DATA COULD NOT BE USED | `INVALID_FITS`, `INVALID_WCS`, `INVALID_PROVENANCE`, `MISSING_QUALITY_DATA`, `MISSING_SPECTRAL_METADATA`, `UNSUPPORTED_RELEASE`, `UNSUPPORTED_FLUX_UNIT` | Edit search, cached example |
| PROCESSING FAILED | `PROCESSING_FAILED`, `INVALID_RESPONSE` and any unrecognised code | Retry, edit search, cached example |
| SEARCH EXPIRED | `JOB_EXPIRED` (also a backend restart), `ASSET_EXPIRED` | Retry |
| OBSERVATION SERVICE UNREACHABLE | `BACKEND_UNAVAILABLE` | Retry |
| LIVE SEARCH NOT AVAILABLE | `SCIENCE_UNAVAILABLE`, `SCIENCE_DEPENDENCIES_MISSING` | Cached example |
| SEARCH CANCELLED | `CANCELLED` | Search again, edit search |

The cached example is not offered when the backend is unreachable, because the same backend serves it. A web test scans the API source for raised error codes and fails when one has no explicit state, so add the mapping when you add a code.

## Change procedure

Agree field names and units in the linked issue. Change Python schemas, regenerate OpenAPI and TypeScript, update fixtures and examples, then adjust both client and server in the same PR. Tyrone reviews the public contract. Samuel reviews science fields. Robel reviews composition changes. Run the contract and API checks in `docs/testing.md` before merge.

