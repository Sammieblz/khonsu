"""Bounded local FITS processing for an honest SPHEREx temporal comparison.

No network requests, coadds, interpolated celestial epochs, source detection,
photometric error bars, background subtraction or PSF matching happen here.
"""

from collections import Counter
from importlib import metadata as package_metadata
import importlib.util
import json
import math
from pathlib import Path
import re
import statistics
from typing import Callable

from ..interfaces import ObservationInput, ProcessingOptions
from ..schemas import DisplaySettings, Frame, ImageGrid, QualityWarning, SequenceManifest, SkyTarget
from .errors import ProcessingCancelled, ProcessingError

PIPELINE_VERSION = "khonsu-display-0.3.0"
MAX_OBSERVATIONS = 96
MAX_OUTPUT_PIXELS_TOTAL = 96 * 512 * 512


def _check_cancelled(cancelled):
    if cancelled is not None and cancelled():
        raise ProcessingCancelled()


def _validate_options(options, observations, lower, upper):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", options.sequence_id):
        raise ProcessingError("INVALID_PROCESSING_OPTIONS", "Sequence identifier is invalid.")
    if options.coordinate_frame != "ICRS" or not (math.isfinite(options.ra_deg) and 0 <= options.ra_deg < 360 and math.isfinite(options.dec_deg) and -90 <= options.dec_deg <= 90):
        raise ProcessingError("INVALID_PROCESSING_OPTIONS", "Target coordinates must be finite ICRS degrees.")
    if not math.isfinite(options.fov_arcmin) or not 0.5 <= options.fov_arcmin <= 60:
        raise ProcessingError("INVALID_PROCESSING_OPTIONS", "Field of view must be between 0.5 and 60 arcminutes.")
    if options.output_size_px is not None and (not isinstance(options.output_size_px, int) or not 32 <= options.output_size_px <= 1024):
        raise ProcessingError("RESOURCE_LIMIT", "Output width must be between 32 and 1024 pixels.")
    if len(observations) > MAX_OBSERVATIONS:
        raise ProcessingError("RESOURCE_LIMIT", "At most 96 observations can be processed in one job.")
    if any(value is not None and (not math.isfinite(value) or not 0.75 <= value <= 5.0) for value in (lower, upper)):
        raise ProcessingError("INVALID_PROCESSING_OPTIONS", "Wavelength filters must be between 0.75 and 5 micrometers.")
    if lower is not None and upper is not None and lower > upper:
        raise ProcessingError("INVALID_PROCESSING_OPTIONS", "Minimum wavelength exceeds maximum wavelength.")


def _atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


class AstronomyProcessor:
    @staticmethod
    def available() -> bool:
        return all(importlib.util.find_spec(name) is not None for name in ("numpy", "astropy", "reproject", "PIL"))

    def process(
        self,
        observations: list[ObservationInput],
        options: ProcessingOptions,
        output_dir: Path,
        *,
        cancelled: Callable[[], bool] | None = None,
        wavelength_min_um: float | None = None,
        wavelength_max_um: float | None = None,
    ) -> SequenceManifest:
        _check_cancelled(cancelled)
        _validate_options(options, observations, wavelength_min_um, wavelength_max_um)
        try:
            from .alignment import (
                ASINH_A, GRID_OVERSAMPLE, MIN_GRID_PX, STRETCH_HIGH_PERCENTILE, STRETCH_MIN_SPAN_SIGMA,
                STRETCH_SKY_SIGMA_BELOW, auto_grid_size, native_pixel_scale_arcsec, output_wcs,
                reproject_observation, shared_limits, write_calibrated_grid, write_png,
            )
            from .fits_reader import inspect_observation, read_observation
            from .spectral import MAX_CENTER_SPREAD_IN_BANDWIDTHS, select_compatible_frames
        except ModuleNotFoundError as exc:
            raise ProcessingError("SCIENCE_DEPENDENCIES_MISSING", "Install requirements-science.txt to process FITS observations.") from exc

        candidates = []
        skipped = Counter()
        seen = set()
        for observation in observations:
            _check_cancelled(cancelled)
            identity = (observation.observation_id, observation.detector)
            if identity in seen:
                skipped["DUPLICATE_OBSERVATION"] += 1
                continue
            seen.add(identity)
            try:
                item = inspect_observation(observation, options.ra_deg, options.dec_deg)
                if wavelength_min_um is not None and item.wavelength_um < wavelength_min_um:
                    skipped["WAVELENGTH_FILTER"] += 1
                    continue
                if wavelength_max_um is not None and item.wavelength_um > wavelength_max_um:
                    skipped["WAVELENGTH_FILTER"] += 1
                    continue
                candidates.append(item)
            except ProcessingError as exc:
                skipped[exc.code] += 1

        native_scale = None
        if candidates:
            native_scale = statistics.median(native_pixel_scale_arcsec(item.spatial_wcs) for item in candidates)
        if options.output_size_px is not None:
            size = options.output_size_px
        elif native_scale is not None:
            size = auto_grid_size(options.fov_arcmin, native_scale)
        else:
            size = MIN_GRID_PX  # No usable input; the epoch check below reports why.
        wcs = output_wcs(options, size)
        projected = []
        while candidates:
            selected = select_compatible_frames(candidates)
            if len({item.observation.observed_start_utc for item in selected}) < 2:
                break
            if len(selected) * size ** 2 > MAX_OUTPUT_PIXELS_TOTAL:
                raise ProcessingError("RESOURCE_LIMIT", "The requested image sequence exceeds the output pixel budget.")
            projected = []
            failed = set()
            for item in selected:
                _check_cancelled(cancelled)
                try:
                    loaded = read_observation(item.observation, options.ra_deg, options.dec_deg)
                    image, valid = reproject_observation(loaded, wcs, size)
                    item.warnings = list(loaded.warnings)
                    projected.append((item, image, valid))
                    del loaded
                except ProcessingError as exc:
                    failed.add((item.observation.observation_id, item.observation.detector))
                    skipped[exc.code] += 1
            if len({item.observation.observed_start_utc for item, _, _ in projected}) >= 2:
                break
            if not failed:
                break
            candidates = [item for item in candidates if (item.observation.observation_id, item.observation.detector) not in failed]

        if len({item.observation.observed_start_utc for item, _, _ in projected}) < 2:
            reasons = ", ".join(f"{code}: {count}" for code, count in sorted(skipped.items()))
            suffix = f" Excluded inputs: {reasons}." if reasons else ""
            raise ProcessingError(
                "INSUFFICIENT_COMPARABLE_EPOCHS",
                "Fewer than two usable, spectrally comparable observation epochs cover this field." + suffix,
            )

        projected.sort(key=lambda row: (row[0].observation.observed_start_utc, row[0].observation.observation_id))
        low, high = shared_limits(projected)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        header = dict(wcs.to_header(relax=True).items())
        frame_models = []
        wavelengths = [item.wavelength_um for item, _, _ in projected]
        smallest_width = min(item.bandwidth_um for item, _, _ in projected)
        policies = {
            "pipeline_version": PIPELINE_VERSION,
            "science_unit": "MJy/sr",
            "reprojection": "validity-weighted bilinear over valid pixels only, common ICRS TAN grid",
            "mask_interpolation": "nearest-neighbor: an output pixel is valid only when its nearest input pixel is valid and inside coverage",
            "grid_width_px": size,
            "grid_scale_arcsec": options.fov_arcmin * 60.0 / size,
            "grid_oversample_target": GRID_OVERSAMPLE,
            "flags_policy": "IRSA SDT bad flags plus OUTLIER/PHANMISS; SOURCE/FULLSAMPLE retained; unknown excluded",
            "wavelength_policy": "same detector; target center spread <= 0.25 * smallest bandwidth",
            "wavelength_lookup": "WCS-WAVE alternate WCS W; display approximation, not calibrated spectroscopy",
            "target_wavelength_min_um": min(wavelengths),
            "target_wavelength_max_um": max(wavelengths),
            "maximum_center_spread_um": MAX_CENTER_SPREAD_IN_BANDWIDTHS * smallest_width,
            "native_pixel_scale_arcsec": native_scale,
            "asinh_a": ASINH_A,
            "stretch_reference": "sky median and robust sigma (1.4826 * MAD) of valid pixels across all frames",
            "stretch_low_sigma_below_sky": STRETCH_SKY_SIGMA_BELOW,
            "stretch_high_percentile": STRETCH_HIGH_PERCENTILE,
            "stretch_min_span_sigma": STRETCH_MIN_SPAN_SIGMA,
            "background_subtracted": False,
            "zodiacal_light_subtracted": False,
            "psf_matched": False,
            "variance_policy": "input variance finite and positive for validity; no output uncertainty propagation",
            "resampling_uncertainty_propagated": False,
            "input_count": len(observations),
            "selected_count": len(projected),
        }
        for package in ("numpy", "astropy", "reproject", "Pillow"):
            try:
                policies[f"version_{package.lower()}"] = package_metadata.version(package)
            except package_metadata.PackageNotFoundError:
                pass
        for index, (item, image, valid) in enumerate(projected, start=1):
            _check_cancelled(cancelled)
            stem = f"frame-{index:04d}"
            write_png(output_dir / f"{stem}.png", image, valid, low, high)
            write_calibrated_grid(output_dir / f"{stem}.fits", image, valid, wcs)
            source = item.observation
            frame_models.append(Frame(
                frame_id=stem,
                label=source.observed_start_utc.isoformat(),
                image_url=f"/v1/sequences/{options.sequence_id}/frames/{stem}.png",
                observed_start_utc=source.observed_start_utc,
                observed_end_utc=source.observed_end_utc,
                wavelength_um=item.wavelength_um,
                bandwidth_um=item.bandwidth_um,
                detector=source.detector,
                release=source.release,
                observation_id=source.observation_id,
                source_fits_url=source.source_fits_url,
                masked_fraction=float(1.0 - valid.mean()),
                warnings=item.warnings,
            ))
        warnings = [
            QualityWarning(code="DISPLAY_COMPARISON_ONLY", message="Common WCS and stretch support visual inspection. PSFs and backgrounds are not matched; apparent change is not a confirmed detection or calibrated variability measurement."),
            QualityWarning(code="TARGET_SPECTRAL_MATCH", message="Spectral matching is checked at the requested target position using approximate WCS-WAVE values. Wavelength varies across each image; other positions can have different spectral responses."),
            QualityWarning(code="VARIANCE_VALIDITY_ONLY", message="Input VARIANCE excludes invalid pixels. Resampling uncertainty and covariance are not propagated; no flux significance or photometric error bars are claimed."),
        ]
        excluded = len(observations) - len(projected)
        if excluded:
            warnings.append(QualityWarning(code="INPUTS_EXCLUDED", message=f"Selected {len(projected)} of {len(observations)} supplied observations after spectral, provenance and coverage checks. Other detector/wavelength groups were not merged."))
        manifest = SequenceManifest(
            sequence_id=options.sequence_id,
            data_mode="live",
            title="SPHEREx observation sequence",
            disclosure="Real archive observations rendered on one celestial grid. Display wavelengths are approximate; unmatched PSFs/backgrounds can resemble change. Candidate annotations require independent investigation.",
            target=SkyTarget(ra_deg=options.ra_deg, dec_deg=options.dec_deg),
            requested_fov_arcmin=options.fov_arcmin,
            grid=ImageGrid(width_px=size, height_px=size, wcs_header=header, raster_to_wcs="flip-y"),
            display=DisplaySettings(stretch="asinh", vmin=low, vmax=high),
            frames=frame_models,
            warnings=warnings,
            processing=policies,
        )
        _check_cancelled(cancelled)
        record = {
            "processing": policies,
            "skipped_reasons": dict(skipped),
            "source_processing_versions": {item.observation.observation_id: item.processing_version for item, _, _ in projected},
            "sources": [frame.model_dump(mode="json") for frame in frame_models],
        }
        _atomic_json(output_dir / "processing-record.json", record)
        _atomic_json(output_dir / "manifest.json", manifest.model_dump(mode="json"))
        return manifest
