# Scientific integrity

Khonsu helps people inspect changing infrared observations. Its images, annotations and candidate scores are evidence for review, not proof of a newly discovered planet. Apply this policy to processing, viewer labels, exports, project copy and demonstrations.

## Separate the claims

Use these terms consistently:

| Term | Meaning in Khonsu |
| --- | --- |
| Observation | An archive-sourced measurement with identifiable provenance. |
| Display frame | A rendered representation of processed observation data. |
| Change | A difference between observations that may have several causes. |
| Candidate | A marked feature or automated suggestion that needs investigation. |
| Known source | A catalog association with source, epoch and matching method recorded. |
| Confirmed discovery | A conclusion requiring independent scientific validation outside this prototype. |

Do not label a candidate as Planet X, Planet Nine, a confirmed moving object or an undiscovered planet. A sequence of two points alone does not establish an orbit. Avoid presenting an uncalibrated score as a probability of discovery. Record whether a mark was added by a person or a particular algorithm version.

## Compare compatible measurements

SPHEREx spectral images are not ordinary six-color photographs. Its linear variable filters make wavelength vary across the detector. Selecting one detector does not ensure the same source was measured at the same wavelength on different visits. The [introductory notebook](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) explains the spatial and spectral World Coordinate Systems (WCS).

Before treating a difference as temporal evidence, validate spatial coverage, coordinate alignment, observation time, spectral overlap, calibration and quality. Apply a documented wavelength-matching policy, or clearly mark the comparison as spectrally unmatched. Do not interpret a color-dependent brightness change as time variability without this check. Broad detector coadds require an explicit spectral weighting and sampling policy; defer them if that cannot be implemented honestly.

Keep spatial WCS and spectral WCS handling separate. Respect FITS versus Python pixel origins. Reproject to a common sky grid and verify known positions rather than merely resizing, centering or rotating images visually. Record scale, orientation, transform, valid footprint and interpolation. Resample masks appropriately and do not create valid pixels outside real coverage.

## Preserve measurements and quality

Read the [SPHEREx data product guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/) for calibrated IMAGE, FLAGS, VARIANCE, modeled background and wavelength products. Decode release-specific flags using the current explanatory supplement. Do not guess bitmap values or reject every nonzero flag without checking its definition. Keep masked, missing and out-of-coverage values distinct from measured zero. The current flag table, resampling, stretch and no-data display are in [display rendering](display-rendering.md).

Use uncertainty-aware comparisons when claiming significant change. Treat different point spread functions (PSFs), background levels, detector artifacts, saturation, persistence, resampling and noise as possible explanations. Record whether background subtraction or PSF matching was actually performed. Treat a simple difference image as exploratory when these corrections are absent.

Keep a consistent comparison stretch by default and expose changes to that stretch. Independent automatic normalization can make a constant source seem variable. Preserve raw calibrated values for measurements; do not compute scientific fluxes from contrast-adjusted PNGs. Do not fill sparse observations with invented intermediate data. Animation may repeat real frames, but must show their actual timestamps and gaps.

Use approximate wavelength lookup for display only where documented. For quantitative spectral analysis, follow the archive's calibrated wavelength and bandwidth guidance. Do not present a quick-look spectrum as fully calibrated photometry without the required calibration and uncertainty work.

## Distinguish motion and variability

Optional [image refinement](astro-refinement.md) smooths a separate native-derived
visual copy and softens display highlights. It starts off because faint peaks
can be attenuated. Original values, uncertainty and strict validity remain the
measurement source; Mark pauses refinement. No photometric or detection claim
may be based on the filtered image alone.

The user-authorized [Clean View](clean-view.md) can display explicitly labelled
small-gap estimates by default. Keep that derivative separate from observations:
preserve original masks and values, disclose the estimate, provide original and
estimated-area views, and exclude estimates from measurements and candidate
validity. Mark mode shows original data. Never borrow a different date to fill
an observation, or present estimated brightness as a measured change.

A moving source shifts relative to aligned background objects. A variable source changes brightness at approximately the same sky position. Both can appear in the challenge, so do not require every reference target to move. Account for proper motion and, where relevant, parallax and catalog epoch before declaring a catalog mismatch.

The challenge names five validation targets:

| Target | Intended check |
| --- | --- |
| Barnard's Star | Nearby fast apparent stellar motion and coordinate handling. |
| Epsilon Indi B | Brown-dwarf-system context and source identification. |
| WISE 0855 | Faint, fast-moving brown dwarf; challenge coordinates are RA 08h55m10.831s, declination -7d14m42.53s. |
| RW Aurigae | Brightness variability rather than compulsory displacement. |
| R Draconis | Brightness variability rather than compulsory displacement. |

Search current available observations and document the usable epochs, bands and limitations for each. Do not claim that all five passed from a successful search alone. If a source is too faint, saturated, outside coverage or lacks comparable visits, show that result and keep the validation task open. Treat the supplied WISE 0855 coordinate as a reference position, not an epoch-independent guarantee of its current pixel.

## Validate without overstating

Use a small real SPHEREx fixture with provenance to check pixel-to-sky round trips, sky registration, mask propagation, timestamp order and spectral selection. Use clearly separate synthetic fixtures for known shifts and constant-source controls. Test an out-of-coverage field and an upstream failure. Report detection completeness or false-positive rates only when an actual labeled evaluation supports them.

Annotate findings with sky coordinates when valid WCS is available, frame identity, observation time, notes and current review status. Preserve pixel coordinates only with their original grid/transform. Do not suggest external scientific reporting until the candidate and provenance are reviewable. Export evidence and limitations together.

Keep the primary challenge flow in focus: accept sky coordinates, retrieve real SPHEREx observations, play a comparable sequence, inspect quality and mark features for review. Add automated detection, spectra and other missions only after this flow works. See [data-sources.md](data-sources.md) and [testing.md](testing.md).
