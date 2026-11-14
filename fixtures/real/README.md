# Cached real SPHEREx examples

These small bundles are previously acquired observations, not synthetic fixtures or new live results for the coordinates in the form. The local Python service must be running, but loading these fields does not contact IRSA. Choose the named field under **Saved observations**, then select **Load cached real example**. The form coordinates are preserved.

| Role | Bundle | Original epochs | Acquisition record |
| --- | --- | --- | --- |
| Primary field | [WISE 0855](real-wise-0855/manifest.json) | Three real epochs, recorded in the manifest | [Probe record](real-wise-0855/acquisition-record.json) |
| Backup field | [Epsilon Indi B](real-epsilon-indi-b/manifest.json) | Two real epochs, recorded in the manifest | [Probe record](real-epsilon-indi-b/acquisition-record.json) |

Acquisition completed on November 14, 2026 at 20:37:40.137173 UTC for WISE 0855 and 20:37:09.240354 UTC for Epsilon Indi B. These are acquisition/preparation timestamps; original observation times remain in every frame. The [five-target report](../../docs/target-coverage.md) records the query bounds and outcomes. Neither this playback nor an unmasked target pixel establishes recovery of the named source, motion, variability, or a discovery. Input WCS is applied as supplied; precision astrometry is not claimed.

## Lineage and integrity

Each directory contains a cached manifest, the unchanged original source manifest, the acquisition record (including source FITS URLs, byte counts and SHA256 hashes), the exact derived PNGs, and `lineage.json`. The latter records all served/preparation file sizes and SHA256 hashes. WCS, mask fractions, one shared stretch, approximate target wavelengths, release identifiers, warnings, and real UTC epochs are preserved. Bulky source FITS files are not included. These images are for visual comparison: point-spread functions/backgrounds are not matched and resampling uncertainties are not propagated.

The API verifies checksums, source/manifest consistency, canonical local URLs, PNG format and grid dimensions before exposing a bundle. A missing or corrupt configured bundle produces HTTP 503 with `CACHED_EXAMPLE_UNAVAILABLE`; the interface reports the problem instead of substituting another field. Restore the reviewed files and reload the page. Missing individual or unlisted asset names return an explicit failure. The [synthetic development fixture](../synthetic/sequence-manifest.json) remains separately labelled and served separately.

## Reproduce the package

The original bounded acquisition is recorded by [probe-spherex.py](../../scripts/probe-spherex.py) and [target-coverage.json](../../docs/target-coverage.json). Archive availability and later processing changes can alter a future acquisition; the hashes identify this exact snapshot. Given the corresponding source manifest, PNG directory and probe JSON, package without any archive request:

```sh
python scripts/package-real-example.py --manifest SOURCE/real-wise-0855/manifest.json --assets SOURCE/real-wise-0855 --provenance-report REPORT/target-coverage.json --output fixtures/real --sequence-id real-wise-0855 --title "WISE 0855 field (primary)" --role primary --acquired-at 2026-11-14T20:37:40.137173+00:00 --acquisition-reference "docs/target-coverage.json target wise-0855; fresh bounded five-target probe"
```

Use an empty destination. The packaging command refuses to overwrite an existing reviewed example. Its `--acquired-at` value must match the actual probe record; running packaging does not invent a new acquisition time. The `packaged_at_utc` field separately records the packaging operation. No original observation date or scientific pixel is changed.

## Data credits and use conditions

Source: public SPHEREx DR1/QR3 spectral-image cutouts from NASA/IPAC IRSA. Derived display rendering: Khonsu, ByteBoyz. The code's MIT license does not replace data-provider terms.

IRSA's [data-use terms](https://irsa.ipac.caltech.edu/data_use_terms.html) distinguish unrestricted public data from proprietary data and copyrighted survey material. These bundles use public SPHEREx cutouts, not proprietary data or Digital Sky Survey imagery. The [DR1 overview](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html) provides the release-specific acknowledgement and spectral-image DOI [10.26131/IRSA678](https://doi.org/10.26131/IRSA678); the [archive acknowledgement page](https://irsa.ipac.caltech.edu/ack.html) provides IRSA's required publication credits. Retain these links, release identifiers and credits when sharing the bundles or citing them in a publication.

SPHEREx is funded by NASA and is a joint JPL/Caltech project. NASA funds IRSA, which Caltech operates. Required provider acknowledgement text is linked above. No external photograph, logo or copyrighted third-party illustration is part of the bundled pixel data. NASA does not endorse Khonsu; participants remain responsible for external data-use requirements. See [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) for its separate imagery and identifier restrictions.
