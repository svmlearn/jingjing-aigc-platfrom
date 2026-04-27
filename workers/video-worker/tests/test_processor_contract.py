import tempfile
import unittest
import sys
import types
from pathlib import Path

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

from worker.app.models import EngineRunResult, UploadedAsset, VideoJob
from worker.app.processor import JobProcessor


class Settings:
    cos_bucket = "default-bucket"

    def __init__(self, root: Path) -> None:
        self.worker_temp_root = root / "tmp"
        self.worker_output_root = root / "outputs"


def make_job(input_payload=None):
    return VideoJob(
        id="job_1",
        merchant_id="merchant_1",
        draft_id="draft_1",
        content_variant_id="variant_1",
        status="pending",
        current_stage=None,
        instruction_text="make a video",
        input_payload=input_payload
        or {
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
        },
        runtime_payload={},
        retry_count=0,
    )


class FakeRepository:
    def __init__(self) -> None:
        self.stage_updates = []
        self.failed = None
        self.succeeded = None
        self.inserted_assets = []

    def update_stage(self, job_id, **kwargs):
        self.stage_updates.append({"job_id": job_id, **kwargs})

    def mark_failed(self, job_id, **kwargs):
        self.failed = {"job_id": job_id, **kwargs}

    def mark_succeeded(self, job_id, **kwargs):
        self.succeeded = {"job_id": job_id, **kwargs}

    def insert_output_assets(self, job, uploaded_assets):
        self.inserted_assets.extend(uploaded_assets)
        return [
            {
                "asset_id": f"asset_{asset.asset_type}_1",
                "asset_type": asset.asset_type,
                "bucket_name": asset.bucket_name,
                "storage_key": asset.storage_key,
                "mime_type": asset.mime_type,
                "etag": asset.etag,
                "file_size_bytes": asset.file_size_bytes,
            }
            for asset in uploaded_assets
        ]


class FakeCosClient:
    def __init__(self) -> None:
        self.downloads = []
        self.uploads = []

    def download_file(self, storage_key, destination, bucket_name=None):
        self.downloads.append(
            {
                "storage_key": storage_key,
                "destination": destination,
                "bucket_name": bucket_name,
            }
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"input")
        return destination

    def upload_file(self, local_path, storage_key, asset_type, bucket_name=None):
        self.uploads.append(
            {
                "local_path": local_path,
                "storage_key": storage_key,
                "asset_type": asset_type,
                "bucket_name": bucket_name,
            }
        )
        return UploadedAsset(
            asset_type=asset_type,
            bucket_name=bucket_name or "output-bucket",
            storage_key=storage_key,
            mime_type="video/mp4" if asset_type == "video" else "application/octet-stream",
            file_size_bytes=local_path.stat().st_size,
            etag="etag",
            local_path=local_path,
        )


class FakeOpenStorylineClient:
    def __init__(self, missing_outputs=None) -> None:
        self.missing_outputs = set(missing_outputs or [])

    def run_job(self, job, directive, input_assets, workspace_dir, output_dir):
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

        return EngineRunResult(
            final_video_path=final_video_path,
            cover_image_path=cover_image_path,
            subtitle_path=subtitle_path,
            metadata_path=metadata_path,
            raw_response={
                "engine": "openstoryline-skeleton",
                "engine_adapter": "skeleton",
            },
        )


class ProcessorContractTests(unittest.TestCase):
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
        self.assertEqual("openstoryline-skeleton", result_payload["engine"])
        self.assertEqual("skeleton", result_payload["engine_adapter"])
        self.assertEqual("staging_worker", result_payload["execution_mode"])
        self.assertEqual(
            "video-outputs/merchant_1/draft_1/variant_1/job_1/final.mp4",
            result_payload["outputs"]["final_video"],
        )
        self.assertEqual(
            "video-covers/merchant_1/draft_1/variant_1/job_1/cover.jpg",
            result_payload["outputs"]["cover"],
        )
        self.assertEqual(
            "video-subtitles/merchant_1/draft_1/variant_1/job_1/subtitles.srt",
            result_payload["outputs"]["subtitles"],
        )
        self.assertEqual("asset_video_1", result_payload["uploaded_assets"][0]["asset_id"])


if __name__ == "__main__":
    unittest.main()
