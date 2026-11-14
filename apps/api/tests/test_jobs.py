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
        if state.status in {"ready", "failed", "cancelled"}:
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
