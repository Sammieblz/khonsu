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

## November 15, 2026: Consolidated branch and native wide fields

The user authorized consolidation of `feat/49-display-experiments`, its stacked
`feat/57-resolution-lab` work, and Tyrone's newer main changes. The explicit
testing hold still prohibits merging to main. #59 / BYT-44 tracks integration;
#60 / BYT-45 tracks wider native acquisition and HD display. Both belong to
Samuel for this pass, with Tyrone reviewing shared limits and contracts.

Keep the lab's scientific experiments separate from production processing, while
using one PR for the combined review. Retire its redundant stacked PR only after
its complete history is reachable from the consolidated branch. Preserve team
authorship and distinct CPU fallbacks. Centralize duplicated resource bounds,
frame-cache policy and browser test compilation. Remove the redundant focus
effect introduced by integration, retaining the canonical focus handoff.

The [wide-field decision](hd-fields.md) raises the spatial grid and per-file
bounds while retaining the total download and output-pixel budgets. It requires
fewer frames for wide requests and truthful native/prepared/display readouts.
This changes numeric contract limits without adding a runtime dependency.

The next frontend phase has exactly three implementation tickets under #2 /
BYT-14: #61 / BYT-46 for a dedicated console and docked controls, #62 / BYT-47
for original sky-swipe entry and Khonsu loading feedback, and #63 / BYT-48 for
landing-page scroll storytelling. These remain Backlog. Robel and Michael are
named implementation owners; Tyrone temporarily tracks the tickets because only
Samuel and Tyrone are present in the connected Linear workspace. Caltech Layers
informs grouping, not unsupported astronomical layers.

The requested pick-ui-library, animate and animation-performance skills were
installed and read from Emil Kowalski's skills repository. Their guidance is
recorded in the design tickets. Select the minimum suitable animation stack when
implementation starts; no GSAP, Motion or Remotion dependency is added now.
