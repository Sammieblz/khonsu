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
`feat/57-resolution-lab` work, and Tyrone's newer main changes. At this stage the
testing hold prohibited merging to main; the later decision below supersedes it.
#59 / BYT-44 tracks integration;
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

## November 15, 2026: Final cleanup and main integration authorized

Samuel explicitly requested fixing the remaining work, checking redundancies,
merging to main and leaving no open PRs. This supersedes the earlier testing
hold. PR #54 is the only open PR and contains the complete #58 lab history.
Use it for the final cleanup and merge; preserve the existing commit history.
The three future frontend design tickets remain planning work.

The final audit reproduced an A/B failure with a 1200 ms CPU worker response and
a 350 ms blink interval: frames changed before any rendering completed. Blink
now uses the same frame-readiness decision as the viewer and waits for each
render before starting its viewing interval. Arc pointer gestures also share a
single coordinate calculation. Python FOV and observation-count bounds are
centralized across validation, retrieval and processing without changing values.

At this integration, guides used the 2160-pixel display bound and large-raster cache policy.
The probe report generator reads current limits from Python constants. Historical
acquisition reports keep their original numbers and identify them as historical.
Research artifacts and CPU/GPU fallback implementations retain their distinct
purposes. Merge only after the final regression suite and CI pass; hosting,
submission and the final human release walkthrough are still separate gates.

## November 15: quality masks and bounded 4K, #64 / BYT-49

Samuel authorized the follow-up [image-quality pass](image-quality.md): separate
warning-only display values from strict measurements, quieter gap styling,
adaptive/manual 4K, and reproducible ZODI/coadd comparisons. The total 4K budget
is 8,294,400 pixels with aspect ratio preserved. Python retains science and
quality decisions; the browser displays prepared arrays. No model-based gap
inpainting or new optical resolution is claimed. The 219-pair real audit found
no compatible short-epoch coadd pair, so real stacks and PSF-matched differences
remain unavailable. Frontend design tickets #61-63 remain planning only.

## November 15: public Clean View, #66 / BYT-50

Samuel authorized [small-gap display estimates](clean-view.md), enabled initially
with a remembered preference, a plain-language estimated-area notice, original
comparison and optional highlighted estimates. Technical controls move into
Advanced. The scientific-integrity exception is limited to explicitly labelled
display derivatives; original measurements and validity remain authoritative.
CPython produces a separate bounded estimate asset. Mark mode shows the original.
Bright boundaries, large star cores and external coverage stay unfilled. There is
no generative model, temporal borrowing, new dependency or optional frontend
design-phase implementation. Tyrone reviews the additive manifest contract.

## November 15: optional astro refinement, #68 / BYT-51

Samuel requested research and implementation inspired by Samsung Astrophoto.
The [research record](astro-refinement.md) promotes existing native local Wiener
grain reduction at strength 0.5 and a shared highlight shoulder. A separate
verified visual asset preserves every source measurement and mask. Synthetic
controls show faint-peak attenuation, so the preset starts off and Mark restores
original samples. Existing real coadd compatibility gates stay in force; no
cross-date averaging, sky-segmentation model, deconvolution or new dependency
is added. Tyrone reviews the additive API contract.

## November 15: bounded Clean View completion, #70 / BYT-52

Samuel's screenshot showed medium and edge patches excluded by the initial
fill policy. [Version 2](gap-completion.md) expands native span/area eligibility
within the existing hard work limits, uses in-bounds harmonic neighbors for
small edge notches and permits bounded bright-boundary estimates. These are
labelled visual guesses, with potentially large errors near hidden stars.
Original values, masks and evidence stay authoritative; original comparison
and Mark remain intact. No public schema, dependency or measurement changes.

## 2026-11-15: Scoped catalog context and compact sharing

Samuel explicitly authorized the proposed [sky-context integration](sky-context.md)
after the core image work: Gaia DR3 source markers, WISE reference context,
quality inspection and compact embedding. This supersedes deferral of those
specific context features. It does not authorize a second science image adapter,
cross-mission detections or the separately planned #61 console-page redesign.

Astropy computes Gaia epoch positions and common-grid coordinates in CPython.
Real service checks selected the official VizieR Harvard mirror because IRSA TAP
timed out. Provider, exact query and catalog epoch are explicit. The WISE pane
uses the independently hosted CDS Aladin viewer with IRSA's verified AllWISE
HiPS URL; no Aladin dependency, duplicate renderer or license change is bundled.
New context routes and models are additive and generated with the API contract.
The compact view reuses the existing static explorer and never auto-starts an
archive search. Original science arrays, masks, observations and evidence remain
unchanged. GitHub #72 / Linear BYT-53 track verification and integration.

## 2026-11-15: Dedicated console and scoped design motion

Samuel authorized implementing #61/#62/#63 under #2 / BYT-14. The static console
route and persistent session replace the single-page workspace. Base UI 1.9.0
supplies tabs and dialogs; CSS transform/opacity handles the original guardian
and interruptible 900 ms entry. No new 3D engine or science processing is added.
The landing story may use GSAP only for its scroll progression. Motion and
Remotion were considered but are unnecessary for this scope. See
[console-design.md](console-design.md) for contracts and acceptance.

## 2026-11-15: Guided notebook and spring controls, #77 / BYT-54

Samuel explicitly requested durable notes, a lightweight database, a longer entry,
a tour, robust docs and a responsive spring dial. This is the scoped exception
to the initial database deferral. SQLite uses Python's standard library, one
bounded private notebook per browser key, optimistic revisions and a persistent
local Compose volume. No login, shared account service or persistent science
jobs are added. Public Cloudflare notebook storage stays disabled until a durable
disk is configured. The schema and generated clients change together; Tyrone is
the contract and integration reviewer.

The entry now lasts three seconds with Skip/Escape and reduced-motion bypass.
Data starts loading immediately. The guardian appears only here, not during
subsequent image or archive loads. This supersedes the previous 900 ms policy.
Base UI supplies the tour; docs remain static. Motion 14.14.0 supplies only the
short dial-release spring, with immediate pointer following and real-date
selection. No image interpolation or scientific processing changes are made.
The installed animation skills and [implementation record](guided-notebook.md)
document the choices and acceptance checks.

## Named tunnel to the local Docker backend (#80)

Samuel selected Cloudflare Pages with a named Cloudflare Tunnel to the existing
local CPython backend, instead of purchasing Workers Paid for Containers. The
opt-in Compose overlay adds a pinned connector, an ignored file-mounted token,
explicit public origins and restart policies. Inside Compose, the tunnel route
uses `http://api:8000`; the browser uses `https://api.khonsulive.earth` compiled
into Pages. No science schema or frontend contract changes are required.

The local notebook volume remains durable across container recreation; image
jobs remain temporary. Public availability depends on the host computer, Docker
and the connector staying online. The optional paid Worker/Containers files are
retained for a future hosting decision. See [setup and verification](tunnel-deployment.md).

## Persistent observation metadata index (#85 / BYT-56)

Samuel authorized a bounded SQLite metadata index on November 16, 2026 after
IRSA SIA/TAP failed while direct FITS cutouts remained available. It stores
verified observation metadata and spherical footprints, not generated images
or persistent jobs. Successful live searches update it; transient discovery
failures may use its explicitly partial coverage to download fresh cutouts.
The initial recorded metadata covers three field regions, not the whole sky.
This scoped decision permits the additional database under the repository's
database constraint. No paid service, account system or schema change is needed.
See [operation, provenance and limits](observation-index.md).
