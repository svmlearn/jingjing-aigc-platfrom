import os
import json
import unittest
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

from openstoryline.app.config import Settings
from openstoryline.app.engine_adapters import (
    UnsupportedEngineAdapterError,
    create_engine_adapter,
)
from openstoryline.app.main import app
from openstoryline.app.schemas import RunRequest

PRIVATE_PEXELS_BASE_URL = "https://app.example.com/api/private-media/pexels"
PRIVATE_PEXELS_API_KEY = "private-pexels-token"


@dataclass
class MockHttpResponse:
    data: dict
    status_code: int = 200

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


class MockHttpStreamResponse:
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


class ReadTimeoutHttpStreamResponse:
    def __enter__(self):
        import httpx

        raise httpx.ReadTimeout("no stream events")

    def __exit__(self, _exc_type, _exc, _tb):
        return False


class OpenStorylineEngineAdapterTests(unittest.TestCase):
    def test_health_endpoint_reports_adapter_context(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="skeleton",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        try:
            response = TestClient(app).get("/health")
        finally:
            app.state.settings = original_settings

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("ok", body["status"])
        self.assertEqual("openstoryline-engine", body["service"])
        self.assertEqual("skeleton", body["engine_adapter"])
        self.assertFalse(body["fire_red_base_url_configured"])
        self.assertEqual(2700, body["fire_red_run_timeout_seconds"])
        self.assertFalse(body["fire_red_provider_key_configured"])
        self.assertEqual(8000, body["http_port"])
        self.assertEqual(8001, body["mcp_port"])

    def test_ready_endpoint_returns_ready_for_skeleton_adapter(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="skeleton",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        try:
            response = TestClient(app).get("/ready")
        finally:
            app.state.settings = original_settings

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("ready", body["status"])
        self.assertEqual("skeleton", body["engine_adapter"])

    def test_ready_endpoint_rejects_missing_fire_red_runtime_config(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        try:
            response = TestClient(app).get("/ready")
        finally:
            app.state.settings = original_settings

        self.assertEqual(503, response.status_code)
        self.assertEqual(
            [
                "FIRERED_OPENSTORYLINE_BASE_URL",
                "FIRERED_PROVIDER_KEY",
            ],
            response.json()["detail"]["missing"],
        )

    def test_ready_endpoint_checks_fire_red_health(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        try:
            with patch(
                "openstoryline.app.main.httpx.get",
                return_value=MockHttpResponse({"status": "ok"}),
            ) as get:
                response = TestClient(app).get("/ready")
        finally:
            app.state.settings = original_settings

        self.assertEqual(200, response.status_code)
        self.assertEqual("ready", response.json()["status"])
        get.assert_called_once_with(
            "http://fire-red:7860/ready",
            headers={"X-FIRERED-PROVIDER-KEY": "provider-secret"},
            timeout=5.0,
        )

    def test_settings_reads_engine_adapter_environment(self):
        with patch.dict(
            os.environ,
            {
                "OPENSTORYLINE_ENGINE_ADAPTER": "fire_red",
                "FIRERED_OPENSTORYLINE_BASE_URL": "http://fire-red:7860",
                "FIRERED_RUN_TIMEOUT_SECONDS": "123",
                "FIRERED_PROVIDER_KEY": "secret-provider-key",
                "PRIVATE_PEXELS_BASE_URL": "https://app.example.com/api/private-media/pexels/",
                "PRIVATE_PEXELS_API_KEY": "private-pexels-token",
            },
            clear=False,
        ):
            settings = Settings.from_env()

        self.assertEqual("fire_red", settings.engine_adapter)
        self.assertEqual("http://fire-red:7860", settings.fire_red_base_url)
        self.assertEqual(123, settings.fire_red_run_timeout_seconds)
        self.assertTrue(settings.fire_red_provider_key_configured)
        self.assertEqual("secret-provider-key", settings.fire_red_provider_key)
        self.assertEqual(
            "https://app.example.com/api/private-media/pexels",
            settings.private_pexels_base_url,
        )
        self.assertEqual("private-pexels-token", settings.private_pexels_api_key)

    def test_skeleton_adapter_writes_run_outputs(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="skeleton",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "outputs"
            response = adapter.run(
                RunRequest(
                    job_id="adapter-smoke",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(output_dir),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video", "cover", "subtitles"],
                    },
                )
            )

            self.assertTrue(Path(response.final_video_path).is_file())
            self.assertTrue(Path(response.cover_image_path).is_file())
            self.assertTrue(Path(response.subtitle_path).is_file())
            self.assertTrue(Path(response.metadata_path).is_file())
            self.assertEqual("openstoryline-skeleton", response.raw_response["engine"])

    def test_skeleton_run_endpoint_writes_requested_output_files(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="skeleton",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        try:
            with TemporaryDirectory() as tmp:
                output_dir = Path(tmp) / "outputs"
                response = TestClient(app).post(
                    "/v1/runs",
                    json={
                        "job_id": "endpoint-smoke",
                        "merchant_id": "merchant-1",
                        "draft_id": "draft-1",
                        "content_variant_id": "variant-1",
                        "workspace_dir": str(Path(tmp) / "workspace"),
                        "output_dir": str(output_dir),
                        "execution_mode": "staging_worker",
                        "script_text": "locked script",
                        "production_directive": {
                            "script_locked": True,
                            "desired_outputs": [
                                "final_video",
                                "cover",
                                "subtitles",
                            ],
                        },
                    },
                )

                self.assertEqual(200, response.status_code)
                body = response.json()
                self.assertTrue(Path(body["final_video_path"]).is_file())
                self.assertTrue(Path(body["cover_image_path"]).is_file())
                self.assertTrue(Path(body["subtitle_path"]).is_file())
                self.assertTrue(Path(body["metadata_path"]).is_file())
                self.assertEqual(
                    "skeleton",
                    body["raw_response"]["engine_adapter"],
                )
        finally:
            app.state.settings = original_settings

    def test_fire_red_adapter_requires_base_url_before_mapping(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
        )
        adapter = create_engine_adapter(settings)

        with self.assertRaises(UnsupportedEngineAdapterError) as raised:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir="/tmp/workspace",
                    output_dir="/tmp/output",
                    script_text="locked script",
                    production_directive={"script_locked": True},
                )
            )

        self.assertIn("FIRERED_OPENSTORYLINE_BASE_URL", str(raised.exception))

    def test_fire_red_adapter_requires_provider_key_before_mapping(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=False,
        )
        adapter = create_engine_adapter(settings)

        with self.assertRaises(UnsupportedEngineAdapterError) as raised:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir="/tmp/workspace",
                    output_dir="/tmp/output",
                    script_text="locked script",
                    production_directive={"script_locked": True},
                )
            )

        self.assertIn("FIRERED_PROVIDER_KEY", str(raised.exception))

    def test_fire_red_adapter_posts_worker_run_payload_and_returns_outputs(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            output_dir = Path(tmp) / "outputs"
            response = adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    instruction_text="render a locked commercial video",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(output_dir),
                    input_assets=[
                        {
                            "local_path": str(Path(tmp) / "inputs" / "clip.mp4"),
                            "asset_type": "video",
                            "file_name": "clip.mp4",
                        }
                    ],
                    execution_mode="staging_worker",
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {
                            "enabled": True,
                            "provider": "minimax",
                            "volume": 1.5,
                        },
                        "bgm": {
                            "enabled": True,
                            "user_request": "light upbeat",
                            "include": {},
                            "exclude": {},
                            "volume": 0.35,
                        },
                        "subtitles": {"enabled": True, "style": "platform_default"},
                        "render": {
                            "aspect_ratio": "9:16",
                            "include_original_audio": False,
                        },
                    },
                    runtime_payload={"source": "test"},
                )
            )

            self.assertEqual("fire-red-job", response.job_id)
            self.assertEqual(str(output_dir / "final.mp4"), response.final_video_path)
            self.assertTrue(Path(response.metadata_path).is_file())
            self.assertEqual("fire_red-openstoryline", response.engine)
            self.assertEqual("fire_red", response.raw_response["engine_adapter"])
            self.assertEqual("fire-red-session", response.raw_response["fire_red"]["session_id"])

            post.assert_called_once()
            args, kwargs = post.call_args
            self.assertEqual("http://fire-red:7860/api/worker/runs", args[0])
            self.assertEqual(2700, kwargs["timeout"])
            self.assertEqual(
                {"X-FIRERED-PROVIDER-KEY": "provider-secret"},
                kwargs["headers"],
            )
            payload = kwargs["json"]
            self.assertEqual("fire-red-job", payload["job_id"])
            self.assertEqual(str(output_dir), payload["output_dir"])
            self.assertEqual("locked script", payload["script_text"])
            self.assertEqual(["final_video"], payload["desired_outputs"])
            self.assertEqual("minimax", payload["production_config"]["voiceover"]["provider"])
            self.assertEqual("light upbeat", payload["production_config"]["bgm"]["user_request"])
            self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
            self.assertIn("视频剪辑任务调度 Agent", payload["prompt"])
            self.assertIn("search_media", payload["prompt"])
            self.assertIn("search_media.search_keyword", payload["prompt"])
            self.assertIn("load_media", payload["prompt"])
            self.assertIn("generate_voiceover", payload["prompt"])
            self.assertIn("select_bgm", payload["prompt"])
            self.assertIn("render_video artifact", payload["prompt"])
            self.assertNotIn("official Pexels", payload["prompt"])
            self.assertNotIn("per_page", payload["prompt"])
            self.assertNotIn("Required production nodes", payload["prompt"])
            pexels = payload["service_config"]["search_media"]["pexels"]
            self.assertEqual(
                f"{PRIVATE_PEXELS_BASE_URL}/merchants/merchant-1",
                pexels["base_url"],
            )
            self.assertEqual(PRIVATE_PEXELS_API_KEY, pexels["api_key"])
            self.assertEqual(
                [{"local_path": str(Path(tmp) / "inputs" / "clip.mp4"), "asset_type": "video", "file_name": "clip.mp4"}],
                payload["input_assets"],
            )
            self.assertIn("ProductionDirective", payload["prompt"])
            self.assertIn("locked script", payload["prompt"])

    def test_fire_red_payload_contains_production_config_and_service_config(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            tts_provider="minimax",
            tts_minimax_base_url="https://api.minimax.io",
            tts_minimax_api_key="minimax-secret",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {"enabled": True, "provider": "minimax"},
                        "bgm": {
                            "enabled": True,
                            "user_request": "light upbeat",
                            "include": {},
                            "exclude": {},
                            "volume": 0.25,
                        },
                    },
                )
            )

            payload = post.call_args.kwargs["json"]
            self.assertEqual("minimax", payload["production_config"]["voiceover"]["provider"])
            self.assertEqual("light upbeat", payload["production_config"]["bgm"]["user_request"])
            self.assertEqual("minimax", payload["service_config"]["tts"]["provider"])
            self.assertEqual("minimax-secret", payload["service_config"]["tts"]["minimax"]["api_key"])
            self.assertIn("generate_voiceover", payload["prompt"])
            self.assertIn("select_bgm", payload["prompt"])

    def test_fire_red_payload_contains_cloud_asr_service_config(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            asr_provider="aliyun_paraformer",
            aliyun_asr_model="paraformer-realtime-v2",
            aliyun_asr_api_key="asr-secret",
            aliyun_asr_workspace="workspace-1",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {"enabled": False},
                    },
                )
            )

            asr = post.call_args.kwargs["json"]["service_config"]["asr"]
            self.assertEqual("aliyun_paraformer", asr["provider"])
            self.assertEqual("paraformer-realtime-v2", asr["aliyun_paraformer"]["model"])
            self.assertEqual("asr-secret", asr["aliyun_paraformer"]["api_key"])
            self.assertEqual("workspace-1", asr["aliyun_paraformer"]["workspace"])
            self.assertEqual(16000, asr["aliyun_paraformer"]["sample_rate"])
            self.assertEqual(["zh", "en"], asr["aliyun_paraformer"]["language_hints"])

    def test_fire_red_original_audio_asr_rejects_local_funasr_provider(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            asr_provider="local_funasr",
            aliyun_asr_api_key="asr-secret",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(UnsupportedEngineAdapterError, "aliyun_paraformer"):
                adapter.run(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                        production_config={
                            "subtitles": {"talking_head_source": "asr_original_audio"},
                        },
                    )
                )

    def test_fire_red_original_audio_asr_rejects_missing_aliyun_key(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            asr_provider="aliyun_paraformer",
            aliyun_asr_api_key="",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(UnsupportedEngineAdapterError, "ALIYUN_ASR_API_KEY"):
                adapter.run(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                        production_config={
                            "subtitles": {"talking_head_source": "asr_original_audio"},
                        },
                    )
                )

    def test_fire_red_script_audio_alignment_does_not_require_asr(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="test-provider-key",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            asr_provider="local_funasr",
            aliyun_asr_api_key="",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "subtitles": {"talking_head_source": "script_audio_alignment"},
                        "lip_sync": {
                            "enabled": True,
                            "provider": "aliyun_videoretalk",
                        },
                        "voiceover": {"enabled": False},
                    },
                )
            )

            payload = post.call_args.kwargs["json"]
            self.assertEqual(
                "script_audio_alignment",
                payload["production_config"]["subtitles"]["talking_head_source"],
            )
            self.assertIn("lip_sync", payload["prompt"])
            self.assertIn("render_video artifact", payload["prompt"])
            self.assertNotIn("render_video must consume", payload["prompt"])

    def test_fire_red_payload_includes_lip_sync_service_config(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=900,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="test-provider-key",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            aliyun_videoretalk_api_key="retalk-key",
            aliyun_videoretalk_base_url="https://dashscope.example/api/v1",
            aliyun_videoretalk_model="videoretalk",
            aliyun_videoretalk_ref_image_url="https://oss.example/ref.png",
            aliyun_videoretalk_video_extension=True,
            aliyun_videoretalk_query_face_threshold=170,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {
                        "engine": "fire_red-openstoryline",
                        "lip_sync": {"segments": [{"retalked_path": "/tmp/retalked.mp4"}]},
                    },
                }
            ),
        ) as post:
            response = adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "subtitles": {"talking_head_source": "script_audio_alignment"},
                        "lip_sync": {
                            "enabled": True,
                            "provider": "aliyun_videoretalk",
                        },
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                        },
                    },
                )
            )

            payload = post.call_args.kwargs["json"]
            retalk_cfg = payload["service_config"]["lip_sync"]["aliyun_videoretalk"]
            self.assertEqual("retalk-key", retalk_cfg["api_key"])
            self.assertEqual("videoretalk", retalk_cfg["model"])
            self.assertEqual("auto", retalk_cfg["upload_url_mode"])
            self.assertEqual("https://oss.example/ref.png", retalk_cfg["ref_image_url"])
            self.assertTrue(retalk_cfg["video_extension"])
            self.assertEqual(170, retalk_cfg["query_face_threshold"])
            self.assertEqual(
                "aliyun_videoretalk",
                payload["service_config"]["lip_sync"]["provider"],
            )
            self.assertEqual(
                [{"retalked_path": "/tmp/retalked.mp4"}],
                response.raw_response["openstoryline"]["lip_sync"]["segments"],
            )

    def test_fire_red_payload_marks_self_hosted_rehearsal_fast_path(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "worker_rehearsal_fast_path",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {
                        "engine": "fire_red-openstoryline",
                        "worker_rehearsal_fast_path": True,
                    },
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="selfhost-fast-path-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    input_assets=[
                        {
                            "local_path": str(Path(tmp) / "inputs" / "clip.mp4"),
                            "asset_type": "video",
                            "file_name": "clip.mp4",
                        }
                    ],
                    execution_mode="self_hosted_rehearsal_fast_path",
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {"enabled": False},
                        "bgm": {"enabled": False},
                        "subtitles": {"enabled": False},
                    },
                )
            )

            payload = post.call_args.kwargs["json"]
            self.assertTrue(payload["service_config"]["worker_rehearsal_fast_path"])
            self.assertEqual("self_hosted_rehearsal_fast_path", payload["execution_mode"])

    def test_fire_red_private_pexels_requires_private_api_key(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url="https://app.example.com/api/private-media/pexels",
            private_pexels_api_key="",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(UnsupportedEngineAdapterError, "PRIVATE_PEXELS_API_KEY"):
                adapter.run(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    )
                )

    def test_fire_red_private_pexels_base_url_is_scoped_to_merchant(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                )
            )

            pexels = post.call_args.kwargs["json"]["service_config"]["search_media"]["pexels"]
            self.assertEqual("custom", pexels["mode"])
            self.assertEqual(
                f"{PRIVATE_PEXELS_BASE_URL}/merchants/merchant-1",
                pexels["base_url"],
            )
            self.assertEqual(PRIVATE_PEXELS_API_KEY, pexels["api_key"])

    def test_fire_red_clone_voiceover_uses_runninghub_clone_legacy_pixelle_adapter_name(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            tts_pixelle_clone_base_url="https://pixelle.example",
            tts_pixelle_clone_api_key="pixelle-secret",
            tts_runninghub_base_url="https://www.runninghub.cn",
            tts_runninghub_api_key="runninghub-secret",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                            "clone_enabled": True,
                            "voice_profile_id": "profile-1",
                            "ref_audio_asset_id": "asset-1",
                            "ref_audio": str(Path(tmp) / "ref.wav"),
                        },
                    },
                )
            )

            tts = post.call_args.kwargs["json"]["service_config"]["tts"]
            self.assertEqual("pixelle_clone", tts["provider"])
            self.assertEqual(str(Path(tmp) / "ref.wav"), tts["ref_audio"])
            self.assertEqual(str(Path(tmp) / "ref.wav"), tts["pixelle_clone"]["ref_audio"])
            self.assertEqual("pixelle-secret", tts["pixelle_clone"]["api_key"])

    def test_fire_red_aliyun_cosyvoice_system_voiceover_maps_dashscope_config(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            tts_aliyun_cosyvoice_api_key="dashscope-secret",
            tts_aliyun_cosyvoice_model="cosyvoice-v3-flash",
            tts_aliyun_cosyvoice_voice="longanyang",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {
                            "enabled": True,
                            "mode": "system",
                            "provider": "aliyun_cosyvoice",
                        },
                    },
                )
            )

            tts = post.call_args.kwargs["json"]["service_config"]["tts"]
            self.assertEqual("aliyun_cosyvoice", tts["provider"])
            self.assertEqual("dashscope-secret", tts["aliyun_cosyvoice"]["api_key"])
            self.assertEqual("cosyvoice-v3-flash", tts["aliyun_cosyvoice"]["model"])
            self.assertEqual("longanyang", tts["aliyun_cosyvoice"]["voice"])

    def test_fire_red_aliyun_cosyvoice_clone_maps_voice_id_and_reference_url(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            tts_aliyun_cosyvoice_clone_api_key="dashscope-secret",
            tts_aliyun_cosyvoice_clone_model="cosyvoice-v3.5-plus",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={
                        "script_locked": True,
                        "desired_outputs": ["final_video"],
                    },
                    production_config={
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "aliyun_cosyvoice_clone",
                            "clone_enabled": True,
                            "voice_profile_id": "profile-1",
                            "ref_audio_asset_id": "asset-1",
                            "external_voice_id": "voice-aliyun-1",
                            "external_model_id": "cosyvoice-v3.5-plus",
                            "ref_audio": str(Path(tmp) / "ref.wav"),
                            "ref_audio_url": "https://signed.example/ref.wav",
                        },
                    },
                )
            )

            tts = post.call_args.kwargs["json"]["service_config"]["tts"]
            self.assertEqual("aliyun_cosyvoice_clone", tts["provider"])
            self.assertTrue(tts["clone_enabled"])
            self.assertEqual("voice-aliyun-1", tts["aliyun_cosyvoice_clone"]["voice_id"])
            self.assertEqual("https://signed.example/ref.wav", tts["aliyun_cosyvoice_clone"]["ref_audio_url"])
            self.assertEqual("dashscope-secret", tts["aliyun_cosyvoice_clone"]["api_key"])

    def test_fire_red_stream_payload_marks_self_hosted_rehearsal_fast_path(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.stream",
            return_value=MockHttpStreamResponse(
                [
                    json.dumps(
                        {
                            "type": "result",
                            "data": {
                                "session_id": "worker_rehearsal_fast_path",
                                "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                                "raw_response": {
                                    "engine": "fire_red-openstoryline",
                                    "worker_rehearsal_fast_path": True,
                                },
                            },
                        }
                    )
                ]
            ),
        ) as stream:
            list(
                adapter.stream(
                    RunRequest(
                        job_id="selfhost-fast-path-stream-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        input_assets=[
                            {
                                "local_path": str(Path(tmp) / "inputs" / "clip.mp4"),
                                "asset_type": "video",
                                "file_name": "clip.mp4",
                            }
                        ],
                        execution_mode="self_hosted_rehearsal_fast_path",
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                        production_config={
                            "voiceover": {"enabled": False},
                            "bgm": {"enabled": False},
                            "subtitles": {"enabled": False},
                        },
                    )
                )
            )

            payload = stream.call_args.kwargs["json"]
            self.assertTrue(payload["service_config"]["worker_rehearsal_fast_path"])
            self.assertEqual("self_hosted_rehearsal_fast_path", payload["execution_mode"])

    def test_fire_red_minimax_voiceover_configures_runninghub_ordinary_tts_fallback(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
            tts_minimax_base_url="https://api.minimax.io",
            tts_minimax_api_key="minimax-secret",
            tts_runninghub_base_url="https://www.runninghub.cn",
            tts_runninghub_api_key="runninghub-secret",
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="locked script",
                    production_directive={"script_locked": True, "desired_outputs": ["final_video"]},
                    production_config={"voiceover": {"enabled": True, "provider": "minimax"}},
                )
            )

            tts = post.call_args.kwargs["json"]["service_config"]["tts"]
            self.assertEqual("minimax", tts["provider"])
            self.assertEqual("runninghub", tts["fallback_provider"])
            self.assertEqual("runninghub-secret", tts["runninghub"]["api_key"])

    def test_fire_red_talking_head_voiceover_mutes_original_video_audio(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="场景：真人开头口播\n台词/字幕：欢迎来看这家店",
                    input_assets=[
                        {
                            "local_path": str(Path(tmp) / "inputs" / "clip.mp4"),
                            "asset_type": "video",
                            "file_name": "clip.mp4",
                            "tags": ["talking_head"],
                        }
                    ],
                    production_directive={"script_locked": True, "desired_outputs": ["final_video"]},
                    production_config={
                        "voiceover": {"enabled": True, "provider": "minimax"},
                        "render": {"include_original_audio": True},
                    },
                )
            )

            render = post.call_args.kwargs["json"]["production_config"]["render"]
            self.assertFalse(render["include_original_audio"])
            self.assertFalse(render["include_video_audio"])
            self.assertEqual(0, render["video_volume_scale"])
            self.assertEqual("mute_source_for_talking_head_voiceover", render["audio_policy"])

    def test_fire_red_talking_head_preserve_original_audio_policy(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.post",
            return_value=MockHttpResponse(
                {
                    "session_id": "fire-red-session",
                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                    "raw_response": {"engine": "fire_red-openstoryline"},
                }
            ),
        ) as post:
            adapter.run(
                RunRequest(
                    job_id="fire-red-job",
                    merchant_id="merchant-1",
                    draft_id="draft-1",
                    content_variant_id="variant-1",
                    workspace_dir=str(Path(tmp) / "workspace"),
                    output_dir=str(Path(tmp) / "outputs"),
                    script_text="场景：真人开头口播\n台词/字幕：欢迎来看这家店",
                    input_assets=[
                        {
                            "local_path": str(Path(tmp) / "inputs" / "clip.mp4"),
                            "asset_type": "video",
                            "file_name": "clip.mp4",
                            "tags": ["talking_head"],
                        }
                    ],
                    production_directive={"script_locked": True, "desired_outputs": ["final_video"]},
                    production_config={
                        "voiceover": {"enabled": True, "provider": "minimax"},
                        "render": {
                            "include_original_audio": True,
                            "preserve_talking_head_original_audio": True,
                        },
                    },
                )
            )

            render = post.call_args.kwargs["json"]["production_config"]["render"]
            self.assertTrue(render["include_original_audio"])
            self.assertTrue(render["include_video_audio"])
            self.assertEqual(1, render["video_volume_scale"])
            self.assertEqual(
                "preserve_talking_head_original_audio_with_voiceover",
                render["audio_policy"],
            )

    def test_fire_red_stream_proxies_progress_and_maps_final_result(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.stream",
            return_value=MockHttpStreamResponse(
                [
                    json.dumps(
                        {
                            "type": "progress",
                            "event": {
                                "type": "tool_start",
                                "name": "render_video",
                            },
                        }
                    ),
                    json.dumps(
                        {
                            "type": "result",
                            "data": {
                                "session_id": "fire-red-session",
                                "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                                "raw_response": {"engine": "fire_red-openstoryline"},
                            },
                        }
                    ),
                ]
            ),
        ) as stream:
            output_dir = Path(tmp) / "outputs"
            events = list(
                adapter.stream(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(output_dir),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    )
                )
            )

            stream.assert_called_once()
            args, kwargs = stream.call_args
            self.assertEqual("POST", args[0])
            self.assertEqual("http://fire-red:7860/api/worker/runs/stream", args[1])
            self.assertEqual({"X-FIRERED-PROVIDER-KEY": "provider-secret"}, kwargs["headers"])
            self.assertEqual("fire-red-job", kwargs["json"]["job_id"])
            self.assertEqual("progress", events[0]["type"])
            self.assertEqual("render_video", events[0]["event"]["name"])
            self.assertEqual("result", events[1]["type"])
            self.assertEqual("fire-red-job", events[1]["data"]["job_id"])
            self.assertEqual(str(output_dir / "final.mp4"), events[1]["data"]["final_video_path"])

    def test_fire_red_stream_read_timeout_returns_error_event(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_stream_idle_timeout_seconds=7,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.stream",
            return_value=ReadTimeoutHttpStreamResponse(),
        ) as stream:
            events = list(
                adapter.stream(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    )
                )
            )

        self.assertEqual("error", events[0]["type"])
        self.assertIn("idle timeout after 7s", events[0]["error"]["message"])
        timeout = stream.call_args.kwargs["timeout"]
        self.assertEqual(7.0, timeout.read)

    def test_fire_red_stream_run_timeout_returns_error_event(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=5,
            fire_red_stream_idle_timeout_seconds=60,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        adapter = create_engine_adapter(settings)

        with TemporaryDirectory() as tmp, patch(
            "openstoryline.app.engine_adapters.httpx.stream",
            return_value=MockHttpStreamResponse(
                [
                    json.dumps(
                        {
                            "type": "progress",
                            "event": {"type": "tool_progress", "name": "filter_clips"},
                        }
                    ),
                    json.dumps(
                        {
                            "type": "progress",
                            "event": {"type": "tool_progress", "name": "filter_clips"},
                        }
                    ),
                ]
            ),
        ), patch(
            "openstoryline.app.engine_adapters.time.monotonic",
            side_effect=[0.0, 1.0, 6.0],
        ):
            events = list(
                adapter.stream(
                    RunRequest(
                        job_id="fire-red-job",
                        merchant_id="merchant-1",
                        draft_id="draft-1",
                        content_variant_id="variant-1",
                        workspace_dir=str(Path(tmp) / "workspace"),
                        output_dir=str(Path(tmp) / "outputs"),
                        script_text="locked script",
                        production_directive={
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    )
                )
            )

        self.assertEqual("progress", events[0]["type"])
        self.assertEqual("error", events[1]["type"])
        self.assertIn("run timeout after 5s", events[1]["error"]["message"])

    def test_fire_red_adapter_run_endpoint_uses_worker_mapping(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        try:
            with TemporaryDirectory() as tmp, patch(
                "openstoryline.app.engine_adapters.httpx.post",
                return_value=MockHttpResponse(
                    {
                        "session_id": "fire-red-session",
                        "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                        "raw_response": {"engine": "fire_red-openstoryline"},
                    }
                ),
            ):
                response = TestClient(app).post(
                    "/v1/runs",
                    json={
                        "job_id": "fire-red-job",
                        "merchant_id": "merchant-1",
                        "draft_id": "draft-1",
                        "content_variant_id": "variant-1",
                        "workspace_dir": str(Path(tmp) / "workspace"),
                        "output_dir": str(Path(tmp) / "outputs"),
                        "script_text": "locked script",
                        "production_directive": {
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    },
                )
        finally:
            app.state.settings = original_settings

        self.assertEqual(200, response.status_code)
        self.assertEqual("fire-red-job", response.json()["job_id"])
        self.assertEqual("fire_red-openstoryline", response.json()["engine"])

    def test_fire_red_adapter_stream_endpoint_returns_ndjson_events(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
            fire_red_run_timeout_seconds=2700,
            fire_red_provider_key_configured=True,
            fire_red_provider_key="provider-secret",
            private_pexels_base_url=PRIVATE_PEXELS_BASE_URL,
            private_pexels_api_key=PRIVATE_PEXELS_API_KEY,
        )
        try:
            with TemporaryDirectory() as tmp, patch(
                "openstoryline.app.engine_adapters.httpx.stream",
                return_value=MockHttpStreamResponse(
                    [
                        json.dumps(
                            {
                                "type": "progress",
                                "event": {
                                    "type": "tool_start",
                                    "name": "render_video",
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "type": "result",
                                "data": {
                                    "session_id": "fire-red-session",
                                    "final_video_path": str(Path(tmp) / "outputs" / "final.mp4"),
                                    "raw_response": {"engine": "fire_red-openstoryline"},
                                },
                            }
                        ),
                    ]
                ),
            ):
                response = TestClient(app).post(
                    "/v1/runs/stream",
                    json={
                        "job_id": "fire-red-job",
                        "merchant_id": "merchant-1",
                        "draft_id": "draft-1",
                        "content_variant_id": "variant-1",
                        "workspace_dir": str(Path(tmp) / "workspace"),
                        "output_dir": str(Path(tmp) / "outputs"),
                        "script_text": "locked script",
                        "production_directive": {
                            "script_locked": True,
                            "desired_outputs": ["final_video"],
                        },
                    },
                )
        finally:
            app.state.settings = original_settings

        self.assertEqual(200, response.status_code)
        events = [
            json.loads(line)
            for line in response.text.splitlines()
            if line.strip()
        ]
        self.assertEqual("progress", events[0]["type"])
        self.assertEqual("render_video", events[0]["event"]["name"])
        self.assertEqual("result", events[1]["type"])
        self.assertEqual("fire-red-job", events[1]["data"]["job_id"])


if __name__ == "__main__":
    unittest.main()
