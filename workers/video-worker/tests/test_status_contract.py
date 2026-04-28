import sys
import types
import unittest

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

from worker.app.db import VideoJobRepository


class NonConnectingRepository(VideoJobRepository):
    def _connect(self):
        raise AssertionError("invalid status should fail before opening a DB connection")


class StatusContractTests(unittest.TestCase):
    def test_update_stage_rejects_completed_as_video_job_status(self):
        repository = NonConnectingRepository("postgresql://example")

        with self.assertRaises(ValueError) as raised:
            repository.update_stage(
                "job_1",
                status="completed",
                current_stage="completed",
                progress_pct=100,
            )

        self.assertIn("completed", str(raised.exception))
        self.assertIn("video_edit_jobs.status", str(raised.exception))

    def test_mark_failed_rejects_unknown_failure_status(self):
        repository = NonConnectingRepository("postgresql://example")

        with self.assertRaises(ValueError) as raised:
            repository.mark_failed(
                "job_1",
                current_stage="failed",
                failure_reason="bad status",
                log_payload={"steps": []},
                status="failed",
            )

        self.assertIn("failed", str(raised.exception))
        self.assertIn("failed_retryable", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
