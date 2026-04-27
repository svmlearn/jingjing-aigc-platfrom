from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .config import Settings
from .cos_client import TencentCosClient
from .db import VideoJobRepository
from .directive import DirectiveValidationError, build_production_directive
from .models import UploadedAsset, VideoJob
from .openstoryline_client import OpenStorylineClient


class JobProcessor:
    def __init__(
        self,
        settings: Settings,
        repository: VideoJobRepository,
        cos_client: TencentCosClient,
        openstoryline_client: OpenStorylineClient,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._cos_client = cos_client
        self._openstoryline_client = openstoryline_client

    def _workspace_for(self, job: VideoJob) -> tuple[Path, Path, Path]:
        job_temp_dir = self._settings.worker_temp_root / "jobs" / job.id
        input_dir = job_temp_dir / "inputs"
        output_dir = self._settings.worker_output_root / "jobs" / job.id
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        return job_temp_dir, input_dir, output_dir

    def _download_inputs(self, job: VideoJob, input_dir: Path) -> list[dict[str, str]]:
        downloaded_assets: list[dict[str, str]] = []
        for asset in job.input_assets(self._settings.cos_bucket):
            local_path = input_dir / asset.file_name
            self._cos_client.download_file(
                storage_key=asset.storage_key,
                destination=local_path,
                bucket_name=asset.bucket_name,
            )
            downloaded_assets.append(
                {
                    "asset_type": asset.asset_type,
                    "file_name": asset.file_name,
                    "local_path": str(local_path),
                }
            )
        return downloaded_assets

    def _upload_outputs(
        self,
        job: VideoJob,
        final_video_path: Path,
        cover_image_path: Path | None,
        subtitle_path: Path | None,
    ) -> list[UploadedAsset]:
        uploaded_assets = [
            self._cos_client.upload_file(
                local_path=final_video_path,
                storage_key=job.output_object_key("video"),
                asset_type="video",
            )
        ]
        if cover_image_path and cover_image_path.exists():
            uploaded_assets.append(
                self._cos_client.upload_file(
                    local_path=cover_image_path,
                    storage_key=job.output_object_key("cover"),
                    asset_type="cover",
                )
            )
        if subtitle_path and subtitle_path.exists():
            uploaded_assets.append(
                self._cos_client.upload_file(
                    local_path=subtitle_path,
                    storage_key=job.output_object_key("subtitle"),
                    asset_type="subtitle",
                )
            )
        return uploaded_assets

    def process(self, job: VideoJob) -> None:
        log_payload: dict[str, Any] = {"steps": []}
        try:
            directive = build_production_directive(job)
        except DirectiveValidationError as exc:
            log_payload["steps"].append(
                {
                    "stage": "directive_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="directive_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload=log_payload,
                status=exc.failure_status,
            )
            return

        workspace_dir, input_dir, output_dir = self._workspace_for(job)
        log_payload["steps"].append(
            {
                "stage": "directive_validation",
                "status": "succeeded",
                "execution_mode": directive.execution_mode,
                "desired_outputs": list(directive.desired_outputs),
                "locked_fields": list(directive.locked_fields),
            }
        )
        self._repository.update_stage(
            job.id,
            status="preparing",
            current_stage="downloading_inputs",
            progress_pct=10,
            runtime_payload={"workspace_dir": str(workspace_dir), "output_dir": str(output_dir)},
            log_payload=log_payload,
        )
        try:
            input_assets = self._download_inputs(job, input_dir)
            log_payload["steps"].append(
                {
                    "stage": "downloading_inputs",
                    "inputs_downloaded": len(input_assets),
                }
            )
            self._repository.update_stage(
                job.id,
                status="running",
                current_stage="openstoryline_rendering",
                progress_pct=50,
                runtime_payload={
                    "workspace_dir": str(workspace_dir),
                    "output_dir": str(output_dir),
                    "input_assets": input_assets,
                },
                log_payload=log_payload,
            )
            run_result = self._openstoryline_client.run_job(
                job=job,
                directive=directive,
                input_assets=input_assets,
                workspace_dir=workspace_dir,
                output_dir=output_dir,
            )
            log_payload["steps"].append(
                {
                    "stage": "openstoryline_rendering",
                    "metadata_path": str(run_result.metadata_path),
                }
            )
            self._repository.update_stage(
                job.id,
                status="running",
                current_stage="uploading_outputs",
                progress_pct=80,
                log_payload=log_payload,
            )
            uploaded_assets = self._upload_outputs(
                job=job,
                final_video_path=run_result.final_video_path,
                cover_image_path=run_result.cover_image_path,
                subtitle_path=run_result.subtitle_path,
            )
            self._repository.insert_output_assets(job, uploaded_assets)
            log_payload["steps"].append(
                {
                    "stage": "uploading_outputs",
                    "uploaded_assets": [
                        {
                            "asset_type": asset.asset_type,
                            "storage_key": asset.storage_key,
                            "bucket_name": asset.bucket_name,
                        }
                        for asset in uploaded_assets
                    ],
                }
            )
            self._repository.mark_succeeded(
                job.id,
                result_payload={
                    "engine": "openstoryline-skeleton",
                    "execution_mode": directive.execution_mode,
                    "script_locked": directive.script_locked,
                    "desired_outputs": list(directive.desired_outputs),
                    "uploaded_assets": [
                        {
                            "asset_type": asset.asset_type,
                            "bucket_name": asset.bucket_name,
                            "storage_key": asset.storage_key,
                            "mime_type": asset.mime_type,
                            "etag": asset.etag,
                            "file_size_bytes": asset.file_size_bytes,
                        }
                        for asset in uploaded_assets
                    ],
                    "engine_response": run_result.raw_response,
                },
                log_payload=log_payload,
            )
        except Exception as exc:
            log_payload["steps"].append(
                {
                    "stage": "failed",
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="failed",
                failure_reason=str(exc),
                log_payload=log_payload,
            )
            raise
        finally:
            shutil.rmtree(workspace_dir, ignore_errors=True)
