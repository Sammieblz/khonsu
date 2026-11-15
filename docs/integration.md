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

## Shared search links

The address bar describes the live search on screen, so copying it, or using **Copy search link** on a ready sequence, reproduces that search. The link is a plain query string on the static page; no Next.js server route is involved. `readSharedSearch` and `sharedSearchQuery` in `apps/web/src/features/explorer/coordinates.ts` own the format.

| Parameter | Meaning | When invalid |
| --- | --- | --- |
| `ra_deg` | Right Ascension, ICRS decimal degrees, at least 0 and less than 360 | Nothing is restored, and the form explains why |
| `dec_deg` | Declination, ICRS decimal degrees, from -90 to +90 | Nothing is restored, and the form explains why |
| `fov_arcmin` | Field of view in arcminutes, from 0.5 to 120 | The default 6′ is used, with a note |
| `frame` | `ICRS`, the only supported frame | Any other frame restores nothing |
| `obs` | IRSA observation ID to select | Ignored unless it is a plain identifier; selected only if the returned sequence contains it |

Opening a link fills the form; the visitor still chooses **Explore the sky**, so a link never starts an archive download by itself. The frame count stays the form's fixed bound because links cannot carry it. Coordinates are validated with the same rules as typed input and are never wrapped, clamped or rounded, so a link cannot silently move the requested position. Unknown parameters are ignored, and values that look like URLs are never used. Loading a cached example clears the parameters, because a link cannot reproduce it. Candidate notes stay in the browser and are never part of a link. The frontend does not yet expose wavelength or time filters, so links do not carry them.

## Candidate marks

A candidate is a person's local mark on a sequence, not a detection. The viewer's Mark tool emits an `ImageSelection` (`apps/web/src/features/explorer/interfaces.ts`). It holds the zero-based column and row on the common output grid with a top-left origin, the frame on screen, the A/B comparison chosen at that moment, and whether the frame's verified raster mask has data at that pixel (`null` when only a PNG is available). Clicks outside the displayed canvas produce no selection.

Saving a note creates a `CandidateAnnotation` (record version 2, `origin: "human"`).

- **Sky position.** `rasterToSky` in `apps/web/src/features/annotations/sky.ts` converts the grid pixel to ICRS RA and Dec in degrees using the sequence's `grid.wcs_header` and `raster_to_wcs`.
  - It implements only the TAN projection that processing writes, following FITS WCS Paper II.
  - It refuses distortion terms, other projections, other frames or units, and singular matrices.
  - A refused or missing WCS leaves `sky: null` with a stated `skyUnavailableReason`, so RA and Dec are never estimated.
  - `apps/web/tests/sky.test.ts` checks it against astropy 7.0.1. It agrees within 1e-6″ for both committed real grids, a field near the pole, a field crossing RA 0, a rotated CD matrix and a PC matrix.
- **Sequence snapshot.** Alongside the candidate, the browser keeps a snapshot of its sequence (`SequenceContext`). The snapshot copies these from the manifest on screen:
  - every frame's real UTC times, release, detector, wavelength, masked fraction, source FITS URL and warnings;
  - the grid and WCS;
  - the display settings, processing record and sequence warnings.

  It also keeps the search that reproduces the field: the search link, for live and cached-real data, or none for synthetic fixtures. The candidate stays explainable after a live job expires or the page reloads. A snapshot is removed when its last candidate is deleted.
- **On the image.** Every frame shares one grid, so a mark is the same sky position on every epoch.
  - The viewer draws each mark of the sequence on every frame: solid on the frame it was made on, dashed on the others.
  - Marks are numbered as in the candidate list, and the selected one is cyan.
  - Marks are drawn on the transformed canvas, so pan and zoom move them with the image.
  - Marks from other sequences are listed but not drawn, since their grid is not on screen.

![The cached real WISE 0855 sequence on its second observation, with two marks made on the first observation drawn dashed at the same grid positions, next to the candidate panel. Each candidate shows its ICRS position, grid pixel, marked observation and A/B comparison. One is flagged as having no valid data at its pixel, and the other shows when its note was edited.](images/candidate-marks.png)

Records live in browser storage under `khonsu.candidates.v2` as `{ "schema": "khonsu-candidates", "version": 2, "candidates": [...], "sequences": {...} }`, holding at most 200 candidates and 2,000,000 characters.

- Version 1 notes are migrated as pixel-only candidates.
- A candidate or snapshot this version cannot read is kept under `unreadable` and written back unchanged.
- Unreadable or incompatible data is left untouched. The panel offers to download it or to replace it with the current page's candidates.
- If storage is unavailable or a save fails, candidates keep working for the visit, and the panel says they will not survive a reload.

## Evidence export

A search link and an evidence file do different jobs. The link repeats a search, and it never carries notes. The evidence file is the only way notes leave the browser where they were made. **Export** on a candidate, or **Export all saved candidates**, downloads a JSON file in the browser. There is no upload, no account and no server route. Exports work from the candidates in memory, so damaged or blocked browser storage never prevents one. The panel can also preview the file.

![Two candidates on the cached real WISE 0855 sequence, each with Show, Edit, Export and Delete actions, followed by Export all saved candidates, the confirmation of the downloaded file, an explanation of what an evidence file holds, and the open preview of the JSON](images/evidence-export.png)

`buildEvidence` in `apps/web/src/features/annotations/evidence.ts` writes format `khonsu-evidence`, `schema_version` `1.0`:

| Field | Contents |
| --- | --- |
| `notice`, `sharing` | The candidate disclaimer, and how this file differs from a search link |
| `contains_synthetic_input` | `true` when any candidate was marked on a synthetic fixture |
| `candidates[]` | ID, `origin: "human"`, `review_status: "unreviewed candidate"`, note, created and edited UTC times, `sequence_id`, `marked_frame` and `comparison.a` / `comparison.b` (frame ID, observation ID, real start time) |
| `candidates[].position` | `grid_pixel` (zero-based, top-left, integer centers), `sky` (ICRS degrees and conversion method, or `null` with `sky_unavailable_reason`), `pixel_has_data`, and additive `pixel_quality` (strict-valid, warning-only, unavailable or unknown) |
| `sequences[]` | The sequence snapshot recorded with the candidates (see [candidate marks](#candidate-marks)), plus `synthetic_input` and `query` (the reproducible search link and what it reproduces, or `null` for synthetic fixtures) |

Observation values are copied from the manifest that was on screen when the mark was made. None are re-derived at export time.

A candidate whose snapshot is missing (a migrated version 1 note) exports with `sequence_snapshot_available: false` and frame references without observation details.

File names are `khonsu-evidence-<sequence>-<candidate id prefix>.json` for one candidate and `khonsu-evidence-<count>-candidates-<UTC time>.json` for a set.

[`examples/evidence-example.json`](examples/evidence-example.json) is a labelled documentation example. It is built from the committed cached real WISE 0855 sequence, with two marks made only to illustrate the format; its link uses the reserved `khonsu.example` host. `apps/web/tests/evidence.test.ts` fails when the example no longer matches the code. Regenerate it with `UPDATE_EVIDENCE_EXAMPLE=1 npm --prefix apps/web run test`, and review the diff.

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
| SITE NOT CONNECTED TO A SERVICE | `API_NOT_CONFIGURED`, raised in the browser before any request when a public page would call a loopback or insecure API origin | None; the site operator must rebuild with `NEXT_PUBLIC_API_BASE_URL` (see [deployment](deployment.md#frontend-static-export)) |
| SEARCH CANCELLED | `CANCELLED` | Search again, edit search |

![Six search panels captured from the production static build: not enough comparable observations, IRSA archive unavailable, the cached real example loaded from that failure, search expired after a backend restart, observation service unreachable, and search cancelled](images/search-recovery-states.png)

The panels above were captured on November 14, 2026 from the production static build against live IRSA and a test backend on another origin. The archive outage was simulated by routing the backend's IRSA requests to a closed local port, and the restart by stopping and starting the API during a search.

The cached example is not offered when the backend is unreachable, because the same backend serves it. A web test scans the API source for raised error codes and fails when one has no explicit state, so add the mapping when you add a code.

## Change procedure

Agree field names and units in the linked issue. Change Python schemas, regenerate OpenAPI and TypeScript, update fixtures and examples, then adjust both client and server in the same PR. Tyrone reviews the public contract. Samuel reviews science fields. Robel reviews composition changes. Run the contract and API checks in `docs/testing.md` before merge.

