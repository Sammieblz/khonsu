# Browser display processing

Samuel's console pass: GitHub #35, Linear BYT-36. CPython retains FITS reading,
calibration, WCS registration, wavelength compatibility and validity decisions.
The browser only maps prepared intensities to display colors and transforms the
viewport. An adjusted image is not calibrated photometry or a discovery.

## Prepared assets

Optional `Frame.raster` describes an allowlisted binary asset with encoding
`float32-le-mask8-v1`, SHA-256 and exact byte count. The manifest grid supplies
width and height. The file contains width * height little-endian Float32 values,
then that many Uint8 validity values (0 invalid, 1 valid). Both planes use
top-left row-major order, matching the PNG. Invalid intensities are transported
as zero with validity 0; valid negative and bright values remain unclipped.
Values retain MJy/sr units but lack propagated resampling uncertainties.

The limit is 1024 by 1024 and five bytes per pixel. A 118-square field is
69,620 bytes. A 512-square field is 1,310,720 bytes. Clients check the limit,
exact size and checksum before interpreting a buffer. PNG-only manifests remain
supported. Cached bundles retain their original source manifest, acquisition
record, PNG and source observations; derived rasters add their own inventory and
the SHA-256 of the preserved aligned FITS used to produce them.

Regenerate the reviewed derived assets using:

```sh
python scripts/prepare-browser-examples.py --aligned-root .cache/pass-targets
```

The input directory contains the already validated aligned FITS outputs from
the five-target probe, not browser images reverse-converted to intensities.

## Rendering experiment

![Three display treatments of one authentic exposure](evidence/console/display-comparison.png)

The comparison uses the first WISE 0855 cached exposure and the same pooled
limits, geometry and validity mask. Asinh 0.3 darkens faint background compared
with 0.1. Nearest display sampling keeps individual grid pixels inspectable;
bilinear display sampling softens their boundaries. The third panel tests
screen interpolation, not a different scientific WCS reprojection. Keep the
validated bilinear scientific registration unchanged. No new resolution is
created and no masked source is recovered by contrast changes.

The browser's quiet preset uses asinh 0.3 with the original shared limits;
Original restores the manifest curve (currently 0.1). Every displayed epoch
shares the same settings. Retain 6 arcminutes for the validated examples;
10-12 arcminute live searches are available through the existing bounded field
input but their coverage and comparison quality require a new archive result.
Do not relabel the existing cache as a larger field.

Background matching needs independent stationary-source and uncertainty tests.
PSF matching generally softens sharper observations to a common response. Both
remain unimplemented and explicitly disclosed. WebGPU is a future option if
WebGL2/CPU benchmarks establish a useful benefit on these small fields.
