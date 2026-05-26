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
psycopg_json.Jsonb = dict
sys.modules.setdefault("psycopg", psycopg)
sys.modules.setdefault("psycopg.rows", psycopg_rows)
sys.modules.setdefault("psycopg.types", psycopg_types)
sys.modules.setdefault("psycopg.types.json", psycopg_json)

from worker.app.db import VideoJobRepository


class NonConnectingRepository(VideoJobRepository):
    def _connect(self):
        raise AssertionError("invalid status should fail before opening a DB connection")


class RecordingCursor:
    def __init__(self):
        self.executed = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, query, params):
        self.executed = (query, params)


class RecordingConnection:
    def __init__(self):
        self.cursor_obj = RecordingCursor()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return self.cursor_obj


class RecordingRepository(VideoJobRepository):
    def __init__(self):
        super().__init__("postgresql://example", worker_id="worker-1")
        self.connection = RecordingConnection()

    def _connect(self):
        return self.connection


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

    def test_update_stage_progress_status_does_not_overwrite_terminal_status(self):
        repository = RecordingRepository()

        repository.update_stage(
            "job_1",
            status="running",
            current_stage="openstoryline_rendering",
            progress_pct=50,
        )

        query, params = repository.connection.cursor_obj.executed
        self.assertIn("status <> all(%s)", query)
        self.assertIn("cancelled", params[-1])
        self.assertIn("failed_retryable", params[-1])

    def test_update_stage_terminal_status_has_no_progress_guard(self):
        repository = RecordingRepository()

        repository.update_stage(
            "job_1",
            status="failed_retryable",
            current_stage="failed",
            progress_pct=50,
        )

        query, _params = repository.connection.cursor_obj.executed
        self.assertNotIn("status <> all(%s)", query)


if __name__ == "__main__":
    unittest.main()
