import unittest
import sys
import types
from pathlib import Path
from unittest.mock import patch

httpx = types.ModuleType("httpx")
httpx.get = object()
sys.modules.setdefault("httpx", httpx)

from worker.app.config import Settings
from worker.app.openstoryline_client import OpenStorylineClient


def _settings() -> Settings:
    return Settings(
        database_url="postgresql://example",
        storage_provider="tencent_cos",
        cos_secret_id="",
        cos_secret_key="",
        cos_bucket="",
        cos_region="",
        aliyun_oss_access_key_id="",
        aliyun_oss_access_key_secret="",
        aliyun_oss_bucket="",
        aliyun_oss_region="",
        aliyun_oss_endpoint="",
        storage_result_prefix="video-results",
        worker_id="test-worker",
        worker_poll_interval_seconds=10,
        worker_max_concurrency=1,
        video_job_stale_minutes=120,
        worker_temp_root=Path("/tmp/worker"),
        worker_models_root=Path("/tmp/models"),
        worker_output_root=Path("/tmp/outputs"),
        openstoryline_base_url="http://openstoryline-engine:8000",
        openstoryline_timeout_seconds=1800,
        log_level="INFO",
    )


class OpenStorylineClientTest(unittest.TestCase):
    def test_healthcheck_uses_ready_endpoint(self):
        client = OpenStorylineClient(_settings())

        with patch("worker.app.openstoryline_client.httpx.get") as get:
            get.return_value.json.return_value = {"status": "ready"}

            self.assertEqual({"status": "ready"}, client.healthcheck())

        get.assert_called_once_with(
            "http://openstoryline-engine:8000/ready",
            timeout=30.0,
        )
        get.return_value.raise_for_status.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
