# Shared API contract

The public Python models are in `apps/api/app/schemas.py`. Internal retrieval
and processing handoffs are separate dataclasses and protocols in
`apps/api/app/interfaces.py`.

`openapi.json` is an initial **bootstrap, unverified snapshot**. This machine
cannot install FastAPI because package-host DNS is unavailable. The snapshot
is marked with `x-khonsu-contract-status`; it is not represented as output from
a successful running API. Replace it in a dependency-enabled environment:

```sh
python -m pip install -r apps/api/requirements-dev.txt
python scripts/export-contracts.py
python scripts/export-contracts.py --check
```

The exporter obtains the actual FastAPI schema, writes `contracts/openapi.json`,
and generates `apps/web/src/lib/api/generated.d.ts`. Do not edit generated
TypeScript manually. This small exporter emits schema types only, not a fetch
client. The normal `--check` compares actual runtime schemas, validation
constraints, defaults, endpoint parameters and request/response shapes against
the snapshot, ignoring generated documentation descriptions and titles. It also
compares generated TypeScript exactly. Numeric limits and cross-field rules
still require server validation.

An offline type-only path is available:

```sh
python scripts/export-contracts.py --from-snapshot
python scripts/export-contracts.py --from-snapshot --check
```

That path verifies coherence with the committed snapshot. It does not verify
that the live API matches the snapshot.

## Semantics

- Coordinates are ICRS, right ascension and declination in decimal degrees.
- Requested field size is in arcminutes. The grid describes actual raster size.
- Browser image pixels use a top-left origin and zero-based integer centers.
  CSS display positions must be scaled to natural raster positions before WCS
  conversion. Real manifests require `grid.wcs_header`, a FITS WCS scalar-card
  map, and `grid.raster_to_wcs`. With `identity`, pass `(x, y)` to Astropy's
  zero-based pixel-to-world API. With `flip-y`, pass `(x, height_px - 1 - y)`.
  FITS CRPIX cards retain their standard one-based convention; Astropy applies
  that convention internally. WCS interpretation and rendering orientation
  belong to processing. Structural schema checks cannot replace numerical WCS
  validation against reference sky positions in the real-data milestone.
- Exposure times are timezone-aware and normalized to UTC. No frame is invented
  for times without observations. Synthetic fixture times are null.
- Wavelength and bandwidth are micrometers at the target position. Wavelength
  varies across a SPHEREx image. A detector ID from 1 through 6 is not one of the
  102 spectral-channel indices. Processing must check wavelength compatibility.
- DR1 and QR3 are the supported release labels. QR2/QR3 mixing is not supported.
- `masked_fraction` is the invalid-pixel fraction, not a discovery confidence.
  Empty coverage and warnings must stay visible to the viewer.
- `data_mode` distinguishes synthetic graphics, cached real observations and
  live observations. Real manifests require exposure times and source metadata;
  that requirement is necessary, but is not itself scientific verification.
- A common display stretch applies to the sequence. Difference processing uses
  floating-point science values and masks before rendering display images.

## Foundation endpoints

| Endpoint | Current behavior |
| --- | --- |
| `GET /health` | Healthy process, explicitly reports no live processing |
| `GET /v1/presets` | Five named challenge targets; coordinates unresolved |
| `POST /v1/sequences` | Validates input, then returns HTTP 501 with stable code |
| `GET /v1/sequences/{id}` | Returns HTTP 501; jobs are not implemented |
| `GET /v1/sequences/{id}/manifest` | Returns HTTP 501; real manifests unavailable |
| `GET /v1/demo/manifest` | Explicit opt-in synthetic fixture |
| `GET /v1/demo/frames/{filename}` | Exact allowlist of three synthetic SVGs |

The synthetic endpoint is never a fallback for live errors. The fixture is for
integration only. A future issue must add verified real SPHEREx fixtures and
reference images for the five challenge targets.
