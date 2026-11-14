"""Synthetic integration controls for the opt-in five-target probe.

No data in these tests is an astronomical observation or redistribution asset.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.interfaces import ObservationInput
from app.processing.errors import ProcessingError
from app.schemas import SequenceManifest


def load_probe():
    path = Path(__file__).resolve().parents[3] / "scripts" / "probe-spherex.py"
    spec = importlib.util.spec_from_file_location("probe_acceptance_control", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("failure_stage", ["metadata", "retrieve"])
def test_probe_attempts_all_targets_after_success_and_distinguishes_failures(tmp_path, monkeypatch, failure_stage):
    probe = load_probe()
    calls = []
    now = datetime(2025, 1, 1, tzinfo=timezone.utc)

    class FakeRetriever:
        def __init__(self, **kwargs):
            pass

        async def search(self, request):
            calls.append(("search", request.ra_deg))
            if request.ra_deg == 331.0986113344776 and failure_stage == "metadata":
                raise probe.RetrievalError("archive_unavailable", "Synthetic metadata failure control")
            return [SimpleNamespace(detector=1, release="DR1", observed_start_utc=now),
                    SimpleNamespace(detector=1, release="DR1", observed_start_utc=now + timedelta(days=1))]

        async def retrieve(self, request, directory):
            calls.append(("retrieve", request.ra_deg))
            if request.ra_deg == 331.0986113344776:
                raise probe.RetrievalError("archive_unavailable", "Synthetic upstream failure control")
            result = []
            for i in range(3 if request.ra_deg == 269.44626850265985 else 2):
                path = directory / f"synthetic-{i}.fits"
                path.write_bytes(b"Synthetic test fixture, not NASA data")
                instant = now + timedelta(days=i)
                result.append(ObservationInput(path, f"synthetic-control-{i}", instant, instant,
                                              1, "DR1", f"https://example.org/synthetic-{i}.fits"))
            return result

    class FakeProcessor:
        def process(self, observations, options, output, **kwargs):
            if options.ra_deg == 133.7601213914074:
                raise ProcessingError("INSUFFICIENT_COMPARABLE_EPOCHS", "Synthetic spectral mismatch control")
            output.mkdir(parents=True, exist_ok=True)
            return SequenceManifest.model_validate({
                "sequence_id": options.sequence_id, "data_mode": "live",
                "title": "Synthetic test control only", "disclosure": "Synthetic fixture; not NASA data",
                "target": {"ra_deg": options.ra_deg, "dec_deg": options.dec_deg},
                "requested_fov_arcmin": 6,
                "grid": {"width_px": 32, "height_px": 32, "raster_to_wcs": "flip-y",
                         "wcs_header": {"WCSAXES": 2, "CRPIX1": 16.5, "CRPIX2": 16.5,
                                        "CRVAL1": options.ra_deg, "CRVAL2": options.dec_deg,
                                        "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN",
                                        "CDELT1": -0.003125, "CDELT2": 0.003125}},
                "display": {"stretch": "asinh", "vmin": 0, "vmax": 1},
                "frames": [{"frame_id": f"synthetic-{i}", "label": "Synthetic control",
                            "image_url": f"/synthetic-{i}.png", "observed_start_utc": obs.observed_start_utc,
                            "observed_end_utc": obs.observed_end_utc, "wavelength_um": 1.0,
                            "bandwidth_um": 0.1, "detector": 1, "release": "DR1",
                            "observation_id": obs.observation_id, "source_fits_url": obs.source_fits_url,
                            "warnings": ([{"code": "TARGET_MASKED", "message": "Synthetic masked-target control"}]
                                         if options.ra_deg == 269.44626850265985 else [])}
                           for i, obs in enumerate(observations)],
            })

    monkeypatch.setattr(probe, "IrsaRetriever", FakeRetriever)
    monkeypatch.setattr("app.processing.service.AstronomyProcessor", FakeProcessor)
    args = SimpleNamespace(max_seconds=100, target_max_seconds=20, max_frames=16,
                           fov_arcmin=6, output_size=None, metadata_only=False,
                           output=tmp_path / "assets", report=tmp_path / "report.json")
    assert asyncio.run(probe.run(args)) == 0
    report = json.loads(args.report.read_text())
    assert len([kind for kind, _ in calls if kind == "search"]) == 5
    assert len([kind for kind, _ in calls if kind == "retrieve"]) == (4 if failure_stage == "metadata" else 5)
    outcomes = {row["preset_id"]: row["status"] for row in report["targets"]}
    assert outcomes == {"barnards-star": "success", "epsilon-indi-b": "failure",
                        "wise-0855": "insufficient_coverage", "r-draconis": "success", "rw-aurigae": "success"}
    assert report["metadata_is_detection"] is False
    assert report["primary_preset_id"] == "r-draconis"
    assert report["backup_preset_id"] == "rw-aurigae"
    for row in report["targets"]:
        assert row["query"]["coordinate_frame"] == "ICRS"
        if row["status"] == "success":
            assert len(row["downloaded_sources"]) == row["usable_frame_count"]
            assert all(len(source["sha256"]) == 64 for source in row["downloaded_sources"])
            assert row["manifest"]["data_mode"] == "cached-real"
