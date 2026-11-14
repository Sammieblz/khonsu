# Team implementation handoff

The user asked to leave meaningful implementation work for the five engineers. Feature work stopped on November 14, 2026. Main remains the collaborative scaffold. Nothing from draft PR #24 has been merged.

## Reviewable backend reference

[Draft PR #24](https://github.com/Sammieblz/khonsu/pull/24) contains a reference implementation of bounded IRSA retrieval, wavelength-aware FITS processing and temporary sequence jobs. Review or selectively adopt it rather than treating it as the finished MVP.

The first CI pass executed 45 backend tests: 44 passed, with one incorrect expected calendar date in a retrieval test. The date assertion has been corrected. All eight scientific FITS tests actually executed and passed; they were not skipped. Container build/startup checks passed.

The live archive probe in [run 43581772359](https://github.com/Sammieblz/khonsu/actions/runs/43581772359) succeeded. Its downloadable real-observation-probe artifact preserves the JSON coverage report, processing records and images.

| Target field | Metadata records | Bounded sample processing |
| --- | --- | --- |
| Barnard's Star | 358 | Insufficient comparable epochs within the sampled eight frames |
| Epsilon Indi B | 458 | Download failed during this probe |
| WISE 0855 | 258 | Insufficient comparable epochs within the sampled eight frames |
| R Draconis | 539 | Two genuine field frames produced |
| RW Aurigae | 335 | Processing not attempted after the field example was found |

The R Draconis field frames are dated October 18, 2025 and July 11, 2026, from DR1 and QR3 detector 1. Their approximate target wavelengths are 0.75905 and 0.76235 micrometers. Both target-centre pixels are masked. This proves genuine field retrieval and alignment, not detection or variability of R Draconis. Finding a useful, unmasked multi-epoch target sample remains team work.

## Work intentionally left open

| Engineer | Next work |
| --- | --- |
| Samuel | Review scientific processing; find usable unmasked targets; improve sampling and validate apparent changes |
| Tyrone | Review the job lifecycle and resource bounds; finalize contracts and cache/restart behavior |
| Robel | Integrate and refine the branded explorer, URL state, responsive layout and shared controls |
| Michael | Finish the viewer styles, time controls, pan/zoom and A/B comparison; add interaction tests |
| Aryan | Review and integrate local annotations, evidence export, quality explanations and accessibility acceptance |

All 22 feature issues remain open. Their acceptance criteria still govern completion. Do not close a ticket just because reference code exists.

## Concrete backend review findings

- Cancellation currently makes a job terminal before its worker finishes. Admission should count unfinished worker tasks so submit/cancel cannot bypass the queue bound.
- Cache byte counting can race file cleanup. Handle disappearing files without returning a server error.
- Cache capacity needs reservation or a check before each queued worker begins, not only at submission.
- Pass the live probe's deadline callback into scientific processing.
- Regenerate and commit the actual OpenAPI and TypeScript output from a dependency-enabled environment. The CI log emits these artifacts; do not rely on the bootstrap snapshot.
- Review and commit generated dependency lockfiles before parallel dependency changes.

These are review tasks, not hidden claims of production readiness.

## Optional frontend reference

The separate `wip/team-feature-reference` branch preserves already written frontend work. It is deliberately unmerged and unverified as a complete application. Keep related files together: explorer interfaces import annotation evidence types, annotation props require sequence/query context, and viewer controlled-state props are shared.

The viewer's new CSS and interaction tests are incomplete. No Playwright dependency or end-to-end browser tests were added. The available Node logic suite passes, but the new integrated frontend still needs TypeScript, production build and rendered checks.

Use main if you want to implement the features yourselves. Use the WIP branch only as reference or cherry-pick material. No hosting was provisioned and no paid service was purchased.

