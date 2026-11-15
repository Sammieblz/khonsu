# Project submission handoff

Owner: Samuel Ndubuisi. [GitHub #22](https://github.com/Sammieblz/khonsu/issues/22) / Linear BYT-34 stays open until actual submission and acceptance evidence exist. These are draft fields and release checks, not a submitted project or completed MVP claim. Deployment [#20](https://github.com/Sammieblz/khonsu/issues/20) and final acceptance [#21](https://github.com/Sammieblz/khonsu/issues/21) remain dependencies.

## Deadline and format verification

Checked November 14, 2026. The official [2026 event page](https://www.spaceappschallenge.org/2026/) search index says submission closes November 15 at 23:59 local time. Direct checks of the [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/), challenge page and Cincinnati listing returned HTTP 502 or were unavailable. The authenticated team's submission screen has not been inspected.

The supplied Cincinnati participant-guide text instead says 23:00 local time. Its OCR also makes the slide count unclear. The user-specified planning deadline remains November 15 at 23:59 America/New_York; it does not override an earlier portal or Local Lead cutoff. Aim for the internal Sunday 20:00 release buffer and work to the earlier 23:00 limit until the displayed Cincinnati deadline and timezone are confirmed.

The [NASA Space Apps repository's submission Q&A](https://github.com/nasa/spaceapps/discussions/1973) describes a video of at most 30 seconds or a deck of at most seven slides. This is supporting guidance, not a substitute for the unavailable current guide or Cincinnati's rules. Prepare the [at-most-30-second video plan](demo.md), use English text and captions, and confirm the actual portal's accepted format before uploading.

Samuel must record the portal's exact deadline, named timezone, format limits and any additional local submission requirement before final submission. Do not assume the computer's timezone or a search snippet establishes a local-event exception.

## Draft portal text

Compare these entries with the final build and #21's acceptance report before copying them into the live form. The current portal's field names and character limits are unverified. Adapt this text to the fields actually shown while retaining its scientific limits.

### Project name

Khonsu

### High-level summary

Khonsu is a visual observatory for exploring real SPHEREx infrared observations across time. Users enter a sky position, load dated observations on a common celestial grid, step through actual epochs, inspect quality warnings, and keep local notes about features worth investigating. The Python backend retrieves bounded NASA/IPAC IRSA cutouts, checks approximate wavelength compatibility, preserves bad-pixel masks, and applies one shared display stretch. Khonsu supports careful visual inspection, not automatic Planet X detection or a confirmed discovery.

### Challenge

[Planet X and SPHEREx, NASA Space Apps 2026](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)

### Project description and impact

Comparing infrared visits is difficult when observations differ in orientation, wavelength coverage and quality. Khonsu brings these considerations into a clear coordinate-to-viewer workflow. A bounded search requests real individual SPHEREx exposures from IRSA. Scientific Python reads the FITS products, places comparable observations on one WCS grid, preserves missing pixels, and records display settings and source context. The frontend displays genuine observation times and quality warnings while the user steps between frames.

The goal is to make evidence easier for a curious citizen scientist to inspect and explain. A local raster note is a starting point for investigation, not a source classification or scientific measurement. We do not infer an orbit, confirm a new planet, perform calibrated variability analysis, or claim that every challenge target visibly moves. We report insufficient usable data and upstream failures explicitly.

Khonsu's name refers to an ancient Egyptian lunar deity, commonly translated as "the traveler." The Moon's journey connects the sky with passing time. A night-sky rewind gesture in Moon Knight inspired the interaction idea; the team created an independent visual identity and does not reuse Marvel footage, characters, music or branding. The implementation uses actual observation dates rather than a simulated rewind of history.

### NASA data and meaningful use

The working flow uses SPHEREx individual spectral-image FITS cutouts from NASA/IPAC IRSA, retaining DR1/QR3 release context per observation. These scientific inputs drive the actual rendered images. WCS metadata supplies a shared celestial grid; WCS-WAVE supplies approximate visualization wavelengths at the selected target; FLAGS and VARIANCE help retain invalid-data masks. Original UTC observation times, identifiers, source links, masks and processing settings remain attached to each prepared sequence.

See the [five-target evidence](target-coverage.md), [display method](display-rendering.md), [scientific limitations](science-integrity.md) and [data-source register](data-sources.md). Cite the final selected example by its exact manifest, release, source IDs and acquisition record. Describe a cached example as previously acquired real observations, not a new live query.

The November 14 validation pass selects the WISE 0855 field as primary (`real-wise-0855`, three comparable DR1 epochs) and the Epsilon Indi B field as backup (`real-epsilon-indi-b`, two comparable DR1/QR3 epochs). Both reviewed bundles are present and passed upstream-offline playback checks, repeated on merged build `fbe18a3e6f11b3870d9104b97d256e2caca6d695`. Exact queries, observation IDs, acquisition records, screenshots and acceptance results are in the [demo runbook](demo.md) and [acceptance report](demo-acceptance.md). Neither sequence establishes recovery, motion or variability of its named target.

### Tools and implemented scope

Next.js and TypeScript provide a static-export-compatible interface. Canvas renders prepared images. FastAPI supplies bounded temporary jobs and controlled asset routes. Scientific work runs in normal CPython with NumPy, Astropy, reproject and Pillow. Docker Compose provides the local frontend/API route. No browser FITS processing, database or authentication service is required for that route.

The current implementation has live coordinate search, dated frame selection/stepping/playback, masks, quality notes and local raster-pixel notes. Pan/zoom/reset, A/B blink, complete irregular-time interaction, query URLs, sky-coordinate annotations and a versioned evidence export remain feature work until accepted. Gaia DR3, WISE and NEOSSat integrations are future work. Do not describe them as delivered because they appear in the MVP plan or resource list.

### Team responsibilities

| Team member | Delivery responsibility |
| --- | --- |
| Samuel Ndubuisi | Scientific processing, registration, validation, demo narrative and submission readiness |
| Tyrone A. Johnson | Retrieval, API, jobs, contracts, deployment and integration |
| Robel Mezgebe | Frontend composition, branding, shared controls and responsive shell |
| Michael Ameteku | Viewer, frame loading, epoch interaction, playback and comparison |
| Aryan Pai | Candidate evidence, quality guidance, accessibility and acceptance QA |

These are responsibilities, not a claim that a named person authored every file in that area. Preserve actual commit/PR attribution and confirm final contributions with the team.

### References and acknowledgments

- [GitHub source repository](https://github.com/Sammieblz/khonsu), MIT code license.
- [NASA/IPAC IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html).
- [SPHEREx DR1 overview, acknowledgments and data identifiers](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html), including spectral-image DOI [10.26131/IRSA678](https://doi.org/10.26131/IRSA678).
- The acknowledgement that page asks SPHEREx data users to include, quoted exactly and also shown in the app's Data & credits section: "This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration." The same page states that "the DR1 spectral images are intended to be used together with the QR3 spectral images as a uniformly processed set"; it gives no separate DOI for Quick Release images.
- [Official IRSA SPHEREx tutorials](https://caltech-ipac.github.io/irsa-tutorials/spherex/), [FITS product guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) and [source-discovery tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo/).
- The selected cached example's source manifest, processing record, acquisition date and redistribution/attribution notes must accompany the final media.
- [LACMA's Khonsu explanation](https://collections.lacma.org/object/62756), for the name's context.
- [Asset and inspiration register](assets.md), [complete challenge-resource register](data-sources.md) and [NASA image/media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- OpenAI Codex assisted with coding, review, testing and preparation of this handoff. Confirm and list any additional AI tools actually used by teammates; do not submit an incomplete or invented tool disclosure.

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

Code licensing does not replace terms for external data, fonts, imagery or media. Preserve source-specific credits and permissions. No copied Marvel assets or NASA endorsement is implied.

## Release gates

| Gate | Owner or evidence | Current handoff state |
| --- | --- | --- |
| Five-target coverage and primary/backup | Samuel, #8 | DONE: all five outcomes recorded; primary independently reproduced; WISE 0855 field primary and Epsilon Indi B field backup selected with explicit limits |
| Authentic cached fallback | Samuel with Tyrone/Michael, #9 | DONE: both real bundles, provenance/checksums, explicit selection, upstream-offline replay and missing-asset recovery accepted; see the [evidence](demo-acceptance.md) |
| Sky-coordinate annotations and versioned export | Aryan, #14/#15 | Current raster notes do not meet the full evidence requirement |
| Public route or documented judging arrangement | Tyrone/Robel, #20 | Localhost is not a public demo link; no hosted URL is asserted here |
| Scientific, functional and accessibility acceptance | Aryan with the team, #21 | Resolve or disclose release-blocking defects in the final report |
| Final video | Samuel | Recording, public URL, actual duration and caption check not supplied here |
| Portal submission | Samuel | No submitted state, receipt or submission screenshot exists in this handoff |

The team can submit honest progress if permitted by the event, but that does not make unmet feature criteria or #22's full evidence workflow complete.

## Final portal checklist

- [ ] Record the displayed cutoff, timezone, media limits and any Cincinnati-specific submission in this file and the ticket.
- [ ] Confirm Samuel, Tyrone, Robel, Michael and Aryan are registered for the same eligible event, are not waitlisted, and appear on ByteBoyz's Members tab.
- [ ] Select the correct 2026 challenge and complete every required field in English.
- [ ] Compare all claims with the exact tested commit and #21's acceptance report.
- [ ] Supply the actual public application or judging-route information; do not use localhost as a public service.
- [ ] Upload and test the short demo, with English captions and the confirmed duration/format limit.
- [ ] Open repository, recording, data-reference and application links in a fresh signed-out browser.
- [ ] List external code, data, text, images, fonts and AI tools actually used in the references/disclosure fields.
- [ ] Review the originality, permission, participant-term and privacy confirmations against the actual project. The team owner must make those attestations accurately.
- [ ] Use the portal's Submit action, verify the submitted state, and save its timestamp/receipt or screenshot. A saved draft is not a submission.
- [ ] After any permitted final edit, check whether Submit is required again and confirm the final submitted version.
- [ ] Link the exact tested commit, final demo, acceptance report and submission evidence in GitHub #22 and Linear BYT-34 before closing either ticket.

No portal form has been submitted by creating these documents. The team owner remains responsible for resolving event-specific requirements and completing final submission.
