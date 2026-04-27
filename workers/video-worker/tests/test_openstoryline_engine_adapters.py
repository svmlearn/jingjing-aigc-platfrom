import os
import unittest
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
        self.assertEqual(8000, body["http_port"])
        self.assertEqual(8001, body["mcp_port"])

    def test_settings_reads_engine_adapter_environment(self):
        with patch.dict(
            os.environ,
            {
                "OPENSTORYLINE_ENGINE_ADAPTER": "fire_red",
                "FIRERED_OPENSTORYLINE_BASE_URL": "http://fire-red:7860",
            },
            clear=False,
        ):
            settings = Settings.from_env()

        self.assertEqual("fire_red", settings.engine_adapter)
        self.assertEqual("http://fire-red:7860", settings.fire_red_base_url)

    def test_skeleton_adapter_writes_run_outputs(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="skeleton",
            fire_red_base_url="",
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

    def test_fire_red_adapter_fails_closed_until_mapping_exists(self):
        settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
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

        self.assertIn("/v1/runs", str(raised.exception))
        self.assertIn("FireRed", str(raised.exception))

    def test_fire_red_adapter_returns_501_from_run_endpoint(self):
        original_settings = app.state.settings
        app.state.settings = Settings(
            host="127.0.0.1",
            port=8000,
            mcp_port=8001,
            outputs_dir=Path("/tmp/outputs"),
            models_dir=Path("/tmp/models"),
            engine_adapter="fire_red",
            fire_red_base_url="http://fire-red:7860",
        )
        try:
            response = TestClient(app).post(
                "/v1/runs",
                json={
                    "job_id": "fire-red-job",
                    "merchant_id": "merchant-1",
                    "draft_id": "draft-1",
                    "content_variant_id": "variant-1",
                    "workspace_dir": "/tmp/workspace",
                    "output_dir": "/tmp/output",
                    "script_text": "locked script",
                    "production_directive": {"script_locked": True},
                },
            )
        finally:
            app.state.settings = original_settings

        self.assertEqual(501, response.status_code)
        self.assertIn("FireRed", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
