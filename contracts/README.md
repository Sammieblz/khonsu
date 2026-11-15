# Shared API contract

The authoritative public models are in `apps/api/app/schemas.py`. Internal retrieval and processing handoffs are separate dataclasses and protocols in `apps/api/app/interfaces.py`.

The committed OpenAPI document and TypeScript declarations were exported from the actual FastAPI app in a dependency-enabled CI environment. They are no longer a bootstrap approximation. Never edit generated TypeScript manually.

```sh
python -m pip install -r apps/api/requirements-dev.txt -r apps/api/requirements-science.txt
python scripts/export-contracts.py
python scripts/export-contracts.py --check
```

The normal check compares runtime schema and endpoint semantics against the committed snapshot and checks generated TypeScript exactly. It also generates/checks `apps/web/src/lib/api/generated-limits.ts` from the FOV and prepared-raster constraints, so browser validation uses the authoritative numeric bounds. It ignores generated documentation titles and descriptions. The check does not rewrite files.

`--from-snapshot` can regenerate declarations offline, but does not verify the runtime. A contract change must update Python models, the exported OpenAPI document and generated TypeScript together.

## Semantics

Coordinates are ICRS decimal degrees. Angular field size is in arcminutes. Observation times are timezone-aware UTC instants from the archive. Pixel centres are zero-based, and the browser raster origin is top-left. Real grids include the FITS WCS header and an explicit raster-to-WCS transform.

Frames preserve source URLs, release, detector, observation identity, actual dates, target wavelength and bandwidth, mask fraction, quality warnings and processing settings. Same detector does not imply identical target wavelength.

POST /v1/sequences returns HTTP 202 and a job, not observations. Poll GET /v1/sequences/{id}. Fetch the manifest only when ready. Cancel through POST /v1/sequences/{id}/cancel. HTTP 410 means a temporary job expired or the backend restarted. Repeat the saved query.

The data modes are live, cached-real and synthetic. Synthetic frames cannot be relabelled as measurements. An empty cached-example list is valid until the team commits a scientifically suitable example.

