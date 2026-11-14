"""Behavior checks for implemented foundation and explicit missing live services."""

import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.main import FIXTURES, app
from app.paths import fixture_directory
from app.schemas import SequenceManifest, SequenceRequest

client = TestClient(app)


def test_configured_fixture_path_wins_for_shallow_container_layout(tmp_path):
    configured = tmp_path / "configured-fixtures"
    assert fixture_directory(Path("/app/app/main.py"), str(configured)) == configured.resolve()


@pytest.mark.parametrize("module_parts", [("app", "main.py"), ("apps", "api", "app", "main.py")])
def test_fixture_discovery_supports_container_and_repository_layouts(tmp_path, module_parts):
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    assert fixture_directory(tmp_path.joinpath(*module_parts), None) == fixtures.resolve()


def test_health_reports_scaffold_capability():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["live_processing_available"] is False


def test_named_challenge_presets_do_not_invent_coordinates():
    response = client.get("/v1/presets")
    assert response.status_code == 200
    assert {item["preset_id"] for item in response.json()} == {
        "barnards-star", "epsilon-indi-b", "wise-0855", "rw-aurigae", "r-draconis",
    }
    assert all(item["ra_deg"] is None for item in response.json())


@pytest.mark.parametrize("overrides", [
    {"ra_deg": 360}, {"dec_deg": 91}, {"fov_arcmin": 61},
    {"max_frames": 97}, {"detector": 7}, {"unexpected": True},
    {"start_utc": "2026-11-14T10:00:00"},
    {"start_utc": "2026-11-15T00:00:00Z", "end_utc": "2026-11-14T00:00:00Z"},
    {"wavelength_min_um": 4.0, "wavelength_max_um": 1.0},
])
def test_invalid_requests_have_stable_errors(overrides):
    response = client.post("/v1/sequences", json={"ra_deg": 120, "dec_deg": -10, **overrides})
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"
    assert response.json()["details"]


def test_valid_request_is_not_misrepresented_as_a_successful_job():
    response = client.post("/v1/sequences", json={"ra_deg": 120, "dec_deg": -10})
    assert response.status_code == 501
    assert response.json()["code"] == "LIVE_PROCESSING_NOT_IMPLEMENTED"


def test_request_times_normalize_to_utc():
    request = SequenceRequest(ra_deg=120, dec_deg=-10, start_utc="2026-11-14T10:00:00-05:00")
    assert request.start_utc.isoformat() == "2026-11-14T15:00:00+00:00"


def test_synthetic_fixture_passes_contract_and_preserves_disclosure():
    payload = json.loads((FIXTURES / "synthetic" / "sequence-manifest.json").read_text())
    manifest = SequenceManifest.model_validate(payload)
    assert manifest.data_mode == "synthetic"
    assert "not nasa" in manifest.disclosure.lower()
    assert all(frame.observed_start_utc is None for frame in manifest.frames)
    assert all(frame.source_fits_url is None for frame in manifest.frames)
    response = client.get("/v1/demo/manifest")
    assert response.status_code == 200
    assert response.json()["data_mode"] == "synthetic"


def test_real_manifest_cannot_relabel_synthetic_fixture_as_nasa_data():
    payload = json.loads((FIXTURES / "synthetic" / "sequence-manifest.json").read_text())
    payload["data_mode"] = "cached-real"
    with pytest.raises(ValidationError, match="output WCS"):
        SequenceManifest.model_validate(payload)


def test_wcs_header_and_raster_transform_must_travel_together():
    payload = json.loads((FIXTURES / "synthetic" / "sequence-manifest.json").read_text())
    payload["grid"]["raster_to_wcs"] = "flip-y"
    with pytest.raises(ValidationError, match="supplied together"):
        SequenceManifest.model_validate(payload)


def test_demo_assets_are_allowlisted():
    response = client.get("/v1/demo/frames/frame-01.svg")
    assert response.status_code == 200
    assert "SYNTHETIC ONLY" in response.text
    assert client.get("/v1/demo/frames/requirements.txt").status_code == 404
    assert client.get("/v1/demo/frames/..%5C..%5Cmain.py").status_code == 404


def test_openapi_exposes_shared_models_and_stable_validation_error():
    spec = client.get("/openapi.json").json()
    assert {"SequenceRequest", "SequenceManifest", "PresetTarget", "ApiError"} <= set(
        spec["components"]["schemas"]
    )
    responses = spec["paths"]["/v1/sequences"]["post"]["responses"]
    assert responses["422"]["content"]["application/json"]["schema"]["$ref"].endswith("/ApiError")
