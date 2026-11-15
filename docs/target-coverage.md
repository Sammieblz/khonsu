# Target coverage

This is a historical acquisition record. The recorded limits and pipeline below
describe that run. Current resource bounds are documented in [native wide fields](hd-fields.md).

Live probe started: 2026-11-14T20:36:07.993960+00:00. Finished: 2026-11-14T20:38:39.304027+00:00. Collections: SPHEREx DR1 and QR3.

Every named challenge field receives a bounded attempt. An upstream failure is not a statement that the archive lacks coverage. A successful field sequence is not a recovered target detection, motion measurement, variability measurement or Planet X discovery.

Search positions are approximate J2026 ICRS field centres propagated from cited measurements. Parallax, perspective acceleration and binary orbits are omitted. Reference coordinates, measurement epochs, proper motions and query parameters are preserved in the JSON report.

| Target | ICRS RA, Dec (degrees) | Archive footprints | Outcome | Usable field frames |
| --- | --- | --- | --- | --- |
| Barnard's Star | 269.4462685, 4.7682045 | 358 | Ready: 3 comparable field frames | 3 |
| Epsilon Indi B | 331.0986113, -56.8008041 | 458 | Ready: 2 comparable field frames | 2 |
| WISE 0855 | 133.7601214, -7.2421279 | 258 | Ready: 3 comparable field frames | 3 |
| R Draconis | 248.1672331, 66.7550238 | Query failed | Failed: archive_timeout | 0 |
| RW Aurigae | 76.9565866, 30.4012913 | 335 | Ready: 2 comparable field frames | 2 |

## Demonstration selection

Primary field: `wise-0855`. Backup field: `epsilon-indi-b`. Cached example sequence: `real-wise-0855`.

Selection prefers sequences with no TARGET_MASKED warning, then a larger number of comparable real epochs, with preset ID as a deterministic tie break. An unmasked nearest target pixel still does not establish source identification or detection, particularly for faint WISE 0855 or unresolved Epsilon Indi Ba/Bb.

The report's complete canonical manifests preserve output WCS, original dates, source URLs, release, detector, approximate target wavelength and bandwidth, fixed stretch, masks and processing versions. Each downloaded cutout also has its SHA-256 and byte size recorded. Large original FITS files are temporary; small reproducible cached bundles are delivered separately by issue #9.

## Barnard's Star

Checked: 2026-11-14T20:36:07.993987+00:00. Status: `success`. Large proper motion is useful context; a short SPHEREx baseline need not show a perceptible shift.

Sequence `real-barnards-star`, pipeline `khonsu-display-0.3.0`, common 118 x 118 north-up/east-left ICRS grid, 6.0 arcminute field.

| Observation ID | Exposure start UTC | Release | Wavelength at target (micrometers) | Masked field | Target quality |
| --- | --- | --- | --- | --- | --- |
| `2026W11_2A_0501_3` | 2026-03-15T00:50:22.963200Z | DR1 | 1.51623148 | 3.512% | TARGET_MASKED |
| `2026W34_1A_0363_1` | 2026-08-18T20:48:38.822400Z | QR3 | 1.51115404 | 2.485% | TARGET_MASKED |
| `2026W39_1A_0371_1` | 2026-09-22T15:04:21.014400Z | QR3 | 1.51118564 | 6.708% | TARGET_MASKED |

## Epsilon Indi B

Checked: 2026-11-14T20:36:45.580741+00:00. Status: `success`. The Ba/Bb pair is not expected to be resolved by SPHEREx; binary orbital motion is omitted from this field centre.

Sequence `real-epsilon-indi-b`, pipeline `khonsu-display-0.3.0`, common 117 x 117 north-up/east-left ICRS grid, 6.0 arcminute field.

| Observation ID | Exposure start UTC | Release | Wavelength at target (micrometers) | Masked field | Target quality |
| --- | --- | --- | --- | --- | --- |
| `2025W19_1B_0344_3` | 2025-05-07T05:14:15.590400Z | DR1 | 1.68508150 | 3.192% | No target-pixel warning; not a detection claim |
| `2026W39_2A_0581_1` | 2026-09-27T05:58:12.172800Z | QR3 | 1.69439394 | 2.878% | No target-pixel warning; not a detection claim |

## WISE 0855

Checked: 2026-11-14T20:37:09.251313+00:00. Status: `success`. Very faint, red and blended at shorter wavelengths. Archive coverage does not establish a detection or measurable motion.

Sequence `real-wise-0855`, pipeline `khonsu-display-0.3.0`, common 118 x 118 north-up/east-left ICRS grid, 6.0 arcminute field.

| Observation ID | Exposure start UTC | Release | Wavelength at target (micrometers) | Masked field | Target quality |
| --- | --- | --- | --- | --- | --- |
| `2025W45_2A_0292_2` | 2025-11-07T20:31:27.206400Z | DR1 | 1.41316437 | 3.167% | No target-pixel warning; not a detection claim |
| `2025W50_2A_0479_1` | 2025-12-13T05:32:45.657600Z | DR1 | 1.41300970 | 3.016% | No target-pixel warning; not a detection claim |
| `2026W18_2A_0663_1` | 2026-05-03T05:10:37.948800Z | DR1 | 1.40498537 | 2.471% | No target-pixel warning; not a detection claim |

## R Draconis

Checked: 2026-11-14T20:37:40.148136+00:00. Status: `failure`. Brightness comparisons require matching wavelength, quality and calibration; an animation alone is not a light curve.

Recorded failure: `archive_timeout`. Archive retrieval exceeded its time budget. Try fewer frames.

## RW Aurigae

Checked: 2026-11-14T20:38:08.067190+00:00. Status: `success`. Complex young-star variability is a hypothesis for inspection, not an automated classification.

Sequence `real-rw-aurigae`, pipeline `khonsu-display-0.3.0`, common 117 x 117 north-up/east-left ICRS grid, 6.0 arcminute field.

| Observation ID | Exposure start UTC | Release | Wavelength at target (micrometers) | Masked field | Target quality |
| --- | --- | --- | --- | --- | --- |
| `2026W10_2B_0626_1` | 2026-03-08T21:05:12.768000Z | DR1 | 1.03595237 | 2.111% | TARGET_MASKED |
| `2026W36_1A_0476_3` | 2026-09-02T02:24:13.305600Z | QR3 | 1.02910492 | 6.085% | TARGET_MASKED |

## Processing and interpretation limits

One detector is selected per bounded sample. The full comparison group must have target-wavelength center spread no larger than one quarter of its smallest bandwidth. SIA BAND overlaps a whole image and cannot replace this target-position check. WCS-WAVE wavelengths are approximate visualization values, not calibrated spectrophotometry.

The retrieval cutout is 1.5 times the displayed field width, capped at 60 arcminutes and never narrower than the requested field. Validity-weighted reprojection preserves bad-pixel locations and coverage masks. A common sky-referenced asinh stretch is used across a sequence. No PSF/background matching, resampling uncertainty propagation, inpainting, stacked epochs or interpolated observation times are claimed.

SIP convention diagnostics, when emitted, are recorded in the JSON report. The existing reader explicitly clears SIP on its alternate spectral WCS before wavelength lookup, while retaining the supplied celestial WCS. No header correction or precision astrometric validation is claimed here; stationary-source and external-catalog validation remain separate from field playback.

The global probe budget is shared fairly across remaining targets, with an additional per-target cap. Metadata, per-file downloads, combined bytes, retry waits and processing cancellation remain bounded. A missing second comparable epoch is distinct from an archive timeout or malformed response.

## Reproduction

```sh
python scripts/probe-spherex.py --output .cache/validated-fields --report docs/target-coverage.json --max-frames 16 --max-seconds 900 --target-max-seconds 180
```

Exact API request parameters and acquisition UTC timestamps for each target are in the JSON report. Repeating a bounded sample later can return different archive data; compare source IDs and hashes before interpreting differences.

## Diagnostic record

[
  {
    "code": "ASTROPY_SIP_CONVENTION",
    "scope": "run",
    "input_attribution": "Not captured per input in this run",
    "message": "Astropy logged SIP cards with alternate WCS CTYPE lacking -SIP; the existing reader clears SIP for spectral lookup; no header correction or precision astrometric validation is claimed."
  }
]

## Independent reproduction

{
  "method": "Separate live browser query from the integration agent",
  "query": {
    "ra_deg": 133.7601213914074,
    "dec_deg": -7.242127941212259,
    "coordinate_frame": "ICRS",
    "fov_arcmin": 6.0,
    "max_frames": 16,
    "detector": null,
    "wavelength_min_um": null,
    "wavelength_max_um": null,
    "start_utc": null,
    "end_utc": null
  },
  "ready_elapsed_seconds": 38.448,
  "browser_check_elapsed_seconds": 41.247,
  "compared_fields": [
    "observation_id",
    "observed_start_utc",
    "release",
    "detector",
    "wavelength_um",
    "masked_fraction",
    "grid",
    "display"
  ],
  "result": "All three primary source frames and comparison metadata matched the independent live query exactly",
  "processing_source_revision": "c3316e2814ba317eadc88795f9078042db006128",
  "source_revision_scope": "The browser/API application running at this main commit; this independent replay did not execute the modified probe script."
}

Processing provenance: `c3316e2814ba317eadc88795f9078042db006128`. The revision identifies the unchanged retrieval and scientific processing application modules. Acquisition used the modified probe worktree; it is not an immutable revision of the complete probe script. Target-validation worktree with uncommitted probe changes during acquisition. Report generation and diagnostic recording were completed after acquisition in this branch.


# Earlier probe evidence

Verified live probe: November 14, 2026, starting at 09:42:14 UTC. The [GitHub Actions job](https://github.com/Sammieblz/khonsu/actions/runs/43581772359/job/132407826811) completed successfully using commit `b5642120c8baab90701a029176ec6e2023692ba9`. Its `real-observation-probe` artifact contains the report and processed R Draconis field. That historical artifact preserves the earlier machine-readable report. The current [machine-readable report](target-coverage.json) contains the later complete five-target run described above and is not a copy of the earlier artifact.

All five searches returned real archive metadata. One bounded processing attempt produced two comparable real field frames. Both R Draconis target pixels were masked, so this is a field-playback demonstration and does not establish a measurement, detection, motion or variability of R Draconis itself. No Planet X discovery or target-recovery claim follows from these results.

The probe used `--max-frames 8`, a 6-arcminute field and 256-pixel output. Counts below include all returned detector footprints, while each processing attempt selected at most eight exposures from one detector. A failed bounded sample does not establish that the archive lacks usable observations elsewhere in the returned set.

| Target | ICRS search RA, Dec (degrees) | Real metadata rows | Processing outcome |
| --- | --- | --- | --- |
| Barnard's Star | 269.4462685, 4.7682045 | 358, DR1/QR3 | No qualifying two-epoch spectral group in the bounded sample. |
| Epsilon Indi B | 331.0986113, -56.8008041 | 458, DR1/QR3 | Metadata search succeeded; the later retrieval failed with `archive_unavailable`. |
| WISE 0855 | 133.7601214, -7.2421279 | 258, DR1 | No qualifying two-epoch spectral group in the bounded sample. |
| R Draconis | 248.1672331, 66.7550238 | 539, DR1/QR3 | Two comparable field frames rendered; target pixels masked in both. |
| RW Aurigae | 76.9565866, 30.4012913 | 335, DR1/QR3 | Metadata verified; processing not attempted after the example was saved. |

## Verified real field example

Sequence `real-r-draconis` uses detector 1 and a common north-up, east-left ICRS TAN grid with one fixed asinh stretch.

| Exposure start, UTC | Release | Wavelength at target | Masked field pixels | Target quality |
| --- | --- | --- | --- | --- |
| 2025-10-18 21:42:15.753600 | DR1 | 0.75905463 micrometers | 17.69% | `TARGET_MASKED` |
| 2026-07-11 08:58:46.560000 | QR3 | 0.76235266 micrometers | 25.47% | `TARGET_MASKED` |

These masked fractions were measured with display pipeline 0.2.0, which used a field-width cutout and spread each masked pixel into its neighbours. Pipeline 0.3.0 masks far less; see [display rendering](display-rendering.md).

The wavelength-center difference is about 0.00329803 micrometers, below this group's 0.00446936-micrometer tolerance. Matching uses the approximate WCS-WAVE lookup at the requested position, with a maximum center spread of one quarter of the smallest bandwidth. It does not establish identical spectral responses throughout the field.

The processor retained source metadata, quality masks and a shared celestial grid. Backgrounds and point-spread functions were not matched, and resampling uncertainty was not propagated. The emitted manifest explicitly records those limits and both `TARGET_MASKED` warnings. The measured outcome is successful retrieval and rendering of a real field sequence, with target-source validation still open.





## Coordinate references

| Target | Coordinate reference | Search context |
| --- | --- | --- |
| Barnard's Star | [SIMBAD ICRS J2000 position and Gaia proper motion](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Barnard%27s+Star) | Approximately 10.36 arcseconds/year northward; the reference position is propagated before this search. |
| Epsilon Indi B | [Discovery paper Table 1](https://arxiv.org/pdf/astro-ph/0212487) | J2000 equatorial Ks position measured at epoch 1999.855, propagated with the paper's proper motion. This is the B brown dwarf pair, not primary A. |
| WISE 0855 | [Luhman 2014 Tables 1 and 2](https://arxiv.org/pdf/1404.6501) | J2000 equatorial Spitzer position at MJD 56677.3, propagated with the discovery paper's proper motion. Faintness and blending can prevent detection despite coverage. |
| R Draconis | [SIMBAD ICRS J2000 position](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=R+Dra) | Long-period variable field; masked target pixels prevent a source measurement in this example. |
| RW Aurigae | [SIMBAD ICRS J2000 position](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=RW+Aur) | Young variable-star field; metadata coverage alone does not establish source variability. |

`apps/api/app/retrieval/presets.py` contains the exact source coordinates, measurement epochs, proper motions and approximate J2026 field centres. Linear propagation divides RA proper motion by cosine declination because the catalogue quantity is mu-alpha-star. It omits parallax, perspective acceleration and binary orbital motion, and must not be described as a precision ephemeris.

## Discovery and cutout policy

The [official introductory notebook](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) queries the IRSA SIA service with `collection=['spherex_dr1','spherex_qr3']`. The [current access guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) confirms those compatible releases. The [SIA service guide](https://irsa.ipac.caltech.edu/ibe/sia.html) defines `POS` in ICRS degrees, `TIME` in MJD, `BAND` in metres and `RESPONSEFORMAT=CSV`.

Khonsu searches a one-arcsecond cone at the supplied field centre, selects the most populated detector when none was requested, and samples actual exposures across the available time span. It appends the documented `center` and `size` parameters to approved IRSA FITS URLs. Size is 1.5 times the square field width in degrees, capped at 60 arcminutes and never below the field width, so the detector-aligned cutout covers the corners of the north-up field (see [display rendering](display-rendering.md)). A detector footprint can cover the centre without covering the whole field; processing masks uncovered pixels.

The returned fields `obs_id`, `t_min`, `t_max`, `energy_bandpassname` and `access_url` supply provenance. FITS processing dates are not exposure dates. SIA image-level wavelength overlap is not proof of a comparable wavelength at the target. The processor checks the target's WCS-WAVE wavelength and bandwidth, flags, finite values and coverage as described by the [official data-products guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

Metadata is capped at 5,000 rows and 8 MiB. FITS responses are capped at 48 MiB each and 256 MiB per sequence. Requests have finite timeouts, a total retrieval deadline and cancellation checks between reads. Transient failures are retried with capped 1, 2, 4 and 8 second backoff: at most five attempts for the metadata query and three per FITS cutout. IRSA's `Retry-After` header (observed as 5 seconds) is honoured up to 15 seconds, and no wait crosses the deadline. A cutout that stays busy or unusable is skipped; the job continues with the remaining real observations and the manifest carries an `ARCHIVE_DOWNLOADS_SKIPPED` warning with the count. If fewer than two cutouts download, the job reports `archive_busy` (HTTP 429 or 503) or `archive_unavailable` rather than an epoch shortage. The earlier 09:42 UTC probe recorded above ran with the three-attempt, no-skip policy. The current complete five-target run uses the bounded parallel-download and skip policy described here. Downloads and redirects allow only HTTPS `irsa.ipac.caltech.edu/ibe/data/spherex/{dr1,qr3}/level2/...fits` paths. An overflow asks the user to narrow the date range; it is not silently reported as complete coverage.

### Download speed (BYT-35)

Cutouts download four at a time (`DOWNLOAD_CONCURRENCY`) instead of one by one. Each cutout's time is dominated by archive latency, not size. Downloads start in widest-gap order across the sampled time span (first, last, middle, then quarters), and results return in chronological order. The 256 MiB sequence cap counts bytes as they stream, so parallel downloads cannot exceed it together, and a failed attempt gives its bytes back. A fatal error (cancellation, deadline or size limit) interrupts the other downloads.

After each file arrives, the job manager applies processing's own target-wavelength lookup and grouping rule. Once four distinct comparable epochs (or `max_frames`, if smaller) are present, no new downloads start. Files already in flight are kept, and the manifest carries an `ARCHIVE_SEARCH_STOPPED_EARLY` warning with the number not fetched. Processing still makes the final selection. The job reports "Downloaded k of n IRSA observations" as files arrive, and the manifest records `archive_busy_responses`.

Measured on November 14, 2026, for the north ecliptic pole (RA 270.0, Dec +66.5607, 6 arcmin, 16 frames):

| Policy | Total | Busy replies |
| --- | --- | --- |
| One at a time | 198 s (191 s downloading, 1.4 s processing) | 4 retry waits |
| Four at a time, three runs | 62.6, 63.5 and 62.6 s | 0, 1 and 4 |

All runs selected the same two exposures. The early stop did not trigger, because this field yields only two comparable epochs out of 16. Through the full app the search was ready in 85 s, down from 210 s.

IRSA's SIA `BAND` filter matches each image's whole detector band, not the wavelength at the target. A 3.919 to 3.923 micrometre filter at this position still returned all 336 detector-5 images. Matching exposures therefore cannot be chosen before download from the SIA query alone. Predicting the target wavelength from image footprints and the fixed per-detector filter layout remains a possible follow-up.

Re-run the complete validation with `python scripts/probe-spherex.py --output .cache/validated-fields --report docs/target-coverage.json --max-frames 16 --max-seconds 900 --target-max-seconds 180`. The global time budget now reaches scientific processing through its cancellation callback, including time already spent querying and downloading. Cancellation is cooperative between processing operations; it does not forcibly terminate a running native-library call. This deadline wiring was added after the recorded probe and does not change its measured results.

No preset promises visible motion, brightness variation, a brown dwarf detection, or a Planet X candidate. Keep WISE, Gaia DR3 and NEOSSat as future contextual integrations unless their real retrieval, registration and provenance have been implemented.
