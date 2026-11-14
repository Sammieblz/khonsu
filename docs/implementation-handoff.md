# Team implementation handoff

Backend work already underway was completed for [PR #24](https://github.com/Sammieblz/khonsu/pull/24), following the user's instruction to merge this piece and leave the remaining features for the team. The main frontend remains the collaborative scaffold.

The API supports bounded IRSA searches, one scientific worker, cancellation, expiry, calibrated FITS reading, wavelength-aware alignment, masks, a common display stretch and allowlisted PNG delivery. The OpenAPI document and generated TypeScript come from the actual dependency-enabled app.

The initial CI executed all eight scientific FITS tests successfully. Its test date assertion was subsequently corrected. Final checks cover the resource fixes listed below. [Actions](https://github.com/Sammieblz/khonsu/actions) records exact commit results.

The [coverage report](target-coverage.md) and [JSON record](target-coverage.json) preserve the live probe evidence from [run 43581772359](https://github.com/Sammieblz/khonsu/actions/runs/43581772359). Two genuine R Draconis field frames were produced, but both target-centre pixels are masked. This demonstrates field retrieval and alignment, not target detection or variability. A useful unmasked demonstration remains team work.

Live archive probing runs manually through workflow_dispatch. External archive availability is separate from offline unit tests, contracts and container checks.

## Work intentionally left open

| Engineer | Next work |
| --- | --- |
| Samuel | Review scientific processing; find usable unmasked targets; improve sampling and validate apparent changes |
| Tyrone | Connect the frontend client; verify deployment, query recovery and restart/cold-start behavior |
| Robel | Integrate and refine the branded explorer, URL state, responsive layout and shared controls |
| Michael | Finish the viewer styles, time controls, pan/zoom and A/B comparison; add interaction tests |
| Aryan | Review and integrate local annotations, evidence export, quality explanations and accessibility acceptance |

All 22 feature issues remain open. Their acceptance criteria still govern completion. Do not close a ticket just because reference code exists.

## Resolved backend findings

- Cancelled jobs retain queue capacity until worker acknowledgement; unfinished directories cannot expire.
- Cache scans tolerate disappearing files and fail closed on other filesystem errors.
- Each worker checks a conservative 512 MiB peak reservation against a one GiB cache before retrieval; actual download and output bytes are checked too.
- Probe processing receives the global deadline callback.
- The committed OpenAPI document and declarations were regenerated from the actual app.

Review and commit dependency locks before parallel dependency changes. Scientific limits remain explicit: target-position spectral matching, no PSF/background matching, no propagated output uncertainty, and preliminary candidate interpretation. Production deployment and browser acceptance remain unverified.

## Optional frontend reference

The separate `wip/team-feature-reference` branch preserves already written frontend work. It is deliberately unmerged and unverified as a complete application. Keep related files together: explorer interfaces import annotation evidence types, annotation props require sequence/query context, and viewer controlled-state props are shared.

The viewer's new CSS and interaction tests are incomplete. No Playwright dependency or end-to-end browser tests were added. The available Node logic suite passes, but the new integrated frontend still needs TypeScript, production build and rendered checks.

Use main if you want to implement the features yourselves. Use the WIP branch only as reference or cherry-pick material. No hosting was provisioned and no paid service was purchased.

