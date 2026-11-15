# Consolidated display acceptance

Samuel authorized final cleanup and main integration on November 15, 2026,
superseding the earlier testing hold. [PR #54](https://github.com/Sammieblz/khonsu/pull/54)
contains the complete resolution-lab history from #58 and main through `94259b3`.
The final checks below ran against the working tree based on `973d66c` between
16:45 and 16:50 UTC. Reports include source hashes where the suite supports them.
This records automated acceptance, not a separate human visual approval or a
public deployment.

## Corrections and redundancy audit

A delayed CPU worker reproduced an A/B failure: the 350 ms blink timer advanced
before a 1200 ms render finished, leaving loading visible. A/B now waits for both
assets and the current render, then starts the viewing interval. The regression
first failed against the prior export and now passes in Chromium and Firefox.

Frame readiness and time-arc pointer geometry each have one calculation. Minimum
field size and maximum observation count now come from the same Python bounds
used by schemas, retrieval and processing; values and public contracts are
unchanged. The probe report generator reads current cutout/download limits.

The consolidated branch also shares generated browser bounds, PNG/raster cache
windows and browser-module compilation. It preserves the earlier fixes for
candidate initialization, competing focus callbacks and thumbnail CORS caching.
Current docs no longer conflict with the authorized merge or the 2160-pixel
display limit. Historical acquisition reports retain their original conditions.
CPU/GPU recovery and isolated research algorithms still serve distinct purposes.

## Verification

| Check | Result |
| --- | --- |
| Python/API tests | 121 passed in Python 3.12; one existing Starlette/AnyIO deprecation warning |
| Frontend logic tests | 83 passed |
| TypeScript and production static export | Passed |
| Live API contract export check | Passed, no drift |
| Repository text/link and diff checks | Passed |
| [Enhancement](evidence/merge-54/enhancement.json) | Chromium 157 / Firefox 153: CPU/GPU parity, fallbacks and slow-worker A/B regression |
| [Console](evidence/merge-54/observatory.json) | Both browsers: cached real examples, gestures, controls, requests and failures |
| [Candidates](evidence/merge-54/candidate.json) | Both browsers: geometry, mask context, saved notes and migration |
| [HD replay](evidence/merge-54/hd-display.json) | Both browsers: real 2048-square products, overview, native scale, A/B and CPU recovery |
| [Resolution lab](evidence/merge-54/resolution-lab.json) | Both browsers: real comparisons, exact masks, grain/gap controls and original hold |
| [Accessibility](evidence/merge-54/accessibility.json) | Zero tested axe violations or page overflow at 390/820/1440 px; 44 px controls, reduced motion and keyboard load/step/mark/save/export |

The [wide-field images and acquisition](hd-fields.md) and [research screenshots](enhancement-research.md)
remain the visual evidence; the cleanup does not change the visual design.
See [verification commands](testing.md) to reproduce these checks. PR and main
CI results are linked from #54 and the corresponding GitHub/Linear issues after
the push and merge.

## Scientific and delivery limits

HD replay serves two authentic, checksummed CPython products through controlled
local transport. It is not a successful live wide-field search. The separate
[live 120-arcminute attempt](evidence/hd-field/live-query.json) returned insufficient
comparable epochs within its four-exposure budget. The field contains about
1174 native samples across; a 2048 grid or 2160 display does not create extra
optical resolution. Wavelength compatibility is checked at the target position.

Real reconstruction remains unavailable in the bounded research sample. Its
synthetic results and reversible display filtering retain their labels and
limitations. Masks, source arrays, real dates, WCS, target-wavelength context
and candidate evidence remain authoritative.

The three future frontend design tickets remain planning work. Public hosting,
the final human release walkthrough and submission remain separate gates; this
integration does not mark the entire MVP complete.
