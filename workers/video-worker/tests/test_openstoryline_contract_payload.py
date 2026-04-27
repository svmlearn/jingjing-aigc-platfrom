import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from worker.app.directive import build_production_directive
from worker.app.models import VideoJob
from worker.app.openstoryline_client import OpenStorylineClient


class Settings:
    openstoryline_base_url = "http://engine"
    openstoryline_timeout_seconds = 30


def make_job():
    return VideoJob(
        id="job_1",
        merchant_id="merchant_1",
        draft_id="draft_1",
        content_variant_id="variant_1",
        status="pending",
        current_stage=None,
        instruction_text="make it warmer",
        input_payload={
            "executionMode": "staging_worker",
            "script": {
                "text": "固定脚本，不允许制作层改写 CTA。",
                "locked": True,
                "variantId": "variant_1",
            },
            "productionDirective": {
                "targetPlatform": "douyin",
                "aspectRatio": "9:16",
                "desiredOutputs": ["final_video", "cover"],
                "lockedFields": ["script", "cta"],
            },
        },
        runtime_payload={},
        retry_count=0,
    )


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "final_video_path": "C:/tmp/final.mp4",
            "cover_image_path": None,
            "subtitle_path": None,
            "metadata_path": "C:/tmp/run-metadata.json",
            "raw_response": {"engine": "openstoryline-skeleton"},
        }


class OpenStorylineContractPayloadTests(unittest.TestCase):
    def test_run_job_sends_normalized_production_directive(self):
        captured_payload = {}

        def fake_post(url, json, timeout):
            captured_payload.update(json)
            return FakeResponse()

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.post",
            side_effect=fake_post,
        ):
            client.run_job(
                job=job,
                directive=directive,
                input_assets=[],
                workspace_dir=Path(tmp) / "workspace",
                output_dir=Path(tmp) / "outputs",
            )

        self.assertEqual("staging_worker", captured_payload["execution_mode"])
        self.assertEqual("固定脚本，不允许制作层改写 CTA。", captured_payload["script_text"])
        self.assertTrue(captured_payload["production_directive"]["script_locked"])
        self.assertEqual(["script", "cta"], captured_payload["production_directive"]["locked_fields"])


if __name__ == "__main__":
    unittest.main()
