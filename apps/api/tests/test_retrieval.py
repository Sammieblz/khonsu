"""Offline retrieval security, protocol and bounded-download checks."""

from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import io
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from app.retrieval.presets import PRESETS, preset_position
from app.retrieval.service import (
    DOWNLOAD_CONCURRENCY, IrsaRetriever, MAX_ATTEMPTS, MAX_METADATA_ROWS, ObservationMetadata, RetrievalError,
    _ByteBudget, cutout_url, parse_metadata, query_url, select_observations, spread_order, validate_irsa_url,
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


def busy(retry_after=None, code=503):
    headers = {} if retry_after is None else {"Retry-After": retry_after}
    return HTTPError(SOURCE, code, "Server busy, retry later.", headers, None)


FITS = b"SIMPLE  =" + b" " * 30


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
        for value in (request(ra_deg=float("nan")), request(fov_arcmin=121), request(max_frames=1)):
            with self.assertRaises(RetrievalError):
                query_url(value)

    def test_metadata_times_are_exposure_mjd_and_deduplicated(self):
        row = f"obs1,60800,60800.0001,SPHEREx-D1,{SOURCE}\n"
        rows = parse_metadata((HEADER + row + row).encode(), request())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].release, "DR1")
        self.assertEqual(rows[0].observed_start_utc.isoformat(), "2025-05-05T00:00:00+00:00")
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

    def test_cutout_covers_rotated_field_corners_and_cannot_be_overridden(self):
        url = cutout_url(SOURCE + "?size=300&center=0,0", request())
        params = parse_qs(urlsplit(url).query)
        # 1.5 x the 6 arcmin field, wider than the sqrt(2) any rotation needs.
        self.assertEqual(params["size"], ["0.1500000000"])
        self.assertEqual(params["center"], ["269.0000000000,4.0000000000"])

    def test_wide_cutouts_cover_rotation_within_the_bounded_request(self):
        for fov, expected in ((40., "1.0000000000"), (50., "1.2500000000"), (60., "1.5000000000"), (120., "3.0000000000"), (.5, "0.0125000000")):
            params = parse_qs(urlsplit(cutout_url(SOURCE, request(fov_arcmin=fov))).query)
            self.assertEqual(params["size"], [expected], fov)

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

    def _download(self, responses, deadline=100, waits=None):
        """Run one bounded cutout download against scripted archive responses."""
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + deadline
        waits = [] if waits is None else waits
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(retriever, "_pause", side_effect=waits.append), \
                patch.object(retriever._opener, "open", side_effect=responses) as opened:
            path = Path(tmp) / "input.fits.part"
            try:
                size = retriever._read(SOURCE, 100, path)
            except RetrievalError:
                self.assertFalse(path.exists(), "A failed download must not leave a partial file")
                raise
            return size, path.read_bytes(), opened.call_count

    def test_busy_archive_is_retried_with_backoff_and_retry_after(self):
        waits = []
        size, content, calls = self._download([busy(), busy(), busy("12"), Response(FITS, SOURCE)], waits=waits)
        self.assertEqual((size, content, calls), (len(FITS), FITS, 4))
        # Backoff 1 s then 2 s; the third wait honours Retry-After over the 4 s backoff.
        self.assertEqual(waits, [1.0, 2.0, 12.0])

    def test_persistent_busy_archive_reports_a_distinct_busy_error(self):
        waits = []
        with self.assertRaises(RetrievalError) as caught:
            self._download([busy() for _ in range(MAX_ATTEMPTS)], waits=waits)
        self.assertEqual(caught.exception.code, "archive_busy")
        self.assertEqual(waits, [1.0, 2.0, 4.0, 8.0])

    def test_persistent_metadata_502_preserves_sanitized_diagnostics(self):
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + 100
        url = query_url(request())
        error = HTTPError(url, 502, "Proxy Error with private upstream internals", {}, io.BytesIO(b"private response"))
        with patch.object(retriever._opener, "open", side_effect=error) as opened, \
                patch.object(retriever, "_pause") as pause, \
                self.assertRaises(RetrievalError) as caught:
            retriever._read(url, 1024)
        self.assertEqual(opened.call_count, MAX_ATTEMPTS)
        self.assertEqual(pause.call_count, MAX_ATTEMPTS - 1)
        self.assertEqual(caught.exception.code, "archive_unavailable")
        self.assertIn("image search", caught.exception.message)
        self.assertIn("HTTP 502", caught.exception.message)
        self.assertEqual(caught.exception.details, ["Archive stage: image search", "Attempts: 5 of 5", "Upstream HTTP status: 502"])
        self.assertNotIn("private", str(caught.exception.details) + caught.exception.message)

    def test_retry_never_waits_past_the_retrieval_deadline(self):
        waits = []
        with self.assertRaises(RetrievalError) as caught:
            self._download([busy("30"), Response(FITS, SOURCE)], deadline=5, waits=waits)
        self.assertEqual(caught.exception.code, "archive_busy")
        self.assertEqual(waits, [])

    def test_non_retryable_status_fails_without_waiting(self):
        waits = []
        with self.assertRaises(RetrievalError) as caught:
            self._download([busy(code=404), Response(FITS, SOURCE)], waits=waits)
        self.assertEqual(caught.exception.code, "archive_unavailable")
        self.assertEqual(waits, [])

    def test_retry_after_accepts_http_dates_and_is_capped(self):
        soon = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=6), usegmt=True)
        self.assertAlmostEqual(IrsaRetriever._retry_delay(0, busy(soon)), 6, delta=1.5)
        self.assertEqual(IrsaRetriever._retry_delay(1, busy("soon")), 2.0)
        self.assertEqual(IrsaRetriever._retry_delay(0, busy("600")), 15.0)
        self.assertEqual(IrsaRetriever._retry_delay(9, busy()), 8.0)

    def _retrieve_with(self, outcomes, *, delay=0.0, setup=None, max_frames=None):
        """Run _retrieve over real-shaped rows; outcomes[i] is None or an error for row i.

        Each row gets its own source URL so parallel downloads can be told
        apart. The fake records every call so tests can inspect concurrency.
        """
        t = datetime(2025, 1, 1, tzinfo=timezone.utc)
        sources = [SOURCE.replace("_0074_", f"_{7400 + i}_") for i in range(len(outcomes))]
        rows = [ObservationMetadata(str(i), t + timedelta(days=i), t + timedelta(days=i), 1, "DR1", sources[i]) for i in range(len(outcomes))]
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + 100
        retriever.calls, retriever.max_in_flight = [], 0
        lock, in_flight = threading.Lock(), [0]
        if setup:
            setup(retriever)

        def fake_read(url, limit, destination=None, attempts=None, budget=None):
            index = next(i for i, source in enumerate(sources) if url.startswith(source))
            with lock:
                retriever.calls.append(index)
                in_flight[0] += 1
                retriever.max_in_flight = max(retriever.max_in_flight, in_flight[0])
            try:
                if outcomes[index] is not None:
                    raise outcomes[index]
                end = time.monotonic() + delay
                while time.monotonic() < end:
                    retriever._check()  # Like the real reader, notice cancel or abort.
                    time.sleep(0.005)
                destination.write_bytes(FITS)
                return len(FITS)
            finally:
                with lock:
                    in_flight[0] -= 1

        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(retriever, "_search", return_value=rows), \
                patch.object(retriever, "_read", side_effect=fake_read):
            result = retriever._retrieve(request(max_frames=max_frames or len(outcomes)), Path(tmp))
            self.assertTrue(all(item.fits_path.is_file() for item in result))
        return retriever, result

    def test_spread_order_visits_every_frame_widest_gap_first(self):
        self.assertEqual(spread_order(0), [])
        self.assertEqual(spread_order(1), [0])
        self.assertEqual(spread_order(3), [0, 2, 1])
        order = spread_order(16)
        self.assertEqual(sorted(order), list(range(16)))
        self.assertEqual(order[:3], [0, 15, 7])
        # The first four downloads already span the whole time range.
        self.assertEqual(sorted(order[:4]), [0, 3, 7, 15])

    def test_downloads_run_in_parallel_within_the_limit_and_return_in_time_order(self):
        retriever, result = self._retrieve_with([None] * 10, delay=0.05)
        self.assertEqual(retriever.max_in_flight, DOWNLOAD_CONCURRENCY)
        self.assertEqual([item.observation_id for item in result], [str(i) for i in range(10)])
        self.assertEqual(sorted(retriever.calls), list(range(10)))
        self.assertEqual(retriever.not_fetched, [])

    def test_progress_is_reported_for_each_download(self):
        reports = []
        retriever, result = self._retrieve_with([None, RetrievalError("archive_busy", "busy"), None, None],
                                                setup=lambda r: setattr(r, "on_download", lambda done, total: reports.append((done, total))))
        self.assertEqual(reports, [(1, 4), (2, 4), (3, 4)])
        self.assertEqual(retriever.skipped_downloads, ["1"])

    def test_early_stop_keeps_in_flight_files_and_reports_the_rest_unfetched(self):
        def setup(retriever):
            retriever.enough_epochs = lambda observations: len(observations) >= 3
        retriever, result = self._retrieve_with([None] * 12, delay=0.03, setup=setup)
        self.assertGreaterEqual(len(result), 3)
        self.assertTrue(retriever.not_fetched)
        fetched = {item.observation_id for item in result}
        self.assertEqual(len(fetched) + len(retriever.not_fetched), 12)
        self.assertFalse(fetched & set(retriever.not_fetched))
        # Nothing reported as not fetched was ever requested from the archive.
        self.assertFalse({str(index) for index in retriever.calls} & set(retriever.not_fetched))
        # Results stay chronological even though downloads ran in spread order.
        self.assertEqual([item.observation_id for item in result], sorted(fetched, key=int))

    def test_a_failing_early_stop_check_never_stops_downloads(self):
        def setup(retriever):
            retriever.enough_epochs = lambda observations: 1 / 0
        retriever, result = self._retrieve_with([None] * 5, setup=setup)
        self.assertEqual(len(result), 5)
        self.assertEqual(retriever.not_fetched, [])

    def test_a_fatal_error_stops_new_downloads_and_interrupts_running_ones(self):
        # Spread order for 8 is 0, 7, 3, 1, ...; row 1 fails inside the first batch.
        outcomes = [None] * 8
        outcomes[1] = RetrievalError("archive_size_limit", "too big")
        started = time.monotonic()
        with self.assertRaises(RetrievalError) as caught:
            self._retrieve_with(outcomes, delay=2.0)
        self.assertEqual(caught.exception.code, "archive_size_limit")
        # The three 2 s downloads already running were interrupted, not awaited.
        self.assertLess(time.monotonic() - started, 1.0)

    def test_parallel_downloads_share_one_byte_budget(self):
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + 10
        budget = _ByteBudget(limit=len(FITS) + 10)
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / "a.fits.part", Path(tmp) / "b.fits.part"
            with patch.object(retriever._opener, "open", side_effect=[Response(FITS, SOURCE), Response(FITS, SOURCE)]):
                self.assertEqual(retriever._read(SOURCE, 1000, first, budget=budget), len(FITS))
                with self.assertRaises(RetrievalError) as caught:
                    retriever._read(SOURCE, 1000, second, budget=budget)
            self.assertEqual(caught.exception.code, "archive_size_limit")
            # The refused file was removed and gave its partial bytes back.
            self.assertFalse(second.exists())
            self.assertEqual(budget.used, len(FITS))

    def test_busy_responses_are_counted(self):
        retriever = IrsaRetriever()
        retriever._deadline = time.monotonic() + 100
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(retriever, "_pause"), \
                patch.object(retriever._opener, "open", side_effect=[busy(), busy(code=429), busy(code=500), Response(FITS, SOURCE)]):
            retriever._read(SOURCE, 100, Path(tmp) / "input.fits.part")
        self.assertEqual(retriever.busy_responses, 2)

    def test_an_unavailable_cutout_is_skipped_and_reported(self):
        retriever, result = self._retrieve_with([None, RetrievalError("archive_busy", "busy"), None])
        self.assertEqual([item.observation_id for item in result], ["0", "2"])
        self.assertEqual(retriever.skipped_downloads, ["1"])
        self.assertEqual(retriever.selected_count, 3)

    def test_too_few_downloads_reports_the_archive_error_not_an_epoch_count(self):
        with self.assertRaises(RetrievalError) as caught:
            self._retrieve_with([RetrievalError("archive_busy", "busy"), None, RetrievalError("archive_busy", "busy")])
        self.assertEqual(caught.exception.code, "archive_busy")

    def test_deadline_and_cancellation_still_abort_retrieval(self):
        for code in ("archive_timeout", "cancelled", "archive_size_limit"):
            with self.assertRaises(RetrievalError) as caught:
                self._retrieve_with([None, RetrievalError(code, code), None])
            self.assertEqual(caught.exception.code, code)

    def test_job_cancellation_interrupts_a_backoff_wait(self):
        flag = threading.Event()
        retriever = IrsaRetriever(cancelled=flag.is_set)
        retriever._deadline = time.monotonic() + 100
        timer = threading.Timer(.1, flag.set)
        timer.start()
        started = time.monotonic()
        try:
            with self.assertRaisesRegex(RetrievalError, "cancelled"):
                retriever._pause(8)
        finally:
            timer.cancel()
        self.assertLess(time.monotonic() - started, 1.5)

    def test_cancelled_callback_prevents_network_access(self):
        retriever = IrsaRetriever(cancelled=lambda: True)
        with self.assertRaisesRegex(RetrievalError, "cancelled"):
            retriever._check()

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
