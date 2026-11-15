# Observation console acceptance

Owner: Samuel Ndubuisi. Scope: [GitHub #35](https://github.com/Sammieblz/khonsu/issues/35)
and [Linear BYT-36](https://linear.app/byteboyz/issue/BYT-36). Verified November 14,
2026, America/New_York (November 15 UTC). Application revision:
`44e3beb2636e0930881650791cd31bf36c2eb50d`.

This pass delivers the integrated console and browser display work. It does not
declare the full MVP, public deployment, evidence export or portal submission
complete.

## Delivered changes

| Work | GitHub / Linear | Implementation |
| --- | --- | --- |
| Aligned Float32 intensities, masks, checksums, both real bundles and rendering experiment | #36 / BYT-37 | [PR #41](https://github.com/Sammieblz/khonsu/pull/41) |
| Real-date rewind, bounded loading, pan/zoom/mark, A/B blink and hold | #37 / BYT-38 | [PR #42](https://github.com/Sammieblz/khonsu/pull/42) |
| Shared display settings, WebGL2, worker/Canvas recovery | #38 / BYT-39 | [PR #43](https://github.com/Sammieblz/khonsu/pull/43) |
| Cinematic entry, sharp controls, five presets and optional NASA Eyes | #39 / BYT-40 | [PR #45](https://github.com/Sammieblz/khonsu/pull/45) |
| Reproducible combined acceptance and instructions | #40 / BYT-41 | This report and [browser script](../scripts/verify-observatory.mjs) |

Tyrone's [PR #44](https://github.com/Sammieblz/khonsu/pull/44) supplies the
integrated search cancellation and distinct error/recovery states. Its session
logic is preserved in the new composition. Each implementation branch was
integrated with current main and all five required CI jobs passed before merge.

## What was checked

The production static export ran at localhost:3001 against the local Docker API
at localhost:8000. The separate Docker development frontend was rebuilt and
verified at localhost:3000. Both containers reported healthy. This is local
verification, not evidence that a public Cloudflare origin is deployed.

- 95 API/science tests passed. Live FastAPI OpenAPI and generated TypeScript
  match the committed artifacts. One dependency deprecation warning was emitted.
- 38 frontend tests passed, including irregular/repeated dates, cache bounds,
  coordinate transforms, transport recovery and replacement/cancellation races.
  TypeScript checking and Next.js static export passed.
- Repository text/link checking, Compose validation and container health passed.
- Chromium 157.0.8103.50 and Firefox 153.0 passed the combined production-export
  suite. [Machine-readable results](evidence/console/acceptance-report.json)
  record both authentic example IDs, timestamps and releases.
- Both real fields and the explicitly synthetic signed/bright/masked ramp
  produced a maximum CPU/GPU byte-channel difference of **0**, within the allowed
  tolerance of 1. Both asinh/linear and quiet/hatch cases were checked against
  independent analytic expected values. This checks color mapping, not additional
  scientific resolution or a hardware-speed guarantee.
- Forced GPU context loss recovered to CPU. Disabling GPU and workers used
  Canvas. Corrupt intensity checksums fell back to the original PNG with disabled
  intensity controls and an explanation. Failed PNG loads recovered via Retry.
- Rewind drag, keyboard dates, wheel zoom, transformed mouse/keyboard marks,
  fit, expand/Escape, hold release/cancel/blur, blink, rapid setting/epoch changes,
  display reset and sequence replacement passed. Chromium additionally passed
  two-contact touch pinch. Firefox touchscreen hardware was not tested.
- Notes survived a real page reload. Their coordinates remain local raster
  pixels. Simulated invalid-input, insufficient-coverage and backend-unavailable
  cases showed correct actions without silently displaying a different field.
- Five presets filled their catalog coordinates. Desktop and 390px layouts had
  no horizontal overflow. Keyboard skip/focus and reduced-motion preference were
  exercised; playback starts only on request.
- Mission content was absent before opening, removed on close and never changed
  the selected observation date. The official NASA Eyes document returned HTTP
  200 in a separate check. Its complete external simulation is not part of the
  scientific acceptance suite; the official external link remains available.

The prepared raster cache retains at most five selected/neighbor/A-B frames,
each at most 5 MiB and 1024 x 1024 pixels. This bounds retained raw payloads to
25 MiB, not total browser memory. PNGs, canvas buffers, worker transfer and GPU
textures add memory. Render requests keep one active and the latest queued job.
The current real fields are only about 69 KiB per intensity/mask asset.

## Fresh live query

The rebuilt localhost:3000 interface submitted RA `270`, Dec `66.5607` ICRS,
field `6` arcmin, maximum `16` inputs. It completed between
`2026-11-15T00:35:30.505Z` and `2026-11-15T00:36:35.407Z`, about 65 seconds.
The viewer stepped to the second genuine observation and received prepared
intensity assets for both frames:

| Observation | UTC | Release |
| --- | --- | --- |
| `2025W19_2B_0431_1` | `2025-05-11T06:02:47.529600Z` | DR1 |
| `2026W06_1A_0327_1` | `2026-02-03T14:19:10.473600Z` | DR1 |

[Recorded live manifest and query](evidence/console/live-report.json) preserves
the returned provenance, settings, WCS, warnings and intensity hashes. Its local
job/asset URLs expire and are not a durable hosted demonstration. Repeat the
coordinates to query again; archive timing and coverage can change. This field
comparison is not a motion, variability or Planet X discovery claim.

## Try it yourself

1. Start Docker Desktop's Linux engine, run `docker compose up --build --detach --wait`
   from the repository root, and open http://localhost:3000.
2. Under **Saved observations**, choose **WISE 0855 field (primary)** and press
   **LOAD CACHED REAL EXAMPLE**. Confirm **CACHED-REAL**, the field identity and
   November 7, 2025 UTC date. This does not run a live query for the form inputs.
3. In **REWIND**, drag left/right over the image or move the timeline. Use
   **PREVIOUS**, **NEXT**, **EARLIEST** and **LATEST**. The three visits are
   November 7 and December 13, 2025, and May 3, 2026. Gaps have no intermediate
   observations. Arrow keys also step when the image or time slider has focus.
4. Select **PAN**. Drag, scroll or pinch to zoom. Use the plus/minus buttons and
   **FIT / RESET**. **EXPAND** gives a larger console; Escape contracts it.
   Cropping is explicitly labelled when zoomed. The full field remains 6 arcmin.
5. Choose **REFERENCE / A** and **COMPARE / B**. Use **BLINK A/B**, then stop it.
   Hold **HOLD FOR B** with a pointer or Space/Enter; releasing restores the
   prior observation. Dates change discretely; images do not morph.
6. Open **IMAGE DISPLAY**. Try shared black/white levels, asinh softness, gamma
   and quiet/hatch mask style. **QUIET PRESET** uses asinh 0.3. **ORIGINAL / RESET**
   restores the recorded curve and limits. Set **Rendering** to CPU to compare
   the fallback. No-data pixels remain identified, never filled with invented stars.
7. Select **MARK** and click a pixel after zooming/panning. The note panel reports
   natural raster x/y. Alternatively focus the image, move the cursor with arrow
   keys and press Enter. Save a note, reload and reopen the same cached field;
   the note should remain. A note is a candidate to investigate, not a detection.
8. Open **Observation details & quality** and inspect source ID, release,
   wavelength, masked fraction, FITS link and warnings. Repeat with **Epsilon Indi B
   field (backup)** to inspect its two real dates and DR1/QR3 context.
9. Choose a target below the coordinate strip. Inspect its coordinate/epoch note,
   then press **EXPLORE THE SKY** for a real archive search. Use **CANCEL SEARCH**
   to stop it. An empty result, timeout or unavailable backend must remain an
   explicit error; selecting a saved field is a deliberate separate action.
10. Open **THE MISSION** to explore official NASA Eyes. Its simulation time is
    separate from the observation dates. Close it to unload the iframe. If the
    external view cannot run, use its official new-tab link.

The current image resolution is limited by SPHEREx sampling and the prepared
grid. [Display evidence](browser-display.md) explains contrast, interpolation,
masks and the unchanged scientific reprojection. PSF/background matching,
WebGPU and a custom Blender spacecraft remain separately scoped future work.

## Reproduce automated browser acceptance

Install the existing web dependencies and an isolated test-only Playwright copy
from the repository root. PowerShell example:

```powershell
npm --prefix apps/web ci
npm install --prefix .cache/browser-tools --no-save --package-lock=false playwright@1.62.0
node .cache/browser-tools/node_modules/playwright/cli.js install chromium firefox
$env:PLAYWRIGHT_MODULE=(Resolve-Path .cache/browser-tools/node_modules/playwright).Path
$env:KHONSU_CORS_ORIGINS='http://localhost:3000,http://localhost:3001'
docker compose up --build --detach --wait
npm --prefix apps/web run build
python -m http.server 3001 --bind 127.0.0.1 --directory apps/web/out
```

Leave that server running. In another PowerShell window at the same repository:

```powershell
$env:PLAYWRIGHT_MODULE=(Resolve-Path .cache/browser-tools/node_modules/playwright).Path
node scripts/verify-observatory.mjs
```

Optional environment variables are `KHONSU_TEST_URL`, `KHONSU_TEST_API`,
`KHONSU_TEST_OUTPUT` and `CHROMIUM_EXECUTABLE`. The default report/screenshots go
to ignored `.cache/console/`. The parity run requires working WebGL2 so it can
measure that path; separate cases deliberately disable GPU/workers. Recorded
browser versions above describe this machine, not every device. The optional
NASA Eyes panel requires external network access. Test fresh live acquisition
separately; this repeatable suite uses the preserved authentic bundles.

## Screenshots

[Desktop entry](evidence/console/landing-desktop.png),
[desktop console](evidence/console/observatory-desktop.png),
[mobile entry](evidence/console/landing-mobile.png),
[mobile console](evidence/console/observatory-mobile.png), and
[Firefox backup field](evidence/console/firefox-backup-mobile.png).

The celestial entry is original vector illustration. Scientific canvases contain
authentic observations. See [asset sources and terms](assets.md). No movie
footage, character imagery or music is included.
