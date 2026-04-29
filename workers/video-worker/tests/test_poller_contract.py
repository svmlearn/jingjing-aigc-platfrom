import sys
import types
import unittest

qcloud_cos = types.ModuleType("qcloud_cos")
qcloud_cos.CosConfig = object
qcloud_cos.CosS3Client = object
sys.modules.setdefault("qcloud_cos", qcloud_cos)

psycopg = types.ModuleType("psycopg")
psycopg.Connection = object
psycopg_rows = types.ModuleType("psycopg.rows")
psycopg_rows.dict_row = object()
psycopg_types = types.ModuleType("psycopg.types")
psycopg_json = types.ModuleType("psycopg.types.json")
psycopg_json.Json = dict
sys.modules.setdefault("psycopg", psycopg)
sys.modules.setdefault("psycopg.rows", psycopg_rows)
sys.modules.setdefault("psycopg.types", psycopg_types)
sys.modules.setdefault("psycopg.types.json", psycopg_json)

from worker.app.poller import VideoWorkerPoller


class Settings:
    worker_poll_interval_seconds = 10
    worker_max_concurrency = 1
    video_job_stale_minutes = 120


class Job:
    id = "job_1"


class FakeRepository:
    def __init__(self, job=None, stale_count=0) -> None:
        self.job = job
        self.stale_count = stale_count
        self.swept_with = []
        self.claims = 0

    def sweep_stale_jobs(self, stale_minutes):
        self.swept_with.append(stale_minutes)
        return self.stale_count

    def claim_next_job(self):
        self.claims += 1
        return self.job


class FakeProcessor:
    def __init__(self, fail=False) -> None:
        self.fail = fail
        self.processed_jobs = []

    def process(self, job):
        self.processed_jobs.append(job.id)
        if self.fail:
            raise RuntimeError("processor failed")


class PollerContractTests(unittest.TestCase):
    def test_run_once_sweeps_and_returns_false_when_no_pending_job(self):
        repository = FakeRepository(job=None, stale_count=2)
        processor = FakeProcessor()
        poller = VideoWorkerPoller(Settings(), repository, processor)

        with self.assertLogs("video-worker.poller", level="WARNING"):
            processed = poller.run_once()

        self.assertFalse(processed)
        self.assertEqual([120], repository.swept_with)
        self.assertEqual(1, repository.claims)
        self.assertEqual([], processor.processed_jobs)

    def test_run_once_claims_and_processes_one_job(self):
        repository = FakeRepository(job=Job())
        processor = FakeProcessor()
        poller = VideoWorkerPoller(Settings(), repository, processor)

        processed = poller.run_once()

        self.assertTrue(processed)
        self.assertEqual([120], repository.swept_with)
        self.assertEqual(1, repository.claims)
        self.assertEqual(["job_1"], processor.processed_jobs)

    def test_run_once_keeps_poll_loop_alive_when_processor_fails(self):
        repository = FakeRepository(job=Job())
        processor = FakeProcessor(fail=True)
        poller = VideoWorkerPoller(Settings(), repository, processor)

        with self.assertLogs("video-worker.poller", level="ERROR"):
            processed = poller.run_once()

        self.assertTrue(processed)
        self.assertEqual(["job_1"], processor.processed_jobs)


if __name__ == "__main__":
    unittest.main()
