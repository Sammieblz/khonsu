# Decisions

| Date | Decision | Reason and consequence |
| --- | --- | --- |
| 2026-11-14 | Next.js App Router with static export on Cloudflare Pages | Matches team preference, avoids a Vite setup, and keeps the frontend independent from Python hosting |
| 2026-11-14 | FastAPI in one normal CPython Docker image | Scientific libraries need the native Python ecosystem; the same image serves local and Cloudflare Containers paths |
| 2026-11-14 | Local Docker first; Cloudflare Containers documented | Zero cloud cost locally; Containers requires a paid Workers plan and usage budgeting |
| 2026-11-14 | No Render, database, auth, Redis or Celery for MVP | Complete the observation-to-evidence path within the weekend |
| 2026-11-14 | Original Khonsu identity and real-epoch sky swipe | Preserve the cinematic idea while keeping data, coordinates and scientific claims truthful |
| 2026-11-14 | Michael owns viewer; Aryan owns discovery and quality | Retains the explicitly requested role swap |
| 2026-11-14 | Public Python schema generates client contract | Reduce integration drift and shared-file conflicts |
| 2026-11-14 | Commit web and gateway npm lockfiles; install with `npm ci` ([#1](https://github.com/Sammieblz/khonsu/issues/1)) | CI, the web image and contributors resolve identical packages; a dependency change must commit the reviewed manifest and lockfile together |

Append a short dated entry when a decision changes. Include the issue or pull request and the concrete tradeoff. Do not overwrite scientific limitations with presentation claims.


## November 14, 2026: Samuel's console and display pass

The user explicitly assigned the coordinated frontend/viewer/API follow-up to
Samuel, tracked by GitHub #35 and Linear BYT-36 with five linked sub-issues.
Keep prior contributor ownership and authorship intact. The additive prepared
raster contract is documented in [browser display](browser-display.md).

Use the supplied sharp rectangular amber/ivory design with a compact loaded
console, real-date sky scrubbing, pan/zoom/mark and explicit comparison. Original
vector celestial art supplies the shaded three-dimensional appearance at entry.
NASA Eyes supplies optional interactable mission context on demand. This is the
scoped 3D decision for this pass: no new local 3D engine or custom Blender model.
A future bespoke spacecraft needs a verified model source, terms and a separate
performance budget. Scientific images remain on their stable two-dimensional
WCS grid. The mission simulation clock cannot select or fabricate exposures.

WebGL2 accelerates display mapping of prepared Float32 values. Worker and Canvas
fallbacks preserve compatibility and context-loss recovery. WebGPU, independent
background matching, PSF matching, and a larger cached field require separate
measurements before adoption. Existing 6-arcminute caches remain their true size.

## November 14, 2026: Bounded derived display enhancement

The user explicitly requested app-owned GPU image enhancement and deconvolution
research, tracked by [#49](https://github.com/Sammieblz/khonsu/issues/49) and
[BYT-42](https://linear.app/byteboyz/issue/BYT-42). This authorizes a small visual
processing extension to the browser-display boundary: smooth screen sampling
and an optional thresholded detail copy, with original comparison, mask
preservation and CPU recovery. FITS, calibration, registration, PSF research and
authoritative scientific interpretation remain normal CPython. No API contract,
dependency, cached science product or independent epoch normalization changes.

Keep Wiener-Hunt, Richardson-Lucy and Fourier filtering in the reproducible
research script until their forward/noise model and artifact behavior support
a validated product choice. Blind restoration was researched but not implemented.
See [the experiment and evidence](enhancement-research.md). Retain the existing
Khonsu controls, time arc and real-observation sky swipe.
