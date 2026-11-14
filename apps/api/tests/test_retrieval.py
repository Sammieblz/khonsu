"""Offline retrieval security, protocol and bounded-download checks."""

import asyncio
from datetime import datetime, timezone
import io
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from app.retrieval.presets import PRESETS, preset_position
from app.retrieval.service import (
    IrsaRetriever, MAX_METADATA_ROWS, ObservationMetadata, RetrievalError,
    cutout_url, parse_metadata, query_url, select_observations, validate_irsa_url,
)

SOURCE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_2025W18_1B_0074_2D1_spx_l2b-v27-2026-196.fits"
HEADER = "obs_id,t_min,t_max,energy_bandpassname,access_url\n"


def request(**changes):
    values = dict(ra_deg=269., dec_deg=4., fov_arcmin=6., max_frames=8, detector=None,
                  start_utc=None, end_utc=None, wavelength_min_um=None, wavelength_max_um=None)
    return SimpleNamespace(**(values | changes))


class Response(io.BytesIO):
    def __init__(self, content, url, length=None):
        super().__init__(content)
        self.url = url
        self.headers = {} if length is None else {"Content-Length": str(length)}

    def geturl(self):
        return self.url


class RetrievalTests(unittest.TestCase):
    def test_query_uses_documented_collections_mjd_and_metres(self):
        value = request(start_utc=datetime(2025, 1, 1, tzinfo=timezone.utc), wavelength_min_um=1., wavelength_max_um=2.)
        params = parse_qs(urlsplit(query_url(value)).query)
        self.assertEqual(params["COLLECTION"], ["spherex_dr1", "spherex_qr3"])
        self.assertEqual(params["RESPONSEFORMAT"], ["CSV"])
        self.assertEqual(params["TIME"], ["60676.0 +Inf"])
        self.assertEqual(params["BAND"], ["1e-06 2e-06"])
        self.assertEqual(params["MAXREC"], [str(MAX_METADATA_ROWS + 1)])

    def test_nonfinite_or_out_of_range_targets_rejected(self):
        for value in (request(ra_deg=float("nan")), request(fov_arcmin=100), request(max_frames=1)):
            with self.assertRaises(RetrievalError):
                query_url(value)

    def test_metadata_times_are_exposure_mjd_and_deduplicated(self):
        row = f"obs1,60800,60800.0001,SPHEREx-D1,{SOURCE}\n"
        rows = parse_metadata((HEADER + row + row).encode(), request())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].release, "DR1")
        self.assertEqual(rows[0].observed_start_utc.isoformat(), "2025-05-06T00:00:00+00:00")
        self.assertEqual(parse_metadata((HEADER + row).encode(), request(detector=2)), [])

    def test_invalid_or_overflow_metadata_is_not_empty_coverage(self):
        for data in (b"<html>Unavailable</html>", (HEADER + f"obs1,nan,60800,SPHEREx-D1,{SOURCE}\n").encode()):
            with self.assertRaises(RetrievalError):
                parse_metadata(data, request())
        with patch("app.retrieval.service.MAX_METADATA_ROWS", 1):
            row = f"obs1,60800,60800.001,SPHEREx-D1,{SOURCE}\n"
            with self.assertRaisesRegex(RetrievalError, "Narrow the date"):
                parse_metadata((HEADER + row + row).encode(), request())

    def test_only_approved_irsa_sources_and_redirect_targets(self):
        self.assertEqual(validate_irsa_url(SOURCE), SOURCE)
        for url in (SOURCE.replace("https:", "http:"), SOURCE.replace("irsa.ipac.caltech.edu", "evil.test"),
                    SOURCE.replace("https://", "https://user@"), SOURCE.replace("/level2/", "/level2/../"),
                    "https://irsa.ipac.caltech.edu/private.fits", SOURCE + "#fragment"):
            with self.assertRaises(RetrievalError):
                validate_irsa_url(url)

    def test_cutout_has_full_field_width_and_cannot_be_overridden(self):
        url = cutout_url(SOURCE + "?size=300&center=0,0", request())
        params = parse_qs(urlsplit(url).query)
        self.assertEqual(params["size"], ["0.1000000000"])
        self.assertEqual(params["center"], ["269.0000000000,4.0000000000"])

    def test_frame_selection_preserves_order_span_and_one_detector(self):
        t = datetime(2025, 1, 1, tzinfo=timezone.utc)
        from datetime import timedelta
        rows = [ObservationMetadata(str(i), t+timedelta(days=i), t+timedelta(days=i), 1 if i < 10 else 2, "DR1", SOURCE) for i in range(14)]
        selected = select_observations(rows, 3)
        self.assertEqual([row.observation_id for row in selected], ["0", "4", "9"])
        self.assertEqual({row.detector for row in selected}, {1})

    def test_download_rejects_large_and_nonfits_responses_and_removes_partial(self):
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + 10
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "input.fits.part"
            for content, length, limit in ((b"not FITS", None, 30), (b"SIMPLE  =" + b" "*30, 39, 20)):
                with patch.object(retriever._opener, "open", return_value=Response(content, SOURCE, length)):
                    with self.assertRaises(RetrievalError):
                        retriever._read(SOURCE, limit, path)
                self.assertFalse(path.exists())

    def test_cancelled_callback_prevents_network_access(self):
        retriever = IrsaRetriever(cancelled=lambda: True)
        with self.assertRaisesRegex(RetrievalError, "cancelled"):
            asyncio.run(retriever.search(request()))

    def test_all_five_presets_are_cited_and_motion_is_applied(self):
        self.assertEqual(len(PRESETS), 5)
        before = preset_position("barnards-star", 2000)
        after = preset_position("barnards-star", 2026)
        self.assertAlmostEqual((after[1]-before[1])*3600, 269.422244, places=5)
        self.assertLess(after[0], before[0])
        for preset in PRESETS.values():
            self.assertTrue(preset["source_url"].startswith("https://"))
            self.assertTrue(0 <= preset["ra_deg"] < 360 and -90 <= preset["dec_deg"] <= 90)


if __name__ == "__main__":
    unittest.main()
