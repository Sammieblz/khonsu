# Resolution comparison lab

Issue [#57](https://github.com/Sammieblz/khonsu/issues/57), owned by Samuel,
continues [#49](https://github.com/Sammieblz/khonsu/issues/49) and
[BYT-43](https://linear.app/byteboyz/issue/BYT-43/samuel-compare-native-rendering-and-compatible-exposure-reconstruction).
The isolated static route is `/resolution-lab/`. This experiment stays on
`feat/57-resolution-lab`, based on `feat/49-display-experiments`, for user testing.
Do not merge either branch until Samuel approves.

## Try the comparison

With the current static preview running, open
[the local lab](http://localhost:3001/resolution-lab/).

1. Start with the **WISE 0855 / 20 arcmin overview**. Select **CURRENT**, turn
   **PRESERVE BRIGHT CORES** off, then switch to **NATIVE RESAMPLE**. This isolates
   the resampling change on the same exposure, field, stretch limits and grid.
2. Turn **PRESERVE BRIGHT CORES** on to compare the highlight curve separately.
   Hold **HOLD ORIGINAL** with the pointer, Space or Enter to see the current
   Smooth renderer's default mapping. Releasing, cancelling or leaving the
   window restores the selected treatment. Switching treatments retains pan/zoom.
3. Use **+**, scroll within the image to pan, then **FIT / RESET**. Select the
   corresponding **6 arcmin close-up** to see how magnifying fewer measured
   pixels makes their shapes more apparent. Repeat with Epsilon Indi B.
4. Select **Synthetic sampling control**, then **RECONSTRUCTION**, **KNOWN TRUTH**
   and **COVERAGE**. This control has eight simulated exposures and no real date.
   The reconstruction button is disabled for the real fields.
5. Expand **SOURCE & MEASUREMENTS** or download the comparison report for the
   exposure, release, target wavelength, FITS URL, checksum and diagnostics.
   Return to the observatory to use real epoch playback and saved notes.

The lab uses sharp amber controls and the existing Khonsu typography. It displays
precomputed scientific products. It is not a new GPU benchmark, a live
deconvolution engine or a replacement for the production observation console.

## What the source data permit

The SPHEREx instrument samples the sky at about 6.2 arcseconds per detector pixel.
Its Level 2 science images have 2040 by 2040 pixels. An archive cutout retains
that native sampling; a larger cutout contains more sky, not finer resolution.
See the official [instrument](https://spherex.caltech.edu/page/instrument) and
[data-product documentation](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

The first WISE field exposure here measures about 6.139 arcseconds per pixel.
A 6 arcminute field therefore spans roughly 59 native samples, although the
existing aligned display grid is 118 pixels across. The new 20 arcminute view
contains roughly 195 native samples across and a 391-pixel aligned grid. Both
are rendered to 768 pixels. None of those display dimensions establishes
768 independent sky measurements.

Two 30 arcminute FITS cutouts provide padding for the 20 arcminute displays.
They use the exact original baseline exposures, coordinates and release. They
are not new epochs. Complete URLs, byte counts, acquisition dates and SHA-256
hashes are in [acquisition.json](evidence/resolution/acquisition.json).

## Rendering methods

All transformations run in CPython. Original FITS and prepared rasters stay
immutable, with unchanged production manifests and API contracts.

| Treatment | Method | Limit |
| --- | --- | --- |
| Current | Existing prepared grid, valid-weighted bilinear enlargement, asinh softness 0.3 and gamma 1 | Matches the main viewer's default Smooth display; RESET/ORIGINAL there uses its recorded manifest settings instead |
| Native resample | Direct native FITS WCS to the same 768-pixel TAN grid using Catmull-Rom interpolation | All 16 neighbours must be valid; otherwise bilinear fallback. A local four-sample clamp prevents overshoot |
| Preserve bright cores | Gradual highlight shoulder after asinh mapping, starting at normalized intensity 0.65 | Display only. It reduces clipping but cannot recover saturated or masked source measurements |
| Reconstruction | Inverse-variance weighted polygon-overlap pixel drops with `pixfrac=0.6` | Only the labelled synthetic control qualifies in this pass |

Native validity is the intersection of nearest native validity and the original
prepared mask. This conservatively rejects slightly more display pixels; it
never fills a hole in the original comparison product. Slate patches remain
missing measurements. Current and native treatments use the same angular field,
orientation, exposure and stretch limits. Source wavelength is a target estimate,
not a claim of uniform wavelength across the field.

Native interpolation can make stars narrower while emphasizing square detector
footprints and increasing background variation. It is an option to evaluate,
not a proven improvement in resolution. The [previous restoration study](enhancement-research.md)
covers Wiener and Richardson-Lucy experiments; this pass does not promote their
outputs to scientific measurements.

## Actual archive result

The dated probe on November 15, 2026 UTC attempted 48 near-time cutouts across
the WISE 0855 field, Epsilon Indi B field and north ecliptic pole wide/deep
collections. It inspected 43 successfully; five deep-survey requests failed
with `archive_busy`. The deep control was explicitly restricted to July 10-11,
2026 UTC. The two additional overview cutouts succeeded.

The probe caps each FITS file at 16 MiB, FITS reads at 256 MiB per invocation,
the input list at 50 files and network work at 600 seconds per invocation.
There are at most four metadata queries, each capped at 8 MiB. Cached files are
accounted and reused. The recorded FITS total is 186,246,720 bytes. No source
FITS files are committed.

Candidate groups require 3-16 unique observations, one detector, DR1/QR3 releases,
at most 24 hours including exposure ends, target wavelength spread no greater
than 10% of the smallest bandwidth, and two-dimensional subpixel diversity.
The phase covariance must have minimum eigenvalue at least 0.005 pixel squared.
These are conservative experiment gates, not an instrument-certified coadd policy.

All 695 triples from the inspected sample failed the target-wavelength gate.
This is **insufficient compatible coverage in the bounded sample**, not proof
that the full archive contains no suitable group. The report retains failed
requests and exact rejected inputs. Even a passing target gate would still
require full-field spectral, registration, PSF, background and quality validation.
The lab therefore contains no real reconstruction, no combined widely separated
epochs and no invented observation time.

## Measured results

These are comparative diagnostics on fixed shared valid pixels, not calibrated
photometry, motion detections or fitted PSF resolution. Full precision, settings,
package versions and processing source hashes are in
[experiment.json](evidence/resolution/experiment.json).

| Real field | Background MAD, current to native | Maximum reference-peak position change | White display pixels, standard to shoulder |
| --- | --- | --- | --- |
| WISE, 6 arcmin | 0.00786 to 0.00906 MJy/sr | 0.230 arcsec | 0.459% to 0% |
| Epsilon Indi B, 6 arcmin | 0.01886 to 0.01957 MJy/sr | 0.190 arcsec | 0.344% to 0% |
| WISE, 20 arcmin | 0.00866 to 0.00989 MJy/sr | 0.318 arcsec | 0.709% to 0.0195% |
| Epsilon Indi B, 20 arcmin | 0.01391 to 0.01428 MJy/sr | 0.135 arcsec | 2.850% to 0.00292% |

The noise statistic uses the same low-intensity sky pixels for both treatments;
it is not an independent detector-noise estimate. Peak centroids and moment
widths use fixed 7 by 7 patches, excluding surrounding invalid pixels. Narrower
moment widths do not prove recovered optical resolution. Highlight percentages
use valid native display pixels and an 8-bit white threshold.

The synthetic experiment uses an analytic pixel-convolved Gaussian-star scene,
four half-pixel phases repeated twice, Gaussian noise of 0.012 per native pixel,
3.5% independently missing samples and seed 57. Against the same known scene on
identical valid pixels, RMSE is 0.01339 for current interpolation, 0.01232 for
native interpolation and 0.00664 for the eight-exposure reconstruction. The
roughly 50% reduction relative to current includes averaging more exposures;
it is not evidence of a 50% improvement in real SPHEREx resolution.

The [synthetic numeric artifact](evidence/resolution/synthetic-reconstruction.npz)
contains truth, reconstruction, validity, diagonal variance, weights and
contributor counts. Variance assumes independent input noise. Output pixels
are correlated and that covariance is not represented. No PSF matching,
background matching, optical deconvolution or inpainting is performed.

## Reproduce and verify

Use the existing Python science and development requirements and Node setup in
[testing.md](testing.md). The committed PNGs let the static lab run without
archive access or an API. Generating them again requires the source FITS cache:

```sh
# Only if the two earlier baseline FITS files are absent:
python scripts/experiment-enhancement.py --download
# Bounded archive acquisition; omit --download to prohibit network requests:
python scripts/probe-resolution.py --download
python scripts/experiment-resolution.py
python -m pytest apps/api/tests -q
python scripts/export-contracts.py --check
npm --prefix apps/web run test
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
python -m http.server 3001 --directory apps/web/out
```

Do not run a second server if port 3001 already serves the static export. In
another terminal, with Playwright and both browsers available as described in
[console acceptance](console-acceptance.md), run:

```sh
node scripts/verify-resolution-lab.mjs
# Requires the existing API on port 8000:
node scripts/verify-candidate-display.mjs
python scripts/check-repository.py
```

Set `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` when using an external
Playwright installation. Both scripts default to `http://localhost:3001`.
Network availability and later archive releases can change a repeat acquisition;
compare input hashes before comparing experimental results.

Recorded acceptance: 112 Python tests and 63 frontend tests passed, with a
successful typecheck and static export. In a reused Docker test image, explicitly
set `KHONSU_FIXTURE_DIR` to this checkout's mounted `fixtures` directory. An
initial run selected older image-baked fixtures and failed the browser-raster
test; the corrected checkout-based run passed all 112 tests.

[Browser evidence](evidence/resolution/browser.json) covers Chromium 157 and
Firefox 153: exact current-renderer parity on the WISE close-up, original hold
and cancellation, keyboard operation, zoom/pan/reset, real/synthetic labels,
coverage/truth, 390px layout, 44px buttons, report retry and image failure.
The existing [candidate-display regression](evidence/resolution/candidate-regression.json)
also passed in both browsers. The API contract check and repository text/link
check passed.
See the [desktop](evidence/resolution/desktop.png) and
[mobile](evidence/resolution/mobile.png) captures. User visual acceptance and
integration remain pending.

## Scientific references

- [SPHEREx archive access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/): native cutouts and survey collections.
- [SPHEREx ePSF tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/): position-dependent effective PSFs. The lab records the FITS EPSF extension but does not apply a fitted PSF model.
- [STScI Drizzle concept](https://hst-docs.stsci.edu/drizzpac/chapter-3-description-of-the-drizzle-algorithm/3-2-drizzle-concept): mapping shrunken input pixel footprints into a shared output grid. This small experiment is not a validated replacement for DrizzlePac.
- [Reproject algorithms](https://reproject.readthedocs.io/en/stable/explanation/algorithms.html): reprojection and surface-brightness conventions. Resampling alone does not recover missing spatial information.
