# Verification

Test the feature's acceptance criteria and scientific assumptions. A successful build proves compilation, not a working real-data MVP. The integrated observation console has [recorded browser acceptance](console-acceptance.md); public hosting and submission still have separate gates.

## Automated commands

For the named local-backend tunnel, run `python scripts/verify-tunnel.py` against
the overlay-enabled API and repeat with
`--base-url https://api.khonsulive.earth` once configured. Add `--cancel-job` to
create and immediately cancel a bounded live request. The default check uses
cached real data and a new notebook key, without changing a visitor's notes.
See [tunnel acceptance](tunnel-deployment.md#verify-before-announcing-the-public-url).

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

Run `node scripts/verify-archive-recovery.mjs` against a configured static preview
for controlled archive failure, retry and explicit cached-real recovery at desktop
and mobile sizes. The [outage investigation](archive-outage-recovery.md) records
the real upstream failure separately from the controlled browser tests.

Run `node scripts/verify-guided-notebook.mjs` for #77 / BYT-54. It checks the
three-second entry, absence of the guardian during ordinary loading, note CRUD,
JSON export, reload, offline retry, explicit tab conflicts, spring drag/release,
keyboard selection, the seven-step tour, mobile layout and static docs. Set
`AXE_SCRIPT` to the installed axe-core script for its documentation audit.
The [guided notebook record](guided-notebook.md) explains storage and limits.
`test_notebooks.py`, `notebook.test.ts`, `dial.test.ts` and the gateway tests cover
the corresponding bounded database, synchronization and geometry contracts.


For the dedicated `/console/` layout, run `node scripts/verify-console-design.mjs`.
See [the console design contract](console-design.md) for state, routing and
responsive acceptance. `verify-clean-view.mjs` and `verify-context.mjs` also use
the dedicated route. Other historical suites may need their page selectors
updated; their isolated renderer checks remain useful independently.
Run `node scripts/verify-sky-motion.mjs` for entry/loading stress and
`node scripts/verify-landing-design.mjs` for scroll, no-JavaScript and accessible
landing acceptance. `node scripts/profile-landing.mjs` compares two static
origins specified by `KHONSU_BASELINE_URL` and `KHONSU_TEST_URL`; its metadata
replay and limitations are recorded in the design report.

The [sky-context pass](sky-context.md) adds `test_catalog_context.py`,
`context.test.ts` and `node scripts/verify-context.mjs`. The browser suite needs
real Gaia/WISE services for its live checks and explicitly injects a catalog
outage for recovery testing. It also checks marker alignment, untouched canvas
pixels, quality inspection and compact links without automatic archive queries.

Verify the main journey at 390px and desktop widths. Test keyboard focus, labelled icons, reduced motion, pointer cancellation, visible selection and readable contrast. In Time mode, dragging selects genuine epochs. Pan mode changes viewport only. Mark mode records the correct image/sky position at zoom and after panning. A/B blink uses two real frames with crisp transitions and a pause control.

Verify invalid RA/Dec, no coverage, one usable frame, incompatible wavelength, failed image, backend offline, archive timeout, cancelled query, expired job and container restart. Ensure stale network responses cannot overwrite a newer query. Confirm a shared URL reproduces the query and candidate export contains source lineage and limitations.

Run `node scripts/audit-accessibility.mjs` against a static export for viewport overflow, 44 px targets, axe-core WCAG 2.1 AA rules, reduced motion and the keyboard-only journey through export. [Results and setup](accessibility-acceptance.md) list what it does not cover.

Run `node scripts/verify-observatory.mjs` against a static export for the current
console acceptance suite. [Setup, recorded results and manual steps](console-acceptance.md)
cover Playwright installation, browser paths and the local API. The script uses
both authentic cached bundles plus explicitly synthetic display ramps and
transport failures. It does not claim the outstanding query-URL/export features
pass or replace public-origin deployment acceptance.

For the optional smooth/detail renderer, also run
`node scripts/verify-enhancement.mjs` against the static export served from
`apps/web/out/` on the configured test URL. It temporarily writes isolated
renderer modules under the ignored export's `__enhancement/` directory so both
browsers can execute real module Workers, then removes those files on success.
The suite asserts the production CPU worker starts, compares every cached frame
across sampling/detail modes, checks fallbacks and records warm rendering times.
The [research report](enhancement-research.md) includes scientific controls and
manual steps. GPU/CPU agreement and display speed do not validate deconvolution.

Run `node scripts/verify-candidate-display.mjs` for the #50/#49 integration.
It checks real rendered markers at DPR 2 and the display-size cap, astropy-reference
sky positions, A/B and mask metadata, cross-epoch dashes, same-frame selection
highlights, CPU rendering, resizing and candidate reload/migration. Browser
storage is isolated from the user's notes. It also rejects an initial empty
write over existing records and verifies unreadable storage is preserved until
the visitor explicitly requests replacement.

## Wide fields and consolidated display regression

The [final PR #54 acceptance](merge-54-acceptance.md) records the authorized
integration and the slow-CPU A/B regression in both browsers.

Run `python scripts/verify-hd-field.py --download` for the explicitly bounded
two-exposure acquisition, then `node scripts/verify-hd-display.mjs` for the real
2048-square products in Chromium and Firefox. The latter replays API transport;
it verifies actual image checksums, displayed masks, native sampling, overview
geometry/keyboard actions, A/B epochs, CPU worker recovery and candidate lineage.
[Method, limits and reproduction](hd-fields.md) distinguish this from a live
search or a public deployment. Its synthetic unit tests test bounds and values,
not claimed source resolution.

Also run `node scripts/verify-resolution-lab.mjs` to preserve the resolution lab's
real-image comparisons and controls. Browser display suites share
`scripts/browser-display-modules.mjs`, which compiles the actual renderer and
generated limits rather than maintaining independent copies. Candidate tests
exercise the overview's anonymous-CORS cache behavior through eviction/reload.

## Release rehearsal

The [astro refinement pass](astro-refinement.md) adds
`python scripts/validate-refinement.py` and `node scripts/verify-refinement.mjs`.
They check real native derivatives, synthetic faint-peak attenuation, unchanged
measurement footprints, original/hold comparison, CPU/GPU agreement, cached and
live asset handling, independent optional-asset failures and legacy sequences.

The [Clean View pass](clean-view.md) adds `node scripts/verify-clean-view.mjs` for
real-image before/after differences, untouched measured pixels, original comparison,
estimated-area overlays, CPU/GPU parity, preference, candidate and fallback checks.
`python scripts/validate-clean-view.py` reproduces the real hidden-pixel evaluation;
`test_gap_fill.py` covers bounds, bright cores and unchanged inputs. Existing
enhancement controls now live inside Advanced and their suites open it explicitly.

For [bounded patch completion](gap-completion.md), also run
`python scripts/validate-gap-completion.py`. It separates quiet-background,
edge and bright-source holdout errors. The Clean View browser suite checks the
specific second-WISE-frame medium hole and three smaller patches, with accurate
remaining-gap wording and unchanged measurement validity.

The [#64 image-quality pass](image-quality.md) adds
`node scripts/verify-quality-display.mjs`. It checks real warning pixels,
strict candidate exclusion, GPU/CPU parity, manual 4K and adaptive CPU fallback,
plus the background study. `python scripts/experiment-quality.py` reproduces
the offline flag/ZODI and short-epoch coadd audit. Synthetic controls live in
`test_composites.py`; they do not establish real-source recovery.

Use a fresh checkout, the production static build and the actual backend image. Verify CORS and HTTPS on the chosen public origin, a cold start, a completed real query, and the cached-real fallback. Record the short demonstration and preserve evidence of the result. Confirm the submission portal's timezone and upload requirements. Freeze feature work before the final buffer.

