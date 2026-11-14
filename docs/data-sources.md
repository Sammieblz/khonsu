# Data sources and provenance

Status: implementation guidance for Khonsu. Listing a resource here does not mean that its integration is implemented. Verify current archive behavior before changing a provider adapter. Last reviewed: November 14, 2026.

## Required foundation

The [Planet X and SPHEREx challenge](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/) requires a public web tool that accepts Right Ascension and declination and plays observations of the same sky region over time. SPHEREx expands to Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer. Real SPHEREx observations are mandatory for the working science flow. An animated spacecraft, a synthetic star field, a WISE-only viewer, or a static all-sky background does not satisfy that integration.

Keep the full [official resource list](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources) visible in project references:

| Official resource | What it provides | Khonsu use |
| --- | --- | --- |
| [NASA/IPAC Infrared Science Archive](https://irsa.ipac.caltech.edu/Missions/spherex.html) | SPHEREx data, release documentation and access services. IPAC is the Infrared Processing and Analysis Center; IRSA is its Infrared Science Archive. | Required source of observations. |
| [SPHEREx Tutorial Notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/) | Python examples for images, cutouts, point spread functions, source discovery and cubes. | Required implementation reference; cite reused methods. |
| [WiseView](http://byw.tools/wiseview) | Time-comparison interface for the earlier Wide-field Infrared Survey Explorer (WISE) mission. | Interaction reference; optional WISE comparison later. |
| [Gaia Mission Data](https://archive.stsci.edu/missions-and-data/gaia) | Stellar positions, motions and other catalog information. | Optional Data Release 3 catalog overlay later. |
| [NEOSSat mission](https://www.asc-csa.gc.ca/eng/satellites/neossat/) | Canadian mission background for asteroid, comet, satellite and stellar observations. | Optional supporting context. |
| [Canadian Astronomy Data Centre](https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/) | Telescope archives, region searches and download services. | Optional complementary archive later. |
| [NEOSSat Data Tutorial](https://github.com/asc-csa/NEOSSAT_Tutorial) | Python notebooks for download, filtering, Flexible Image Transport System (FITS) images and elementary processing. | Optional reference; its simple motion demonstration does not correct image drift. |
| [NEOSSat Dataset](https://data.asc-csa.gc.ca/dataset/neossat) | Near-Earth Object Surveillance Satellite astronomy images. | Optional future provider; this exact portal timed out during review. Use the [CADC product guide](https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/neossat/) to verify available product variants. |

Do not add eight separate minimum viable product (MVP) integrations or eight blocking issue groups. Deliver SPHEREx access and temporal comparison first. WISE, Gaia Data Release 3 and NEOSSat belong in a clearly optional roadmap until that works.

## Current release policy

The [DR1 overview](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html) and [archive access guide](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) are authoritative. Data Release 1 (DR1) arrived on November 12, 2026. Its reprocessed spectral images are intended to form a uniform set with Quick Release 3 (QR3). Together they supersede QR2; QR2 remains directly downloadable through February 2027 but is no longer searchable.

For time-domain work, query the DR1 and QR3 spectral image collections, merge observations, and deduplicate stable observation and product identities. Include deep-survey collections only when requested. Record collection, processing version and retrieval date. Do not silently mix older QR2 processing with current releases.

The DR1 all-sky cube is useful for context or spectral exploration. Do not present that combined product as a sequence of independently dated observations. Use individual spectral images with their actual observation times for the challenge's time comparison.

## Data access boundary

Use backend provider adapters for archive searches and downloads. Validate coordinates, field size, time range and allowed provider before outbound requests. Use metadata-returned archive URLs from permitted archive hosts; do not accept arbitrary download URLs from clients.

Use the official [Simple Image Access version 2](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) service for position, wavelength and time searches, or the documented Table Access Protocol path when needed. Prefer spatial cutouts to full detector downloads. Bound query result counts, bytes, timeouts and retries. Cache successful immutable inputs. Treat an empty result, unavailable epoch, service failure and job failure as distinct outcomes.

Keep extraction and FITS handling in the processing module. Keep network access, response schemas and job lifecycle in the data/API module. Share the canonical contracts from [integration.md](integration.md).

## Provenance required for every rendered frame

| Field | Meaning |
| --- | --- |
| Mission and collection | SPHEREx and the exact release/collection used. |
| Observation and product identity | Stable archive identifiers and original filename. |
| Observation timestamp | Source time, original time convention and normalized Coordinated Universal Time (UTC) representation. Never use download or render time as observation time. |
| Spectral selection | Detector, wavelength or channel information, selected range, and whether that selection is approximate. |
| Spatial reference | Requested coordinates, frame, field of view, output grid and World Coordinate System information. |
| Source reference | Source landing page and retrievable archive URL, plus fetch date. |
| Processing record | Pipeline version, settings, mask policy, resampling, background treatment and display stretch. |
| Quality | Available flags, valid coverage, uncertainty information and limitations. |

Preserve these fields through downloads, processing results, manifests, exports and shared URLs. Keep source files immutable. Separate display images from calibrated source arrays. Label cached real examples as examples and retain their real provenance; label simulations as simulations.

## Attribution and third-party use

Include the archive's current [SPHEREx acknowledgements and data identifiers](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html) in project references and exports where appropriate. DR1 identifies spectral images as [10.26131/IRSA678](https://doi.org/10.26131/IRSA678) and its spectral all-sky cube as [10.26131/IRSA679](https://doi.org/10.26131/IRSA679). Preserve additional resource-specific credits and licenses when reusing code or media.

Carry the official resource-page notice exactly:

> NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

Credit NASA data without implying that NASA reviewed, approved or endorses Khonsu. Follow the [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) for imagery and 3D media. NASA identifiers have separate restrictions. Preserve any third-party copyright credit attached to an asset.

## Mission context is separate

An optional [NASA Eyes SPHEREx view](https://eyes.nasa.gov/apps/solar-system/#/sc_spherex) can explain the spacecraft and orbit. Label its simulation clock separately from the observation timeline. NASA describes [iframe embedding](https://science.nasa.gov/learn/learn-nasa-science/) for Eyes on the Solar System. Do not claim that a downloadable official SPHEREx 3D model has been verified unless an actual asset and its terms have been checked.

See [science-integrity.md](science-integrity.md) before implementing comparisons or candidate labels.
