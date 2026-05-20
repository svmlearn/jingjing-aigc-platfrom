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
            "productionConfig": {
                "voiceover": {
                    "enabled": True,
                    "provider": "minimax",
                    "volume": 1.5,
                },
                "bgm": {
                    "enabled": True,
                    "userRequest": "light upbeat",
                    "include": {},
                    "exclude": {},
                    "volume": 0.35,
                },
                "subtitles": {"enabled": True, "style": "platform_default"},
                "render": {"aspectRatio": "9:16", "includeOriginalAudio": True},
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


class FakeStreamResponse:
    def __init__(self, lines):
        self._lines = lines

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False

    def raise_for_status(self):
        return None

    def iter_lines(self):
        return iter(self._lines)


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
        self.assertEqual("minimax", captured_payload["production_config"]["voiceover"]["provider"])
        self.assertEqual("light upbeat", captured_payload["production_config"]["bgm"]["user_request"])
        self.assertEqual(0.35, captured_payload["production_config"]["bgm"]["volume"])
        self.assertTrue(captured_payload["production_config"]["render"]["include_original_audio"])

    def test_run_job_stream_forwards_progress_events(self):
        captured_payload = {}
        progress_events = []

        def fake_stream(method, url, json, timeout):
            captured_payload.update({"method": method, "url": url, "json": json, "timeout": timeout})
            return FakeStreamResponse(
                [
                    '{"type":"progress","event":{"type":"tool_start","name":"render_video"}}',
                    '{"type":"result","data":{"final_video_path":"C:/tmp/final.mp4","cover_image_path":null,"subtitle_path":null,"metadata_path":"C:/tmp/run-metadata.json","raw_response":{"engine":"fire_red-openstoryline"}}}',
                ]
            )

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.stream",
            side_effect=fake_stream,
        ):
            result = client.run_job(
                job=job,
                directive=directive,
                input_assets=[],
                workspace_dir=Path(tmp) / "workspace",
                output_dir=Path(tmp) / "outputs",
                progress_callback=progress_events.append,
            )

        self.assertEqual("POST", captured_payload["method"])
        self.assertEqual("http://engine/v1/runs/stream", captured_payload["url"])
        self.assertEqual("job_1", captured_payload["json"]["job_id"])
        self.assertEqual("render_video", progress_events[0]["name"])
        self.assertEqual(Path("C:/tmp/final.mp4"), result.final_video_path)

    def test_run_job_stream_raises_on_error_event(self):
        def fake_stream(method, url, json, timeout):
            return FakeStreamResponse(
                ['{"type":"error","error":{"message":"engine exploded"}}']
            )

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.stream",
            side_effect=fake_stream,
        ):
            with self.assertRaisesRegex(RuntimeError, "engine exploded"):
                client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=[],
                    workspace_dir=Path(tmp) / "workspace",
                    output_dir=Path(tmp) / "outputs",
                    progress_callback=lambda _event: None,
                )

    def test_run_job_stream_raises_on_total_timeout(self):
        def fake_stream(method, url, json, timeout):
            return FakeStreamResponse(
                [
                    '{"type":"progress","event":{"type":"tool_progress","name":"filter_clips"}}',
                    '{"type":"progress","event":{"type":"tool_progress","name":"filter_clips"}}',
                ]
            )

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())
        progress_events = []

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.stream",
            side_effect=fake_stream,
        ), patch(
            "worker.app.openstoryline_client.time.monotonic",
            side_effect=[0.0, 1.0, 31.0],
        ):
            with self.assertRaisesRegex(RuntimeError, "stream run timeout after 30s"):
                client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=[],
                    workspace_dir=Path(tmp) / "workspace",
                    output_dir=Path(tmp) / "outputs",
                    progress_callback=progress_events.append,
                )

        self.assertEqual("filter_clips", progress_events[0]["name"])

    def test_run_job_stream_preserves_structured_render_error_detail(self):
        def fake_stream(method, url, json, timeout):
            return FakeStreamResponse(
                [
                    '{"type":"error","error":{'
                    '"message":"worker run failed: ExceptionGroup: unhandled errors",'
                    '"root_cause":"ConnectError: All connection attempts failed",'
                    '"last_event":{"type":"tool_end","name":"render_video"},'
                    '"last_tool":{"name":"render_video","summary":"Tool call failed"}}}'
                ]
            )

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.stream",
            side_effect=fake_stream,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "ConnectError.*render_video.*last_tool=render_video",
            ):
                client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=[],
                    workspace_dir=Path(tmp) / "workspace",
                    output_dir=Path(tmp) / "outputs",
                    progress_callback=lambda _event: None,
                )

    def test_run_job_stream_preserves_structured_voiceover_error_detail(self):
        def fake_stream(method, url, json, timeout):
            return FakeStreamResponse(
                [
                    '{"type":"error","error":{'
                    '"message":"worker run failed: RuntimeError: clone voiceover failed before render completion",'
                    '"root_cause":"RuntimeError: clone voiceover failed before render completion: errorCode 1014",'
                    '"last_event":{"type":"tool_end","name":"generate_voiceover"},'
                    '"last_tool":{"name":"generate_voiceover","summary":"runninghub submit returned no task id or audio: errorCode 1014"}}}'
                ]
            )

        job = make_job()
        directive = build_production_directive(job)
        client = OpenStorylineClient(Settings())

        with tempfile.TemporaryDirectory() as tmp, patch(
            "worker.app.openstoryline_client.httpx.stream",
            side_effect=fake_stream,
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "clone voiceover.*generate_voiceover.*errorCode 1014",
            ):
                client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=[],
                    workspace_dir=Path(tmp) / "workspace",
                    output_dir=Path(tmp) / "outputs",
                    progress_callback=lambda _event: None,
                )


if __name__ == "__main__":
    unittest.main()
