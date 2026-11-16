# Partial SPHEREx observation metadata seed

These three compressed files are original SIA CSV responses saved by the
[resolution acquisition](../../docs/evidence/resolution/acquisition.json).
They contain 1,387 DR1/QR3 wide-survey observation records with actual sky
footprints, times, detector and spectral intervals. They do not contain images.
The deep-survey response is deliberately excluded from the wide-survey adapter.

The [seed manifest](manifest.json) records the query URL and SHA-256 of each
uncompressed response. `recorded_utc` is the acquisition report timestamp. The
exact retrieval time of each individual CSV was not recorded. This timestamp
must not be interpreted as the observation date or a new archive refresh.

The covered footprints are around WISE 0855, Epsilon Indi B and the north
ecliptic pole. They support positions inside those detector footprints, not
arbitrary all-sky coverage or a complete catalog for any field. An empty local
lookup cannot establish that the archive has no data. Dates and wavelength
filters still apply, and the processor validates actual target wavelengths.

On an IRSA discovery outage, the backend can find matching observations from
these records and download fresh cutouts for the requested position. It never
substitutes prepared example images. Successful live searches add metadata to
the persistent index. See [operation and limits](../../docs/observation-index.md).

Source: [IRSA SPHEREx data access](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/).
DR1 spectral image identifier: [10.26131/IRSA678](https://doi.org/10.26131/IRSA678).
Retain the [project's source acknowledgements](../../docs/data-sources.md).
