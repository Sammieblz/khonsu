# R Draconis masked-core regression inputs

These two prepared rasters were captured from the user's real Docker live job
`job-35b322628291461987f3844e6631cc85` on November 16, 2026. This is a validation
fixture, not a cached example offered by the application.

`source-manifest.json` is the unmodified original manifest. It records source
FITS cutout URLs, real exposure times, DR1/QR3 releases, WCS, the shared stretch,
native sampling and processing version `khonsu-display-0.8.0`. Only the original
`frame-0001.bin` and `frame-0002.bin` intensity/quality assets and their original
PNG previews are included here.
Other asset URLs in the historical manifest describe the original temporary job
and are not permanent download links. The source FITS URLs are the archive
references for reproducing processing at the manifest's coordinates and field.

Each binary has a top-left little-endian float32 plane and byte quality plane on
the same 117 by 117 grid. Its SHA-256 is verified against the manifest in the
regression test. Original strict validity remains unchanged. The central masked
components have 269 and 245 prepared pixels; their actual flux is unknown.

Run `python -m pytest apps/api/tests/test_gap_fill.py -q` to verify deterministic
display completion, boundary bounds and source immutability. Filled values must
never be used as target photometry or evidence of variability.

Source: NASA/IPAC IRSA SPHEREx spectral images,
[data-product documentation](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).
