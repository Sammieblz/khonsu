"""Deterministic synthetic FITS controls, not astronomical observations.

The WCS-WAVE layout follows the official IRSA spectral-image/cutout tutorials.
These tests establish geometric and metadata behavior, not real-source recovery.
"""

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import numpy as np

from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

from app.interfaces import ObservationInput, ProcessingOptions
from app.processing.alignment import auto_grid_size, output_wcs, reproject_observation, reproject_quality, shared_limits, write_png, write_prepared_raster
from app.processing.errors import ProcessingCancelled, ProcessingError
from app.processing.fits_reader import BAD_FLAG_NAMES, read_observation, classify_pixels
from app.processing.service import AstronomyProcessor
from app.processing.spectral import select_compatible_frames


SIZE = 33
RA = 120.0
DEC = 20.0
SCALE_DEG = 6.0 / 3600.0


def test_warning_policy_never_accepts_bad_unknown_or_nonfinite_samples():
    flags = np.array([0, 1 << 19, 1 << 1, (1 << 19) | (1 << 10), 1 << 31, 1 << 21, 1 << 19, 0], dtype=np.uint32)
    values = np.ones(8); values[6] = np.nan
    variance = np.ones(8); variance[7] = 0
    definitions = {bit: name for name, bit in FLAG_BITS.items()}
    assert classify_pixels(values, variance, flags, definitions).tolist() == [1, 2, 2, 0, 0, 1, 0, 0]


def test_quality_reprojection_preserves_strict_values_and_transport_states(tmp_path):
    source = make_observation(tmp_path, 0)
    with fits.open(source.fits_path, mode='update') as h:
        h['FLAGS'].data[10, 10] = 1 << FLAG_BITS['OUTLIER']
        h['IMAGE'].data[10, 10] = 1e6
        h['FLAGS'].data[20, 20] = 1 << FLAG_BITS['HOT']
    loaded = read_observation(source, RA, DEC)
    grid = output_wcs(options(), SIZE)
    strict, valid = reproject_observation(loaded, grid, SIZE)
    image, quality = reproject_quality(loaded, grid, SIZE)
    assert np.array_equal(quality == 1, valid)
    assert np.array_equal(image[valid], strict[valid])
    assert quality[10, 10] == 2 and quality[20, 20] == 0
    result = write_prepared_raster(tmp_path/'quality.bin', image, valid, quality=quality)
    raw = (tmp_path/'quality.bin').read_bytes()
    assert result['encoding'] == 'float32-le-quality8-v2'
    assert len(raw) == SIZE*SIZE*5
    restored = np.flipud(np.frombuffer(raw, np.uint8, offset=SIZE*SIZE*4).reshape(SIZE, SIZE))
    assert np.array_equal(restored, quality)

# Verified bit positions from the public IRSA Spectrophotometry Tool guide.
# SOURCE and FULLSAMPLE describe pixels; they do not mean bad science pixels.
FLAG_BITS = {
    "TRANSIENT": 0, "OVERFLOW": 1, "SUR_ERROR": 2, "NONFUNC": 6,
    "DICHROIC": 7, "MISSING_DATA": 9, "HOT": 10, "COLD": 11,
    "FULLSAMPLE": 12, "PHANMISS": 14, "NONLINEAR": 15, "PERSIST": 17,
    "OUTLIER": 19, "CROSSTALK": 20, "SOURCE": 21, "GHOST": 22,
    "GHOST_FPA": 23, "GHOST_EXT": 24, "STREAK": 25, "BLOOM": 26,
    "SNOWBALL": 27, "HALO": 28, "SATELLITE_HALO": 29,
}


def _spatial_wcs(shift=(0.0, 0.0)):
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.cunit = ["deg", "deg"]
    wcs.wcs.radesys = "ICRS"
    wcs.wcs.crval = [RA, DEC]
    wcs.wcs.crpix = [17.0 + shift[0], 17.0 + shift[1]]
    wcs.wcs.cdelt = [-SCALE_DEG, SCALE_DEG]
    return wcs


def _spectral_table(header, wavelength_um, bandwidth_um, gradient_um=0.0):
    for axis in (1, 2):
        header[f"CRPIX{axis}W"] = 1
        header[f"CRVAL{axis}W"] = 1
        header[f"CDELT{axis}W"] = 1
        header[f"CUNIT{axis}W"] = "um"
        header[f"CTYPE{axis}W"] = "WAVE-TAB"
        header[f"PV{axis}_3W"] = axis
        header[f"PS{axis}_0W"] = "WCS-WAVE"
        header[f"PS{axis}_1W"] = "VALUES"
    header["WCSAXESW"] = 2
    header["WCSNAMEW"] = "Synthetic wavelength and bandwidth lookup"
    header["CNAME1W"] = "Wavelength"
    header["CNAME2W"] = "Bandpass"
    header["PS1_2W"] = "X"
    header["PS2_2W"] = "Y"
    values = np.zeros((2, 2, 2), dtype=np.float32)
    values[:, 0, 0] = wavelength_um - gradient_um
    values[:, 1, 0] = wavelength_um + gradient_um
    values[:, :, 1] = bandwidth_um
    return fits.BinTableHDU.from_columns([
        fits.Column(name="X", format="2J", dim="(2)", array=np.array([[1, SIZE]], dtype=np.int32)),
        fits.Column(name="Y", format="2J", dim="(2)", array=np.array([[1, SIZE]], dtype=np.int32)),
        fits.Column(name="VALUES", format="8E", dim="(2,2,2)", array=np.array([values])),
    ], name="WCS-WAVE")


def make_observation(
    tmp_path,
    index,
    *,
    shift=(0.0, 0.0),
    wavelength_um=1.0,
    bandwidth_um=0.04,
    gradient_um=0.0,
    defects=False,
    include_spectral=True,
):
    """Write an explicitly synthetic input with a fixed star in world space."""
    spatial_wcs = _spatial_wcs(shift)
    header = spatial_wcs.to_header()
    header["BUNIT"] = "MJy / sr"
    header["DETECTOR"] = 1
    header["OBSID"] = f"synthetic-test-{index}"
    start = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=index * 30)
    end = start + timedelta(seconds=100)
    header["DATE-BEG"] = start.isoformat().replace("+00:00", "")
    header["DATE-END"] = end.isoformat().replace("+00:00", "")
    header["TIMESYS"] = "UTC"
    spectral = _spectral_table(header, wavelength_um, bandwidth_um, gradient_um)
    if not include_spectral:
        for key in list(header):
            if key.endswith("W"):
                del header[key]
    y, x = np.indices((SIZE, SIZE), dtype=float)
    # The same celestial source lands on different detector pixels when CRPIX shifts.
    star_x, star_y = 12.0 + shift[0], 22.0 + shift[1]
    science = (5.0 + 100.0 * np.exp(-((x - star_x) ** 2 + (y - star_y) ** 2) / 2.0)).astype(np.float32)
    variance = np.ones((SIZE, SIZE), dtype=np.float32)
    flags = np.zeros((SIZE, SIZE), dtype=np.int32)
    flags[int(star_y), int(star_x)] = 1 << FLAG_BITS["SOURCE"]
    flags[4, 4] = 1 << FLAG_BITS["FULLSAMPLE"]
    if defects:
        flags[9, 8] = 1 << FLAG_BITS["TRANSIENT"]
        science[6, 6] = np.nan
        variance[7, 7] = 0.0
        variance[8, 7] = -1.0
        variance[9, 7] = np.nan
    flags_hdu = fits.ImageHDU(flags, name="FLAGS")
    for name, bit in FLAG_BITS.items():
        flags_hdu.header[f"MSKN{bit:04d}"] = name
        flags_hdu.header[f"MSKD{bit:04d}"] = f"Synthetic test definition of {name}"
    primary = fits.PrimaryHDU()
    primary.header["ORIGIN"] = "Khonsu deterministic synthetic test"
    primary.header["VERSION"] = "synthetic-test-1"
    hdus = [primary, fits.ImageHDU(science, header=header, name="IMAGE"),
            flags_hdu, fits.ImageHDU(variance, name="VARIANCE")]
    if include_spectral:
        hdus.append(spectral)
    path = Path(tmp_path) / f"synthetic-{index}.fits"
    fits.HDUList(hdus).writeto(path, overwrite=True, checksum=True)
    return ObservationInput(
        fits_path=path,
        observation_id=f"synthetic-test-{index}",
        observed_start_utc=start,
        observed_end_utc=end,
        detector=1,
        release="DR1",
        source_fits_url=f"https://example.com/khonsu-synthetic-test-{index}.fits",
    )


def options(sequence_id="synthetic-processing-control"):
    return ProcessingOptions(
        sequence_id=sequence_id, ra_deg=RA, dec_deg=DEC,
        fov_arcmin=3.3, output_size_px=SIZE,
    )


def test_live_processor_writes_separate_estimates_without_changing_validity(tmp_path):
    inputs = [make_observation(tmp_path, i, defects=True) for i in range(2)]
    output = tmp_path / 'processed'
    manifest = AstronomyProcessor().process(inputs, options(), output)
    assert manifest.processing['gap_fill_method'] == 'bounded-gap-harmonic-v2'
    for frame in manifest.frames:
        assert frame.gap_fill and 0 < frame.estimated_fraction <= frame.masked_fraction
        original = (output / (frame.frame_id + '.bin')).read_bytes()
        fill = (output / (frame.frame_id + '-fill.bin')).read_bytes()
        valid = np.frombuffer(original, np.uint8, offset=SIZE*SIZE*4) == 1
        estimated = np.frombuffer(fill, np.uint8, offset=SIZE*SIZE*4) == 1
        assert not (valid & estimated).any()
        with fits.open(output / (frame.frame_id + '.fits')) as data:
            np.testing.assert_array_equal(valid.reshape(SIZE, SIZE), np.flipud(data['VALID'].data > 0))
        assert frame.gap_fill.encoding == 'float32-le-estimate8-v1'


def test_flags_mask_defects_but_keep_source_and_fullsample(tmp_path):
    loaded = read_observation(make_observation(tmp_path, 0, defects=True), RA, DEC)
    assert "TRANSIENT" in BAD_FLAG_NAMES
    assert "SOURCE" not in BAD_FLAG_NAMES
    assert "FULLSAMPLE" not in BAD_FLAG_NAMES
    assert loaded.valid[22, 12]
    assert loaded.valid[4, 4]
    for y, x in [(9, 8), (6, 6), (7, 7), (8, 7), (9, 7)]:
        assert not loaded.valid[y, x]
    assert loaded.science.shape == loaded.variance.shape == loaded.valid.shape == (SIZE, SIZE)


def test_wavelength_comes_from_target_pixel_lookup_not_detector_average(tmp_path):
    observation = make_observation(tmp_path, 0, gradient_um=0.02)
    target = _spatial_wcs().pixel_to_world(8.0, 16.0)
    loaded = read_observation(observation, float(target.ra.deg), float(target.dec.deg))
    # FITS X=9 is one quarter of the way from X=1 to X=33.
    assert loaded.wavelength_um == pytest.approx(0.99, abs=2e-6)
    assert loaded.bandwidth_um == pytest.approx(0.04, abs=2e-6)


def test_missing_wcs_wave_is_not_replaced_with_fabricated_wavelength(tmp_path):
    observation = make_observation(tmp_path, 0, include_spectral=False)
    with pytest.raises(ProcessingError) as error:
        read_observation(observation, RA, DEC)
    assert error.value.code == "MISSING_SPECTRAL_METADATA"


def test_spectral_group_does_not_chain_into_incompatible_endpoints(tmp_path):
    frames = [read_observation(make_observation(tmp_path, i, wavelength_um=wave), RA, DEC)
              for i, wave in enumerate([1.0, 1.009, 1.018])]
    selected = select_compatible_frames(frames)
    assert len(selected) == 2
    assert max(frame.wavelength_um for frame in selected) - min(frame.wavelength_um for frame in selected) <= 0.25 * min(frame.bandwidth_um for frame in selected) + 1e-8


def test_spectral_group_preserves_detector_identity(tmp_path):
    first = read_observation(make_observation(tmp_path, 0), RA, DEC)
    second = read_observation(make_observation(tmp_path, 1, wavelength_um=1.005), RA, DEC)
    # Deliberately inconsistent synthetic metadata tests the detector guard alone.
    third = replace(second, observation=replace(second.observation, detector=2))
    selected = select_compatible_frames([first, second, third])
    assert len(selected) == 2
    assert {frame.observation.detector for frame in selected} == {1}


def test_incompatible_epochs_do_not_produce_a_temporal_manifest(tmp_path):
    observations = [make_observation(tmp_path, 0), make_observation(tmp_path, 1, wavelength_um=1.05)]
    with pytest.raises(ProcessingError) as error:
        AstronomyProcessor().process(observations, options(), tmp_path / "output")
    assert error.value.code == "INSUFFICIENT_COMPARABLE_EPOCHS"


def test_alignment_rendering_alpha_and_flip_y_are_consistent(tmp_path):
    first = make_observation(tmp_path, 0, defects=True)
    second = make_observation(tmp_path, 1, shift=(3.0, -2.0), wavelength_um=1.005)
    output = tmp_path / "output"
    manifest = AstronomyProcessor().process([second, first], options(), output)
    assert manifest.grid.raster_to_wcs == "flip-y"
    assert manifest.grid.pixel_origin == "top-left"
    assert manifest.grid.wcs_header is not None
    assert manifest.display.stretch == "asinh"
    assert manifest.display.vmin < manifest.display.vmax
    assert [frame.observation_id for frame in manifest.frames] == [first.observation_id, second.observation_id]
    assert [frame.observed_start_utc for frame in manifest.frames] == [first.observed_start_utc, second.observed_start_utc]
    assert str(manifest.frames[0].source_fits_url) == first.source_fits_url

    images = []
    for index, frame in enumerate(manifest.frames, start=1):
        expected_name = f"frame-{index:04d}.png"
        assert frame.image_url == f"/v1/sequences/{manifest.sequence_id}/frames/{expected_name}"
        with Image.open(output / expected_name) as image:
            images.append(np.asarray(image.convert("RGBA")))
    assert all(image.shape == (SIZE, SIZE, 4) for image in images)
    peaks = [np.unravel_index(np.argmax(image[:, :, 0]), image.shape[:2]) for image in images]
    assert abs(peaks[0][0] - peaks[1][0]) <= 1
    assert abs(peaks[0][1] - peaks[1][1]) <= 1

    output_wcs = WCS(fits.Header(manifest.grid.wcs_header))
    star_world = _spatial_wcs().pixel_to_world(12.0, 22.0)
    star_x, star_y = output_wcs.world_to_pixel(star_world)
    assert abs(peaks[0][1] - star_x) <= 1.1
    assert abs(peaks[0][0] - (SIZE - 1 - star_y)) <= 1.1
    bad_world = _spatial_wcs().pixel_to_world(8.0, 9.0)
    bad_x, bad_y = output_wcs.world_to_pixel(bad_world)
    assert images[0][int(round(SIZE - 1 - float(bad_y))), int(round(float(bad_x))), 3] == 0
    assert images[0][int(round(SIZE - 1 - float(star_y))), int(round(float(star_x))), 3] == 255


def test_cancelled_processing_does_not_publish_frames(tmp_path):
    observations = [make_observation(tmp_path, 0), make_observation(tmp_path, 1)]
    output = tmp_path / "cancelled-output"
    with pytest.raises(ProcessingCancelled) as error:
        AstronomyProcessor().process(observations, options(), output, cancelled=lambda: True)
    assert error.value.code == "PROCESSING_CANCELLED"
    assert not list(output.glob("*.png"))


def test_masked_pixels_keep_their_true_size_and_position(tmp_path):
    # A 0.3 px offset puts every output centre between four input pixels, so
    # plain bilinear interpolation over NaN would spread each masked pixel into
    # its neighbours. Nearest-pixel mapping is one-to-one at this offset.
    loaded = read_observation(make_observation(tmp_path, 0, shift=(0.3, 0.3), defects=True), RA, DEC)
    image, valid = reproject_observation(loaded, output_wcs(options(), SIZE), SIZE)
    interior = np.zeros_like(valid)
    interior[2:-2, 2:-2] = True
    masked = {(int(y), int(x)) for y, x in zip(*np.nonzero(~valid & interior))}
    assert masked == {(9, 8), (6, 6), (7, 7), (8, 7), (9, 7)}
    assert np.all(np.isfinite(image[valid]))
    assert np.all(np.isnan(image[~valid]))
    # Neighbours of a masked pixel average valid inputs only: flat sky stays flat.
    assert image[6, 5] == pytest.approx(5.0, abs=1e-4)
    assert image[8, 8] == pytest.approx(5.0, abs=1e-4)


def test_default_grid_samples_twice_the_native_pixel_scale(tmp_path):
    first = make_observation(tmp_path, 0)
    second = make_observation(tmp_path, 1, wavelength_um=1.005)
    automatic = replace(options(), output_size_px=None)
    manifest = AstronomyProcessor().process([first, second], automatic, tmp_path / "output")
    # 3.3 arcmin field, 6 arcsec synthetic pixels: 198 * 2 / 6 = 66 grid pixels.
    assert manifest.grid.width_px == manifest.grid.height_px == 66
    assert manifest.processing["native_pixel_scale_arcsec"] == pytest.approx(6.0)
    assert manifest.processing["grid_scale_arcsec"] == pytest.approx(3.0)
    with Image.open(tmp_path / "output" / "frame-0001.png") as image:
        assert image.size == (66, 66)
    assert auto_grid_size(60.0, 6.15) == 1171
    assert auto_grid_size(120.0, 6.15) == 2048
    assert 120 * 60 / auto_grid_size(120, 6.15) <= 6.15
    assert auto_grid_size(0.5, 6.15) == 32
    assert auto_grid_size(6.0, 6.145) == 118


def test_stretch_keeps_empty_sky_dark_and_is_shared_across_frames(tmp_path):
    # Explicitly synthetic arrays: Gaussian sky noise plus one bright point.
    rng = np.random.default_rng(12)
    frames = []
    for index in range(2):
        image = (10.0 + rng.normal(0.0, 1.0, (64, 64))).astype(np.float32)
        image[20 + index, 30] = 200.0
        frames.append((None, image, np.ones((64, 64), dtype=bool)))
    low, high = shared_limits(frames)
    assert shared_limits(list(reversed(frames))) == (low, high)
    assert low == pytest.approx(8.0, abs=0.2)
    assert high >= 10.0 + 50.0 * 0.9
    write_png(tmp_path / "frame.png", frames[0][1], frames[0][2], low, high)
    with Image.open(tmp_path / "frame.png") as png:
        gray = np.asarray(png.convert("RGBA"))[:, :, 0]
    assert np.median(gray) < 64
    assert gray[63 - 20, 30] == 255

    # A starless field is not stretched until its noise fills the gray range.
    noise = [(None, (10.0 + rng.normal(0.0, 1.0, (64, 64))).astype(np.float32), np.ones((64, 64), dtype=bool))]
    low, high = shared_limits(noise)
    write_png(tmp_path / "noise.png", noise[0][1], noise[0][2], low, high)
    with Image.open(tmp_path / "noise.png") as png:
        assert np.asarray(png.convert("RGBA"))[:, :, 0].max() < 160
