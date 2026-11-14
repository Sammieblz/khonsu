# Demo and rehearsal runbook

Owner: Samuel Ndubuisi. Delivery ticket: [GitHub #22](https://github.com/Sammieblz/khonsu/issues/22), Linear BYT-34. This is a presentation plan, not evidence of a completed recording or submission. The [submission handoff](submission.md) records the remaining gates.

## Choose evidence before recording

Use the primary and backup decisions in the current [five-target coverage report](target-coverage.md). Confirm the chosen manifest, source IDs, UTC dates, release, requested field, approximate wavelengths, mask warnings, acquisition record and pipeline version before rehearsal. A masked target may support a field-playback demonstration while supporting no statement about that target's flux or motion.

The November 14 validation pass selected these real fields for the demo. Confirm the matching bundles are present in the final build before recording:

| Role | Query, ICRS decimal degrees | Cached sequence | Real epochs and interpretation |
| --- | --- | --- | --- |
| Primary: WISE 0855 field | RA `133.7601213914074`, Dec `-7.242127941212259`, field `6` arcmin, at most `16` inputs | `real-wise-0855`, `fixtures/real/real-wise-0855/manifest.json` | Three comparable DR1 epochs, November 7 and December 13, 2025, and May 3, 2026. No target-mask warning in this selection; this does not establish that WISE 0855 itself is detected. |
| Backup: Epsilon Indi B field | RA `331.0986113344776`, Dec `-56.800804140277776`, field `6` arcmin, at most `16` inputs | `real-epsilon-indi-b`, `fixtures/real/real-epsilon-indi-b/manifest.json` | Two comparable field epochs, DR1 May 7, 2025 and QR3 September 27, 2026. No target-mask warning; no resolved-binary or orbital-motion claim. |

The primary's observation IDs are `2025W45_2A_0292_2`, `2025W50_2A_0479_1`, and `2026W18_2A_0663_1`; approximate target wavelengths span 1.40498537 to 1.41316437 micrometers on detector 2. Its common output grid is 118 x 118. The backup IDs are `2025W19_1B_0344_3` and `2026W39_2A_0581_1`, with approximate target wavelengths 1.68508150 and 1.69439394 micrometers on detector 3 and a 117 x 117 grid. Both use `khonsu-display-0.3.0`. Keep the exact timestamps, masks, display limits and acquisition record from the manifests and bundle provenance rather than reconstructing them from this summary.

The previously verified north ecliptic pole smoke field is RA `270.0`, Dec `+66.5607` ICRS degrees, field `6` arcminutes. [Display verification](display-rendering.md) records its two real DR1 exposures, `2025W19_2B_0431_1` and `2026W06_1A_0327_1`. This is an engineering benchmark, not a replacement for the five required target reports or a claim of a moving source.

The local rehearsal record below is complete for coverage and cached playback. The final-media fields remain release work. See the [acceptance report and screenshots](demo-acceptance.md) for the exact checks and scientific limits.

| Record | Required value |
| --- | --- |
| Tested cached build | `fbe18a3e6f11b3870d9104b97d256e2caca6d695`; both services rebuilt and healthy |
| Primary field | WISE 0855 query above; bundled `real-wise-0855`, three real DR1 epochs |
| Backup example | Bundled `real-epsilon-indi-b`, two real DR1/QR3 epochs |
| Source identity | Exact IDs/epochs above and source FITS URLs in each manifest, source manifest and lineage record |
| Data acquisition | Bundle-recorded UTC: primary `2026-11-14T20:37:40.137173+00:00`; backup `2026-11-14T20:37:09.240354+00:00`; reviewed file checksums in each lineage record |
| Science policy | `khonsu-display-0.3.0`; common ICRS grid, fixed recorded stretch, target-position spectral matching, masks and disclosed limitations |
| Live reproduction | Separate revision `c3316e2814ba317eadc88795f9078042db006128`: ready at 38.448 s; browser checks finished at 41.247 s; exact science-metadata match to the primary |
| Cached validation | November 14, 2026: primary and backup replayed with upstream blocked, zero outbound attempts, query inputs preserved, original dates/cached labels retained; merged-build repeat passed |
| Recovery | Missing frame produced API 503 / `CACHED_EXAMPLE_UNAVAILABLE` and a readable browser error without a science frame; restoring the asset restored loading |
| Final media | Not recorded or published; actual duration, English-caption check and public video URL remain required |

Unfilled entries are release work. Do not replace them with plausible values or present this table as a completed rehearsal.

## Start and verify the local route

Start Docker Desktop's Linux engine, then run from the repository root:

```sh
docker compose up --build --detach --wait
docker compose ps
```

Open http://localhost:3000 and http://localhost:8000/docs. Check http://localhost:8000/health reports a running service with scientific processing available. Enter the selected field in decimal degrees and select **Explore this field**. Keep actual progress messages visible during rehearsal. Search timing depends on the archive; one fast run is not an availability guarantee.

Confirm at least two usable epochs before presenting a temporal comparison. Step forward and backward and read the original UTC dates. Open quality notes. Explain the shared grid and no-data hatch without claiming that resampling adds measured detail. Retain the warnings that wavelengths are approximate, PSFs/backgrounds are not matched and resampling uncertainty is not propagated.

For an archive-outage rehearsal, keep the local frontend and API running while blocking outbound IRSA access. Deliberately choose the bundled cached real example through the application's cached-example control. Confirm its cached label and original dates, confirm the query inputs remain unchanged, and confirm no successful live retrieval is claimed. Stopping the API also stops its cached-asset routes; an archive-offline demonstration does not establish a backend-free frontend.

If an example is missing or corrupt, show the readable failure and use another explicitly verified example or the previous recording. Never relabel a synthetic fixture or unrelated field as a successful result.

## Current 30-second demonstration plan

Choose a video of at most 30 seconds to avoid relying on ambiguous slide-count OCR in the supplied local guide. The portal's current requirements still control. Use English narration and visible English captions. This schedule leaves one second for encoding variation; measure the exported file's actual duration.

| Time | Screen action | Suggested narration |
| --- | --- | --- |
| 0-4 s | Show Khonsu and the WISE 0855 field identity. | "Khonsu helps people inspect real infrared observations from NASA's SPHEREx mission." |
| 4-10 s | Deliberately load `real-wise-0855`; retain its cached label. | "This cached field preserves its original observation dates and source context." |
| 10-18 s | Step between frames; show the UTC date changing. | "We align the same field, compare compatible wavelengths, and preserve missing-data masks." |
| 18-24 s | Open quality notes and show the no-data key. | "These are visual comparisons. Quality flags and unmatched backgrounds can imitate change." |
| 24-29 s | Show a saved local raster note and repository/credits reference. | "Local notes record features to investigate. A candidate is not a confirmed discovery." |

This version presents the implemented observation workflow. It does not satisfy #22's full candidate-evidence requirement while [#14](https://github.com/Sammieblz/khonsu/issues/14) and [#15](https://github.com/Sammieblz/khonsu/issues/15) remain unfinished. Do not mime an export button, download a hand-authored substitute, or narrate sky-coordinate evidence the app does not produce. After the real versioned export is integrated and [#21](https://github.com/Sammieblz/khonsu/issues/21) verifies it, revise the final segment to show that export and inspect its observation IDs, coordinates, quality context and candidate disclaimer.

If a live search is recorded, identify any edited waiting interval with a caption such as "archive wait shortened." Do not label cached footage as live or imply recorded footage is an available public backend.

## Rehearsal acceptance

- [x] Start from a clean browser context and the recorded integrated cached build.
- [x] Complete a real query and verify every frame has real provenance and a genuine UTC epoch; its separate processing revision is recorded above.
- [x] Load both bundled cached examples with upstream access blocked; preserve labels and original query inputs.
- [x] Inspect a missing cached asset and confirm an honest error followed by successful restoration.
- [ ] Verify desktop and 390-pixel layouts, visible keyboard focus and access to warnings.
- [ ] Exercise local notes without claiming raster x/y are sky coordinates.
- [ ] Verify the actual evidence export once its feature ticket is accepted; keep this gate open until then.
- [ ] Export a video within the verified portal limit, check English captions, and test its public link while signed out.
- [ ] Record the tested commit and media URL in the submission handoff, GitHub #22 and Linear BYT-34.

Keep a local copy of the video and these start commands available. `docker compose logs --tail=100 api web` diagnoses a stopped service. `docker compose stop` stops the rehearsal. `docker compose down` removes local containers and temporary job state; repeat the live search after reset rather than expecting an old job URL to survive.
