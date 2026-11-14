"""Dependency-free checks: python -m unittest discover -s apps/api/tests -p test_static.py."""

import json
from pathlib import Path
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]


class StaticFoundationChecks(unittest.TestCase):
    def test_fixture_sources_are_explicitly_synthetic(self):
        manifest = json.loads((ROOT / "fixtures/synthetic/sequence-manifest.json").read_text())
        self.assertEqual(manifest["data_mode"], "synthetic")
        self.assertIn("not nasa", manifest["disclosure"].lower())
        self.assertEqual(len({frame["frame_id"] for frame in manifest["frames"]}), 3)
        for frame in manifest["frames"]:
            self.assertIsNone(frame["source_fits_url"])
            self.assertIsNone(frame["observed_start_utc"])
            self.assertIsNone(frame["wavelength_um"])
            self.assertTrue(frame["image_url"].startswith("/v1/demo/frames/"))
            image = ROOT / "fixtures/synthetic" / frame["image_url"].rsplit("/", 1)[-1]
            parsed = ET.parse(image).getroot()
            self.assertEqual(int(parsed.attrib["width"]), manifest["grid"]["width_px"])
            self.assertEqual(int(parsed.attrib["height"]), manifest["grid"]["height_px"])
            self.assertIn("SYNTHETIC ONLY", "".join(parsed.itertext()))

    def test_contract_has_no_broken_internal_schema_references(self):
        contract = json.loads((ROOT / "contracts/openapi.json").read_text())
        schemas = contract["components"]["schemas"]
        self.assertTrue({"SequenceRequest", "SequenceManifest", "PresetTarget", "ApiError"} <= set(schemas))

        def walk(value):
            if isinstance(value, dict):
                reference = value.get("$ref")
                if reference:
                    self.assertTrue(reference.startswith("#/components/schemas/"))
                    self.assertIn(reference.rsplit("/", 1)[-1], schemas)
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)

        walk(contract)

    def test_generated_types_match_the_selected_contract_snapshot(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/export-contracts.py"), "--from-snapshot", "--check"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
