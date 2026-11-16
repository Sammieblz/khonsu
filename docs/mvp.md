# MVP and delivery plan

Khonsu helps a curious citizen scientist compare infrared images of the same sky region across actual SPHEREx observations, recognize change, and preserve evidence for further investigation. A marked candidate is a lead, not a confirmed planet or scientific discovery.

The team targets Sunday November 15, 2026 at 23:59. Planning uses America/New_York because the team is US based. Confirm the event portal's official submission timezone and required deliverables before submission. The internal release target is Sunday 20:00, leaving a buffer for recording, upload, and portal problems.

## Required user journey

1. Enter right ascension (RA), declination (Dec), and angular field of view, or choose a named preset. Validate units, ranges, and the bounded query before requesting data.
2. Retrieve genuine SPHEREx observations and show progress or an actionable empty, timeout, or unavailable state.
3. Display aligned images of the same sky region in chronological order with actual UTC dates, release, wavelength context, detector, and quality information.
4. Drag the time arc or use keyboard controls to select actual epochs. Play, pause, step, and blink A/B. Pan and zoom without changing the scientific image geometry. Keep time, pan, and mark modes distinct.
5. Mark a possible moving or changing source. Save notes locally and export coordinates, selected frames, observation metadata, processing settings, source links, and the candidate disclaimer.
6. Share the search parameters by URL. Clearly distinguish a query link from private local annotations.
7. Inspect credits, data lineage, quality limitations, and a short explanation of what the user is seeing.

## Acceptance checklist

- [ ] A fresh checkout follows the documented local setup without repository-specific secrets.
- [ ] The frontend builds to a static export and deploys on Cloudflare Pages.
- [ ] The same Python backend image runs in local Docker and has a documented, validated Cloudflare Containers deployment path.
- [ ] One real bounded coordinate query completes end to end through the UI with at least two usable epochs where the archive provides them.
- [ ] All five challenge targets have a committed coverage report: Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, and R Draconis. Each reports verified coordinates and epoch, release, returned dates, usable frames, and honest limitations. Do not invent missing coverage or claim every target visibly moves.
- [ ] Presets with usable coverage open real prepared sequences. Targets lacking usable data show a truthful explanation and an alternative verified example.
- [ ] Frames share a documented celestial WCS grid, angular footprint, fixed comparison stretch, masked invalid pixels, and chronological order.
- [ ] Comparison uses compatible wavelength samples at the target position. Detector identity alone is insufficient. Release compatibility is recorded.
- [ ] Time scrubbing, step, playback, A/B blink, pan, zoom, reset, image loading, and request cancellation work. No interpolated celestial positions are presented as observations.
- [ ] Current frame, UTC timestamp, comparison selection, angular field of view, and source provenance are visible and accessible.
- [ ] Candidates survive a local reload and export with evidence. Exports identify user annotations and synthetic inputs when applicable.
- [ ] A real cached sequence supports the demonstration if archive access fails. Its acquisition date and source lineage remain visible. The included synthetic fixture cannot satisfy this requirement.
- [ ] Query URLs reproduce the search, including explicit coordinate units, field of view, and filters. Expired sequence IDs trigger requery or a helpful state.
- [ ] Keyboard-only use, reduced motion, readable contrast, and responsive layouts at 390px and desktop widths are verified.
- [ ] No-data, single-epoch, archive timeout, malformed input, failed image, backend unavailable, and container restart paths are covered.
- [ ] README, source acknowledgements, evidence demo, and submission narrative describe implemented behavior honestly.

## What the scaffold establishes

The scaffold establishes folders, ownership, skills, visual tokens, a frontend composition shell, API schemas, five named preset placeholders, processing and retrieval seams, synthetic development data, container instructions, and checks. It does not establish a completed archive integration, a validated science result, or production hosting.

## Scope held until after the MVP

Defer automatic AI detection or classification, webcam hand tracking, historical star-sky reconstruction, 2,000-year rewinds, spectrum analysis, global sky streaming, accounts, multiplayer annotations, persistence services, a new Blender satellite model, and native desktop/mobile apps. WISE cross-mission blinking and NEOSSat/CADC science adapters remain outside the critical path. After core playback, Samuel authorized [bounded sky context](sky-context.md): optional Gaia DR3 source markers, a separate AllWISE reference pane, pixel-quality explanations and compact coordinate embeds. These do not change SPHEREx measurement validity or establish full MVP acceptance.

A lightweight NASA Eyes mission-context link or embed may be included only after the core journey works. Its simulation clock must remain separate from observation time. The dramatic sky-swipe idea becomes direct manipulation of genuine epochs, with cinematic motion confined to interface decoration.

## Working schedule

The November 15 design follow-up is planning only: [#61](https://github.com/Sammieblz/khonsu/issues/61)
for the dedicated console, [#62](https://github.com/Sammieblz/khonsu/issues/62)
for sky-swipe entry and loading feedback, and [#63](https://github.com/Sammieblz/khonsu/issues/63)
for landing storytelling. These do not replace the live-data, release or submission
acceptance gates. Samuel authorized integrating the display work through PR #54
after the final cleanup and regression checks.

| Window, America/New_York | Exit condition |
| --- | --- |
| Saturday morning | Contracts agreed, owners claim folders, archive access and first real FITS confirmed |
| Saturday afternoon | One processed real sequence and frontend fixture flow integrated |
| Saturday evening | Live query, playback, annotation and evidence paths joined |
| Sunday morning | Five-target report, real cached fallback, failure states, accessibility |
| Sunday 14:00 | Feature freeze, only acceptance failures and presentation gaps |
| Sunday 18:00 | Clean environment rehearsal and end-to-end smoke test |
| Sunday 20:00 | Release candidate, demo recorded, submission material ready |
| Sunday 23:59 | User-specified submission deadline; submit earlier |

If the live archive is unavailable, document the failure and demonstrate the real cached sequence while retaining the live adapter and its clear error states. Do not rename a synthetic demonstration as the completed science MVP.
