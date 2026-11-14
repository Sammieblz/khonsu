"""Exercise concurrency boundaries and temporary data, without archive requests."""
import json
from pathlib import Path
import threading
import time

import pytest

from app.jobs import JobManager, JobError
from app.paths import fixture_directory
from app.schemas import SequenceManifest, SequenceRequest


class Retriever:
    def __init__(self, cancelled):
        self.cancelled = cancelled
    async def retrieve(self, request, directory):
        return [object(), object()]


class Processor:
    def process(self, observations, options, output, cancelled, **filters):
        path = fixture_directory(Path(__file__), None) / "synthetic" / "sequence-manifest.json"
        payload = json.loads(path.read_text())
        payload["sequence_id"] = options.sequence_id
        for index, frame in enumerate(payload["frames"]):
            name = f"frame-{index:04d}.png"
            frame["image_url"] = f"/v1/sequences/{options.sequence_id}/frames/{name}"
            (output / name).write_bytes(b"test-only image artifact")
        return SequenceManifest.model_validate(payload)


def finish(manager, identity):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        state = manager.status(identity)
        if state.status in {"ready", "failed", "cancelled"} and manager.records[identity].worker_finished:
            return state
        time.sleep(0.01)
    pytest.fail("The bounded test job did not finish")


def test_dedup_ready_assets_and_expiry(tmp_path):
    now = [10.0]
    manager = JobManager(tmp_path, retriever_factory=Retriever, processor_factory=Processor,
                         ttl=5, clock=lambda: now[0])
    try:
        request = SequenceRequest(ra_deg=10, dec_deg=20)
        job = manager.submit(request)
        assert finish(manager, job.sequence_id).status == "ready"
        assert manager.submit(request).sequence_id == job.sequence_id
        assert manager.manifest(job.sequence_id).data_mode == "synthetic"
        assert manager.asset(job.sequence_id, "frame-0000.png").is_file()
        with pytest.raises(JobError) as exc:
            manager.asset(job.sequence_id, "../manifest.json")
        assert exc.value.status == 404
        now[0] = 20
        with pytest.raises(JobError) as exc:
            manager.status(job.sequence_id)
        assert exc.value.status == 410
        assert not (tmp_path / job.sequence_id).exists()
    finally:
        manager.close()


def test_skipped_archive_downloads_are_disclosed_in_the_manifest(tmp_path):
    class PartialRetriever(Retriever):
        async def retrieve(self, request, directory):
            self.selected_count, self.skipped_downloads = 3, ["obs-busy"]
            return [object(), object()]
    manager = JobManager(tmp_path, retriever_factory=PartialRetriever, processor_factory=Processor)
    try:
        job = manager.submit(SequenceRequest(ra_deg=10, dec_deg=20))
        assert finish(manager, job.sequence_id).status == "ready"
        manifest = manager.manifest(job.sequence_id)
        warning = next(item for item in manifest.warnings if item.code == "ARCHIVE_DOWNLOADS_SKIPPED")
        assert warning.message.startswith("1 of 3 selected IRSA cutouts")
        assert manifest.processing["archive_downloads_skipped"] == 1
        stored = json.loads((tmp_path / job.sequence_id / "manifest.json").read_text())
        assert any(item["code"] == "ARCHIVE_DOWNLOADS_SKIPPED" for item in stored["warnings"])
    finally:
        manager.close()


def test_bounded_queue_and_cooperative_cancellation(tmp_path):
    entered, release = threading.Event(), threading.Event()
    class WaitingRetriever(Retriever):
        async def retrieve(self, request, directory):
            entered.set()
            release.wait(4)
            return []
    manager = JobManager(tmp_path, limit=1, retriever_factory=WaitingRetriever, processor_factory=Processor)
    try:
        job = manager.submit(SequenceRequest(ra_deg=10, dec_deg=20))
        assert entered.wait(2)
        with pytest.raises(JobError) as exc:
            manager.submit(SequenceRequest(ra_deg=11, dec_deg=20))
        assert exc.value.status == 429
        assert manager.cancel(job.sequence_id).status == "cancelled"
        release.set()
        assert finish(manager, job.sequence_id).status == "cancelled"
    finally:
        release.set()
        manager.close()


def test_no_data_is_actionable_and_unknown_jobs_expire(tmp_path):
    class Empty(Retriever):
        async def retrieve(self, request, directory):
            return []
    manager = JobManager(tmp_path, retriever_factory=Empty, processor_factory=Processor)
    try:
        job = manager.submit(SequenceRequest(ra_deg=10, dec_deg=20))
        result = finish(manager, job.sequence_id)
        assert result.status == "failed"
        assert result.error.code == "INSUFFICIENT_EPOCHS"
        with pytest.raises(JobError) as exc:
            manager.status("unknown")
        assert exc.value.code == "JOB_EXPIRED"
    finally:
        manager.close()


def test_cancelled_running_and_queued_work_keep_capacity_until_acknowledged(tmp_path):
    entered, release = threading.Event(), threading.Event()
    now = [10.0]
    class Waiting(Retriever):
        async def retrieve(self, request, directory):
            entered.set()
            release.wait(4)
            return []
    manager = JobManager(tmp_path, limit=2, ttl=5, clock=lambda: now[0],
                         retriever_factory=Waiting, processor_factory=Processor)
    try:
        running = manager.submit(SequenceRequest(ra_deg=10, dec_deg=20))
        assert entered.wait(2)
        queued = manager.submit(SequenceRequest(ra_deg=11, dec_deg=20))
        manager.cancel(running.sequence_id)
        manager.cancel(queued.sequence_id)
        now[0] = 20
        # Even after the public cancelled states exceed TTL, an unfinished
        # worker retains its files and executor admission slot.
        assert manager.status(running.sequence_id).status == "cancelled"
        assert (tmp_path / running.sequence_id).is_dir()
        assert (tmp_path / queued.sequence_id).is_dir()
        with pytest.raises(JobError) as exc:
            manager.submit(SequenceRequest(ra_deg=12, dec_deg=20))
        assert exc.value.code == "QUEUE_FULL"
        release.set()
        assert finish(manager, running.sequence_id).status == "cancelled"
        assert finish(manager, queued.sequence_id).status == "cancelled"
        assert not (tmp_path / running.sequence_id).exists()
        assert not (tmp_path / queued.sequence_id).exists()
        manager.submit(SequenceRequest(ra_deg=12, dec_deg=20))
    finally:
        release.set()
        manager.close()


def test_queued_job_rechecks_peak_cache_headroom_before_retrieval(tmp_path):
    entered, release = threading.Event(), threading.Event()
    calls = []
    class Waiting(Retriever):
        async def retrieve(self, request, directory):
            calls.append(request.ra_deg)
            entered.set()
            release.wait(4)
            return []
    manager = JobManager(tmp_path, limit=2, max_bytes=250, peak_bytes=100,
                         retriever_factory=Waiting, processor_factory=Processor)
    try:
        first = manager.submit(SequenceRequest(ra_deg=10, dec_deg=20))
        assert entered.wait(2)
        queued = manager.submit(SequenceRequest(ra_deg=11, dec_deg=20))
        # Both jobs were accepted with an empty cache. Completed work or other
        # retained cache can consume headroom while a job waits for its worker.
        (tmp_path / "retained.bin").write_bytes(b"x" * 200)
        release.set()
        assert finish(manager, first.sequence_id).status == "failed"
        result = finish(manager, queued.sequence_id)
        assert result.status == "failed"
        assert result.error.code == "CACHE_FULL"
        assert calls == [10]
        assert not (tmp_path / queued.sequence_id).exists()
    finally:
        release.set()
        manager.close()


def test_cache_scan_tolerates_file_disappearing_during_cleanup(tmp_path, monkeypatch):
    path = tmp_path / "disappearing.bin"
    path.write_bytes(b"gone")
    manager = JobManager(tmp_path, retriever_factory=Retriever, processor_factory=Processor)
    original = Path.stat
    def disappearing_stat(candidate, *args, **kwargs):
        if candidate == path:
            raise FileNotFoundError(str(candidate))
        return original(candidate, *args, **kwargs)
    try:
        monkeypatch.setattr(Path, "stat", disappearing_stat)
        assert manager._cache_bytes() == 0
    finally:
        manager.close()


def test_cache_scan_fails_closed_when_file_cannot_be_inspected(tmp_path, monkeypatch):
    path = tmp_path / "unreadable.bin"
    path.write_bytes(b"private")
    manager = JobManager(tmp_path, retriever_factory=Retriever, processor_factory=Processor)
    original = Path.stat
    def unreadable_stat(candidate, *args, **kwargs):
        if candidate == path:
            raise PermissionError(str(candidate))
        return original(candidate, *args, **kwargs)
    try:
        monkeypatch.setattr(Path, "stat", unreadable_stat)
        with pytest.raises(JobError) as exc:
            manager._cache_bytes()
        assert exc.value.code == "CACHE_UNAVAILABLE"
    finally:
        manager.close()
