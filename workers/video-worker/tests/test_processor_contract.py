import tempfile
import unittest
import sys
import types
from pathlib import Path

try:
    import httpx  # noqa: F401
except ModuleNotFoundError:
    httpx = types.ModuleType("httpx")
    httpx.get = object()
    httpx.post = object()
    httpx.stream = object()
    sys.modules.setdefault("httpx", httpx)

try:
    import qcloud_cos  # noqa: F401
except ModuleNotFoundError:
    qcloud_cos = types.ModuleType("qcloud_cos")
    qcloud_cos.CosConfig = object
    qcloud_cos.CosS3Client = object
    sys.modules.setdefault("qcloud_cos", qcloud_cos)

try:
    import psycopg  # noqa: F401
    import psycopg.rows  # noqa: F401
    import psycopg.types.json  # noqa: F401
except ModuleNotFoundError:
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

from worker.app.models import EngineRunResult, UploadedAsset, VideoJob
from worker.app.processor import JobProcessor


class Settings:
    storage_provider = "tencent_cos"
    cos_bucket = "default-bucket"
    cos_result_prefix = "video-results"
    storage_result_prefix = "video-results"
    default_input_buckets = {
        "tencent_cos": "default-bucket",
        "aliyun_oss": "default-aliyun-bucket",
    }

    def __init__(self, root: Path) -> None:
        self.worker_temp_root = root / "tmp"
        self.worker_output_root = root / "outputs"


class AliyunSettings(Settings):
    storage_provider = "aliyun_oss"
    storage_result_prefix = "video-results"
    default_input_buckets = {
        "tencent_cos": "default-bucket",
        "aliyun_oss": "default-aliyun-bucket",
    }


def make_job(input_payload=None):
    if input_payload is None:
        input_payload = {
            "source": "video_workbench",
            "executionMode": "staging_worker",
            "script": {
                "text": "固定脚本，不允许制作层改写。",
                "locked": True,
                "variantId": "variant_1",
            },
            "productionDirective": {
                "targetPlatform": "douyin",
                "aspectRatio": "9:16",
                "desiredOutputs": ["final_video", "cover", "subtitles"],
                "lockedFields": ["script", "cta"],
            },
            "input_assets": [
                {
                    "asset_type": "video",
                    "bucket_name": "input-bucket",
                    "storage_key": "draft-inputs/demo.mp4",
                    "file_name": "demo.mp4",
                }
            ],
        }
    return VideoJob(
        id="job_1",
        merchant_id="merchant_1",
        draft_id="draft_1",
        content_variant_id="variant_1",
        status="pending",
        current_stage=None,
        instruction_text="make a video",
        input_payload=input_payload,
        runtime_payload={},
        retry_count=0,
    )


def make_job_without_input_bucket():
    job = make_job()
    payload = dict(job.input_payload)
    payload["input_assets"] = [dict(payload["input_assets"][0])]
    payload["input_assets"][0].pop("bucket_name", None)
    return make_job(payload)


class FakeRepository:
    def __init__(self, fail_insert_output_assets=False) -> None:
        self.stage_updates = []
        self.failed = None
        self.succeeded = None
        self.inserted_assets = []
        self.fail_insert_output_assets = fail_insert_output_assets

    def update_stage(self, job_id, **kwargs):
        self.stage_updates.append({"job_id": job_id, **kwargs})

    def mark_failed(self, job_id, **kwargs):
        kwargs.setdefault("status", "failed_retryable")
        self.failed = {"job_id": job_id, **kwargs}

    def mark_succeeded(self, job_id, **kwargs):
        self.succeeded = {"job_id": job_id, **kwargs}

    def insert_output_assets(self, job, uploaded_assets):
        if self.fail_insert_output_assets:
            raise RuntimeError("asset_objects insert failed")
        self.inserted_assets.extend(uploaded_assets)
        return [
            {
                "asset_id": f"asset_{asset.asset_type}_1",
                "asset_type": asset.asset_type,
                "storage_provider": asset.storage_provider,
                "bucket_name": asset.bucket_name,
                "storage_key": asset.storage_key,
                "mime_type": asset.mime_type,
                "etag": asset.etag,
                "file_size_bytes": asset.file_size_bytes,
            }
            for asset in uploaded_assets
        ]


class FakeCosClient:
    def __init__(self, fail_download=False, fail_upload_asset_type=None) -> None:
        self.downloads = []
        self.uploads = []
        self.fail_download = fail_download
        self.fail_upload_asset_type = fail_upload_asset_type

    def download_file(self, storage_key, destination, bucket_name=None, storage_provider="tencent_cos"):
        self.downloads.append(
            {
                "storage_key": storage_key,
                "destination": destination,
                "bucket_name": bucket_name,
                "storage_provider": storage_provider,
            }
        )
        if self.fail_download:
            raise RuntimeError(f"download failed for {storage_key}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"input")
        return destination

    def upload_file(
        self,
        local_path,
        storage_key,
        asset_type,
        bucket_name=None,
        storage_provider=None,
    ):
        self.uploads.append(
            {
                "local_path": local_path,
                "storage_key": storage_key,
                "asset_type": asset_type,
                "bucket_name": bucket_name,
                "storage_provider": storage_provider or "tencent_cos",
            }
        )
        if self.fail_upload_asset_type == asset_type:
            raise RuntimeError(f"upload failed for {storage_key}")
        return UploadedAsset(
            asset_type=asset_type,
            storage_provider=storage_provider or "tencent_cos",
            bucket_name=bucket_name or "output-bucket",
            storage_key=storage_key,
            mime_type="video/mp4" if asset_type == "video" else "application/octet-stream",
            file_size_bytes=local_path.stat().st_size,
            etag="etag",
            local_path=local_path,
        )


class FakeOpenStorylineClient:
    def __init__(
        self,
        missing_outputs=None,
        fail_run=False,
        progress_events=None,
        failure_message="engine unavailable",
        voiceover_payload=None,
    ) -> None:
        self.missing_outputs = set(missing_outputs or [])
        self.fail_run = fail_run
        self.progress_events = list(progress_events or [])
        self.failure_message = failure_message
        self.progress_callback_seen = False
        self.voiceover_payload = voiceover_payload
        self.last_input_assets = None

    def run_job(self, job, directive, input_assets, workspace_dir, output_dir, progress_callback=None):
        self.last_input_assets = input_assets
        if progress_callback is not None:
            self.progress_callback_seen = True
            for event in self.progress_events:
                progress_callback(event)

        if self.fail_run:
            raise RuntimeError(self.failure_message)

        output_dir.mkdir(parents=True, exist_ok=True)
        final_video_path = output_dir / "final.mp4"
        cover_image_path = output_dir / "cover.jpg"
        subtitle_path = output_dir / "subtitles.srt"
        metadata_path = output_dir / "run-metadata.json"

        for name, path in {
            "final_video": final_video_path,
            "cover": cover_image_path,
            "subtitles": subtitle_path,
            "metadata": metadata_path,
        }.items():
            if name not in self.missing_outputs:
                path.write_bytes(b"output")

        voiceover_payload = self.voiceover_payload
        if voiceover_payload is None:
            voiceover_payload = {"provider": "bytedance_bigtts"}

        return EngineRunResult(
            final_video_path=final_video_path,
            cover_image_path=cover_image_path,
            subtitle_path=subtitle_path,
            metadata_path=metadata_path,
            raw_response={
                "engine": "fire_red-openstoryline",
                "engine_adapter": "fire_red",
                "fire_red": {"session_id": "fire-red-session"},
                "openstoryline": {
                    "session_id": "fire-red-session",
                    "production_config_used": {
                        "voiceover": {"provider": "bytedance_bigtts"},
                    },
                    "selected_bgm": {"name": "light_upbeat_01"},
                    "voiceover": voiceover_payload,
                },
                "fire_red_raw_response": {
                    "generate_voiceover": voiceover_payload,
                },
            },
        )


class ProcessorContractTests(unittest.TestCase):
    def test_non_object_input_payload_marks_failed_manual_without_download(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            processor.process(make_job([]))

        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertIn("invalid_input_payload", repository.failed["failure_reason"])
        self.assertEqual([], cos_client.downloads)

    def test_invalid_input_asset_contract_marks_failed_manual_without_engine_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            engine_client = FakeOpenStorylineClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                engine_client,
            )
            job = make_job(
                {
                    "script": {"text": "固定脚本", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "input_assets": [{"asset_type": "video"}],
                }
            )

            processor.process(job)

        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertIn("invalid_input_assets", repository.failed["failure_reason"])
        self.assertEqual([], cos_client.downloads)

    def test_voice_profile_reference_audio_is_downloaded_and_summarized(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            engine_client = FakeOpenStorylineClient(
                voiceover_payload={
                    "provider": "pixelle_clone",
                    "voiceover": [
                        {
                            "voiceover_id": "voiceover_0001",
                            "duration": 1200,
                            "duration_ms": 1200,
                            "provider": "pixelle_clone",
                            "clone": True,
                        }
                    ],
                }
            )
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                engine_client,
            )
            job = make_job(
                {
                    "script": {"text": "locked script", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "productionConfig": {
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                            "voiceProfileId": "profile-1",
                            "refAudioAssetId": "asset-1",
                            "refAudioAsset": {
                                "storage_key": "voice-profiles/merchant/profile/ref.wav",
                                "bucket_name": "voice-bucket",
                                "storage_provider": "tencent_cos",
                            },
                        }
                    },
                }
            )

            processor.process(job)

        self.assertIsNone(repository.failed)
        self.assertEqual(
            "voice-profiles/merchant/profile/ref.wav",
            cos_client.downloads[0]["storage_key"],
        )
        self.assertEqual("voice-bucket", cos_client.downloads[0]["bucket_name"])
        self.assertEqual(
            "voice_profile",
            repository.succeeded["result_payload"]["voiceover_artifacts"]["mode"],
        )
        self.assertEqual(
            "profile-1",
            repository.succeeded["result_payload"]["voiceover_artifacts"]["voice_profile_id"],
        )
        self.assertEqual(
            1,
            repository.succeeded["result_payload"]["voiceover_artifacts"]["segment_count"],
        )

    def test_voice_profile_job_fails_when_clone_voiceover_artifacts_are_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(voiceover_payload={"provider": "minimax"}),
            )
            job = make_job(
                {
                    "script": {"text": "locked script", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "productionConfig": {
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                            "voiceProfileId": "profile-1",
                            "refAudioAssetId": "asset-1",
                            "refAudioAsset": {
                                "storage_key": "voice-profiles/merchant/profile/ref.wav",
                                "storage_provider": "tencent_cos",
                            },
                        }
                    },
                }
            )

            processor.process(job)

        self.assertIsNone(repository.succeeded)
        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertEqual("voiceover_artifact_validation_failed", repository.failed["current_stage"])
        self.assertIn("voiceover_clone_artifacts_missing", repository.failed["failure_reason"])

    def test_voice_profile_job_fails_when_non_clone_provider_was_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(
                    voiceover_payload={
                        "provider": "minimax",
                        "voiceover": [
                            {"duration": 1200, "provider": "minimax"},
                        ],
                    }
                ),
            )
            job = make_job(
                {
                    "script": {"text": "locked script", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "productionConfig": {
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                            "voiceProfileId": "profile-1",
                            "refAudioAssetId": "asset-1",
                            "refAudioAsset": {
                                "storage_key": "voice-profiles/merchant/profile/ref.wav",
                                "storage_provider": "tencent_cos",
                            },
                        }
                    },
                }
            )

            processor.process(job)

        self.assertIsNone(repository.succeeded)
        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertIn("voiceover_clone_provider_not_used", repository.failed["failure_reason"])

    def test_voice_profile_original_audio_job_allows_middle_clone_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(
                    voiceover_payload={
                        "provider": "pixelle_clone",
                        "voiceover": [],
                        "skipped_voiceover": [
                            {"group_id": "group_0001", "reason": "original_video_audio"},
                            {"group_id": "group_0005", "reason": "original_video_audio"},
                        ],
                    }
                ),
            )
            job = make_job(
                {
                    "script": {"text": "locked script", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "productionConfig": {
                        "voiceover": {
                            "enabled": True,
                            "mode": "voice_profile",
                            "provider": "pixelle_clone",
                            "voiceProfileId": "profile-1",
                            "refAudioAssetId": "asset-1",
                            "refAudioAsset": {
                                "storage_key": "voice-profiles/merchant/profile/ref.wav",
                                "storage_provider": "tencent_cos",
                            },
                        },
                        "render": {
                            "preserveTalkingHeadOriginalAudio": True,
                        },
                    },
                }
            )

            processor.process(job)

        self.assertIsNone(repository.failed)
        self.assertIsNotNone(repository.succeeded)
        self.assertEqual(
            ["pixelle_clone"],
            repository.succeeded["result_payload"]["voiceover_artifacts"]["providers"],
        )

    def test_falsey_non_list_input_assets_marks_failed_manual_without_download(self):
        for input_assets in ("", 0, False):
            with self.subTest(input_assets=input_assets):
                with tempfile.TemporaryDirectory() as tmp:
                    repository = FakeRepository()
                    cos_client = FakeCosClient()
                    processor = JobProcessor(
                        Settings(Path(tmp)),
                        repository,
                        cos_client,
                        FakeOpenStorylineClient(),
                    )
                    job = make_job(
                        {
                            "script": {"text": "固定脚本", "locked": True},
                            "productionDirective": {"desiredOutputs": ["final_video"]},
                            "input_assets": input_assets,
                        }
                    )

                    processor.process(job)

                self.assertEqual("failed_manual", repository.failed["status"])
                self.assertIn("invalid_input_assets", repository.failed["failure_reason"])
                self.assertEqual([], cos_client.downloads)

    def test_download_failure_marks_failed_retryable_with_diagnostic_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient(fail_download=True)
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertEqual("downloading_inputs_failed", repository.failed["current_stage"])
        self.assertIn("input_download_failed", repository.failed["failure_reason"])
        self.assertIsNone(repository.succeeded)

    def test_input_asset_metadata_is_preserved_for_talking_head_classification(self):
        with tempfile.TemporaryDirectory() as tmp:
            engine_client = FakeOpenStorylineClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                FakeRepository(),
                FakeCosClient(),
                engine_client,
            )
            job = make_job(
                {
                    "script": {"text": "locked script", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "input_assets": [
                        {
                            "asset_type": "video",
                            "storage_provider": "tencent_cos",
                            "storage_key": "draft-inputs/demo.mp4",
                            "file_name": "demo.mp4",
                            "role": "talking_head",
                            "scene_type": "真人口播",
                            "tags": ["talking_head"],
                            "labels": ["真人口播"],
                            "metadata": {"content_type": "talking_head"},
                        }
                    ],
                }
            )

            processor.process(job)

        self.assertEqual("talking_head", engine_client.last_input_assets[0]["role"])
        self.assertEqual(["talking_head"], engine_client.last_input_assets[0]["tags"])
        self.assertEqual(
            {"content_type": "talking_head"},
            engine_client.last_input_assets[0]["metadata"],
        )

    def test_engine_run_failure_marks_failed_retryable_with_diagnostic_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(fail_run=True),
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertEqual("openstoryline_rendering_failed", repository.failed["current_stage"])
        self.assertIn("engine_run_failed", repository.failed["failure_reason"])
        self.assertIsNone(repository.succeeded)
        self.assertEqual([], cos_client.uploads)

    def test_engine_run_failure_after_render_event_marks_render_module_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            engine_client = FakeOpenStorylineClient(
                fail_run=True,
                progress_events=[
                    {
                        "type": "tool_end",
                        "server": "storyline",
                        "name": "render_video",
                        "is_error": True,
                        "summary": "Tool call failed: ConnectError",
                    }
                ],
                failure_message=(
                    "worker run failed: ExceptionGroup: unhandled errors; "
                    "root_cause=ConnectError: All connection attempts failed; "
                    "last_tool=render_video"
                ),
            )
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                engine_client,
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertTrue(engine_client.progress_callback_seen)
        failed_modules = repository.failed["log_payload"]["progress_modules"]
        render_module = next(item for item in failed_modules if item["key"] == "render")
        self.assertEqual("failed", render_module["status"])
        self.assertIn("last_tool=render_video", repository.failed["failure_reason"])
        failure_step = repository.failed["log_payload"]["steps"][-1]
        self.assertEqual("render", failure_step["active_module"])
        self.assertIn("ConnectError", failure_step["openstoryline_progress"]["last_event"]["summary"])

    def test_engine_run_failure_after_voiceover_event_marks_voiceover_module_failed(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            engine_client = FakeOpenStorylineClient(
                fail_run=True,
                progress_events=[
                    {
                        "type": "tool_end",
                        "server": "storyline",
                        "name": "generate_voiceover",
                        "is_error": True,
                        "summary": "runninghub submit returned no task id or audio: errorCode 1014",
                    }
                ],
                failure_message=(
                    "worker run failed: RuntimeError: clone voiceover failed before render completion; "
                    "root_cause=RuntimeError: runninghub errorCode 1014; "
                    "last_tool=generate_voiceover"
                ),
            )
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                engine_client,
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertEqual("openstoryline_rendering_failed", repository.failed["current_stage"])
        self.assertIn("generate_voiceover", repository.failed["failure_reason"])
        failure_step = repository.failed["log_payload"]["steps"][-1]
        self.assertEqual("voiceover", failure_step["active_module"])
        self.assertIn("errorCode 1014", failure_step["openstoryline_progress"]["last_event"]["summary"])

    def test_unsafe_input_asset_file_name_marks_failed_manual_without_download(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )
            job = make_job(
                {
                    "script": {"text": "固定脚本", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "input_assets": [
                        {
                            "asset_type": "video",
                            "storage_key": "draft-inputs/demo.mp4",
                            "file_name": "../demo.mp4",
                        }
                    ],
                }
            )

            processor.process(job)

        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertIn("invalid_input_assets", repository.failed["failure_reason"])
        self.assertEqual([], cos_client.downloads)

    def test_unsupported_input_asset_storage_provider_marks_failed_manual_without_download(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )
            job = make_job(
                {
                    "script": {"text": "固定脚本", "locked": True},
                    "productionDirective": {"desiredOutputs": ["final_video"]},
                    "input_assets": [
                        {
                            "asset_type": "video",
                            "storage_provider": "s3",
                            "storage_key": "draft-inputs/demo.mp4",
                            "file_name": "demo.mp4",
                        }
                    ],
                }
            )

            processor.process(job)

        self.assertIsNotNone(repository.failed)
        self.assertEqual("failed_manual", repository.failed["status"])
        self.assertIn("invalid_input_assets", repository.failed["failure_reason"])
        self.assertEqual([], cos_client.downloads)

    def test_malformed_input_asset_bucket_name_marks_failed_manual_without_download(self):
        for bucket_name in ("", " ", 123):
            with self.subTest(bucket_name=bucket_name):
                with tempfile.TemporaryDirectory() as tmp:
                    repository = FakeRepository()
                    cos_client = FakeCosClient()
                    processor = JobProcessor(
                        Settings(Path(tmp)),
                        repository,
                        cos_client,
                        FakeOpenStorylineClient(),
                    )
                    job = make_job(
                        {
                            "script": {"text": "固定脚本", "locked": True},
                            "productionDirective": {"desiredOutputs": ["final_video"]},
                            "input_assets": [
                                {
                                    "asset_type": "video",
                                    "storage_provider": "tencent_cos",
                                    "bucket_name": bucket_name,
                                    "storage_key": "draft-inputs/demo.mp4",
                                    "file_name": "demo.mp4",
                                }
                            ],
                        }
                    )

                    processor.process(job)

                self.assertIsNotNone(repository.failed)
                self.assertEqual("failed_manual", repository.failed["status"])
                self.assertIn("invalid_input_assets", repository.failed["failure_reason"])
                self.assertEqual([], cos_client.downloads)

    def test_missing_requested_output_marks_failed_retryable_before_upload(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(missing_outputs={"subtitles"}),
            )

            processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertIn("missing_output_files", repository.failed["failure_reason"])
        self.assertIsNone(repository.succeeded)
        self.assertEqual([], cos_client.uploads)

    def test_success_result_payload_records_outputs_and_engine_adapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(),
            )

            processor.process(make_job())

        result_payload = repository.succeeded["result_payload"]
        self.assertEqual("fire_red-openstoryline", result_payload["engine"])
        self.assertEqual("fire_red", result_payload["engine_adapter"])
        self.assertEqual("staging_worker", result_payload["execution_mode"])
        self.assertEqual(
            "video-results/merchant_1/job_1/final.mp4",
            result_payload["outputs"]["final_video"],
        )
        self.assertEqual(
            "video-results/merchant_1/job_1/cover.jpg",
            result_payload["outputs"]["cover"],
        )
        self.assertEqual(
            "video-results/merchant_1/job_1/subtitles.srt",
            result_payload["outputs"]["subtitles"],
        )
        self.assertEqual("asset_video_1", result_payload["uploaded_assets"][0]["asset_id"])
        self.assertEqual("fire_red", result_payload["openstoryline"]["engine_adapter"])
        self.assertEqual("fire-red-session", result_payload["openstoryline"]["session_id"])
        self.assertEqual(
            {"provider": "bytedance_bigtts"},
            result_payload["openstoryline"]["voiceover"],
        )
        self.assertEqual(
            "succeeded",
            result_payload["progress_modules"][0]["status"],
        )
        self.assertEqual(
            "素材准备",
            result_payload["progress_modules"][0]["label"],
        )
        self.assertTrue(
            any(
                item["key"] == "render" and item["label"] == "合成渲染"
                for item in result_payload["progress_modules"]
            )
        )

    def test_aliyun_input_and_output_provider_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                AliyunSettings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )
            job = make_job(
                {
                    "source": "video_workbench",
                    "executionMode": "staging_worker",
                    "script": {
                        "text": "固定脚本，不允许制作层改写。",
                        "locked": True,
                        "variantId": "variant_1",
                    },
                    "productionDirective": {
                        "targetPlatform": "douyin",
                        "aspectRatio": "9:16",
                        "desiredOutputs": ["final_video"],
                        "lockedFields": ["script", "cta"],
                    },
                    "input_assets": [
                        {
                            "asset_type": "video",
                            "storage_provider": "aliyun_oss",
                            "bucket_name": "jingjing-domestic-phase1-hz",
                            "storage_key": "draft-inputs/demo.mp4",
                            "file_name": "demo.mp4",
                        }
                    ],
                }
            )

            processor.process(job)

        self.assertEqual("aliyun_oss", cos_client.downloads[0]["storage_provider"])
        self.assertEqual("aliyun_oss", cos_client.uploads[0]["storage_provider"])
        result_payload = repository.succeeded["result_payload"]
        self.assertEqual("aliyun_oss", result_payload["upload_mode"])
        self.assertEqual(
            "aliyun_oss",
            result_payload["uploaded_assets"][0]["storage_provider"],
        )

    def test_missing_input_asset_provider_uses_configured_aliyun_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                AliyunSettings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            processor.process(make_job_without_input_bucket())

        self.assertEqual("aliyun_oss", cos_client.downloads[0]["storage_provider"])
        self.assertEqual("default-aliyun-bucket", cos_client.downloads[0]["bucket_name"])
        self.assertEqual("aliyun_oss", cos_client.uploads[0]["storage_provider"])

    def test_missing_input_asset_provider_keeps_legacy_cos_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            processor.process(make_job_without_input_bucket())

        self.assertEqual("tencent_cos", cos_client.downloads[0]["storage_provider"])
        self.assertEqual("default-bucket", cos_client.downloads[0]["bucket_name"])

    def test_stage_updates_include_progress_modules(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(),
            )

            processor.process(make_job())

        self.assertEqual("downloading_inputs", repository.stage_updates[0]["current_stage"])
        first_modules = repository.stage_updates[0]["runtime_payload"]["progress_modules"]
        self.assertEqual("material_preparation", first_modules[0]["key"])
        self.assertEqual("running", first_modules[0]["status"])
        self.assertEqual("素材准备", first_modules[0]["label"])

    def test_openstoryline_progress_events_update_active_module(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            engine_client = FakeOpenStorylineClient(
                progress_events=[
                    {
                        "type": "tool_start",
                        "server": "openstoryline",
                        "name": "generate_voiceover",
                        "tool_call_id": "tool_1",
                    },
                    {
                        "type": "tool_start",
                        "server": "openstoryline",
                        "name": "render_video",
                        "tool_call_id": "tool_2",
                    },
                ],
            )
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                FakeCosClient(),
                engine_client,
            )

            processor.process(make_job())

        self.assertTrue(engine_client.progress_callback_seen)
        self.assertTrue(
            any(update["current_stage"] == "openstoryline_voiceover" for update in repository.stage_updates)
        )
        render_update = next(
            update
            for update in repository.stage_updates
            if update["current_stage"] == "openstoryline_render"
        )
        modules = render_update["runtime_payload"]["progress_modules"]
        render_module = next(item for item in modules if item["key"] == "render")
        self.assertEqual("running", render_module["status"])
        self.assertEqual("合成渲染", render_module["label"])
        self.assertIn("render_video", render_module["detail"])

    def test_success_cleans_local_workspace_and_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(root),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(),
            )

            processor.process(make_job())

            self.assertFalse((root / "tmp" / "jobs" / "job_1").exists())
            self.assertFalse((root / "outputs" / "jobs" / "job_1").exists())
            self.assertIsNotNone(repository.succeeded)

    def test_retryable_failure_cleans_local_workspace_and_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repository = FakeRepository()
            processor = JobProcessor(
                Settings(root),
                repository,
                FakeCosClient(),
                FakeOpenStorylineClient(missing_outputs={"subtitles"}),
            )

            processor.process(make_job())

            self.assertFalse((root / "tmp" / "jobs" / "job_1").exists())
            self.assertFalse((root / "outputs" / "jobs" / "job_1").exists())
            self.assertEqual("failed_retryable", repository.failed["status"])

    def test_upload_failure_marks_failed_retryable_with_diagnostic_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient(fail_upload_asset_type="cover")
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertEqual("uploading_outputs_failed", repository.failed["current_stage"])
        self.assertIn("OUTPUT_UPLOAD_FAILED", repository.failed["failure_reason"])
        self.assertIsNone(repository.succeeded)

    def test_asset_object_insert_failure_marks_failed_retryable_with_diagnostic_stage(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository(fail_insert_output_assets=True)
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )

            with self.assertRaises(RuntimeError):
                processor.process(make_job())

        self.assertEqual("failed_retryable", repository.failed["status"])
        self.assertEqual("asset_objects_persistence_failed", repository.failed["current_stage"])
        self.assertIn("asset_objects_insert_failed", repository.failed["failure_reason"])
        self.assertIsNone(repository.succeeded)
        self.assertEqual(["video", "cover", "subtitle"], [upload["asset_type"] for upload in cos_client.uploads])

    def test_final_video_only_job_does_not_upload_unrequested_cover_or_subtitles(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = FakeRepository()
            cos_client = FakeCosClient()
            processor = JobProcessor(
                Settings(Path(tmp)),
                repository,
                cos_client,
                FakeOpenStorylineClient(),
            )
            job = make_job(
                {
                    "source": "video_workbench",
                    "executionMode": "staging_worker",
                    "script": {
                        "text": "固定脚本，只需要成片。",
                        "locked": True,
                        "variantId": "variant_1",
                    },
                    "productionDirective": {
                        "targetPlatform": "douyin",
                        "aspectRatio": "9:16",
                        "desiredOutputs": ["final_video"],
                        "lockedFields": ["script", "cta"],
                    },
                    "input_assets": [],
                }
            )

            processor.process(job)

        uploaded_asset_types = [upload["asset_type"] for upload in cos_client.uploads]
        inserted_asset_types = [asset.asset_type for asset in repository.inserted_assets]
        result_payload = repository.succeeded["result_payload"]

        self.assertEqual(["video"], uploaded_asset_types)
        self.assertEqual(["video"], inserted_asset_types)
        self.assertEqual(
            {"final_video": "video-results/merchant_1/job_1/final.mp4"},
            result_payload["outputs"],
        )
        self.assertEqual(["video"], [asset["asset_type"] for asset in result_payload["uploaded_assets"]])


if __name__ == "__main__":
    unittest.main()
