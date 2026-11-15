# Verification

Test the feature's acceptance criteria and scientific assumptions. A successful build proves compilation, not a working real-data MVP. The integrated observation console has [recorded browser acceptance](console-acceptance.md); public hosting and submission still have separate gates.

## Automated commands

From the repository root, with an activated Python 3.12 environment:

```sh
python -m pip install -r apps/api/requirements-dev.txt -r apps/api/requirements-science.txt
python -m pip install PyYAML==6.0.3
python scripts/check-repository.py
python -m pytest apps/api/tests -q
python scripts/export-contracts.py --check
npm --prefix apps/web ci
npm --prefix apps/web run test
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
docker compose config --quiet
docker compose up --build
```

The web build must produce `apps/web/out/`. The web and gateway `package-lock.json` files are committed, so CI, the web image and contributors install with `npm ci`. Pin direct requirements and keep dependency updates owned by Robel or Tyrone; a dependency change commits the reviewed manifest and lockfile together.

`export-contracts.py` has a documented bootstrap snapshot mode for offline development. Live FastAPI export in an installed environment is authoritative. A mismatch must be reconciled by regenerating the contract, reviewing the diff and updating the TypeScript output together. Do not weaken the check to hide drift.

The repository check rejects the em dash character in authored tracked text, validates Markdown links, checks skill metadata and ensures required foundation files exist. It does not verify external link availability, source licenses, or scientific correctness. Official skill-creator validation was also run when the six skills were authored.

GitHub Actions checks repository documents, Python routes/contracts, frontend logic/types/static export, and local container startup. Check the actual run results before claiming success. Deployment requires a separate Cloudflare validation and a real end-to-end query.

## Science acceptance

Test a small public FITS sample with recorded source URLs, release and checksums. Confirm common WCS alignment using stationary reference sources, orientation and angular footprint. Confirm masks, wavelength compatibility at the target, stable display stretch and chronological UTC dates. Use synthetic controlled fixtures to test coordinate transformations and known shifts, clearly separate from real observational evidence. Investigate residual motion caused by registration, point-spread function differences, saturation, background or masked pixels before interpreting a candidate.

Commit a five-target coverage report, including actual epoch coordinates, dates and usable frame counts. Missing or single-epoch coverage is a valid reported result. It is not a passing multi-epoch demonstration. Use one verified cached real sequence for archive-outage rehearsal. See `docs/science-integrity.md`.

## Browser acceptance

Verify the main journey at 390px and desktop widths. Test keyboard focus, labelled icons, reduced motion, pointer cancellation, visible selection and readable contrast. In Time mode, dragging selects genuine epochs. Pan mode changes viewport only. Mark mode records the correct image/sky position at zoom and after panning. A/B blink uses two real frames with crisp transitions and a pause control.

Verify invalid RA/Dec, no coverage, one usable frame, incompatible wavelength, failed image, backend offline, archive timeout, cancelled query, expired job and container restart. Ensure stale network responses cannot overwrite a newer query. Confirm a shared URL reproduces the query and candidate export contains source lineage and limitations.

Run `node scripts/audit-accessibility.mjs` against a static export for viewport overflow, 44 px targets, axe-core WCAG 2.1 AA rules, reduced motion and the keyboard-only journey through export. [Results and setup](accessibility-acceptance.md) list what it does not cover.

Run `node scripts/verify-observatory.mjs` against a static export for the current
console acceptance suite. [Setup, recorded results and manual steps](console-acceptance.md)
cover Playwright installation, browser paths and the local API. The script uses
both authentic cached bundles plus explicitly synthetic display ramps and
transport failures. It does not claim the outstanding query-URL/export features
pass or replace public-origin deployment acceptance.

## Release rehearsal

Use a fresh checkout, the production static build and the actual backend image. Verify CORS and HTTPS on the chosen public origin, a cold start, a completed real query, and the cached-real fallback. Record the short demonstration and preserve evidence of the result. Confirm the submission portal's timezone and upload requirements. Freeze feature work before the final buffer.

