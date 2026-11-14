# Target coverage

Verified live probe: November 14, 2026, starting at 09:42:14 UTC. The [GitHub Actions job](https://github.com/Sammieblz/khonsu/actions/runs/43581772359/job/132407826811) completed successfully using commit `b5642120c8baab90701a029176ec6e2023692ba9`. Its `real-observation-probe` artifact contains the report and processed R Draconis field. The [machine-readable report](target-coverage.json) is copied exactly from that job's emitted artifact record.

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

Metadata is capped at 5,000 rows and 8 MiB. FITS responses are capped at 48 MiB each and 256 MiB per sequence. Requests have finite timeouts, a total retrieval deadline and cancellation checks between reads. Transient failures are retried with capped 1, 2, 4 and 8 second backoff: at most five attempts for the metadata query and three per FITS cutout. IRSA's `Retry-After` header (observed as 5 seconds) is honoured up to 15 seconds, and no wait crosses the deadline. A cutout that stays busy or unusable is skipped; the job continues with the remaining real observations and the manifest carries an `ARCHIVE_DOWNLOADS_SKIPPED` warning with the count. If fewer than two cutouts download, the job reports `archive_busy` (HTTP 429 or 503) or `archive_unavailable` rather than an epoch shortage. The recorded probe ran with the earlier three-attempt, no-skip policy. Downloads and redirects allow only HTTPS `irsa.ipac.caltech.edu/ibe/data/spherex/{dr1,qr3}/level2/...fits` paths. An overflow asks the user to narrow the date range; it is not silently reported as complete coverage.

Re-run with `python scripts/probe-spherex.py --output fixtures/real --report docs/target-coverage.json --max-frames 8 --max-seconds 240`. The global time budget now reaches scientific processing through its cancellation callback, including time already spent querying and downloading. Cancellation is cooperative between processing operations; it does not forcibly terminate a running native-library call. This deadline wiring was added after the recorded probe and does not change its measured results.

No preset promises visible motion, brightness variation, a brown dwarf detection, or a Planet X candidate. Keep WISE, Gaia DR3 and NEOSSat as future contextual integrations unless their real retrieval, registration and provenance have been implemented.
