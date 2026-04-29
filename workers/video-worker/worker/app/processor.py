from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from .config import Settings
from .cos_client import TencentCosClient
from .db import VideoJobRepository
from .directive import DirectiveValidationError, build_production_directive
from .models import EngineRunResult, InputAssetContractError, UploadedAsset, VideoJob
from .openstoryline_client import OpenStorylineClient


class OutputValidationError(RuntimeError):
    def __init__(
        self,
        missing_outputs: list[str],
        *,
        failure_code: str = "missing_output_files",
        failure_status: str = "failed_retryable",
    ) -> None:
        self.missing_outputs = missing_outputs
        self.failure_code = failure_code
        self.failure_status = failure_status
        super().__init__(f"missing output files: {', '.join(missing_outputs)}")


class InputDownloadError(RuntimeError):
    def __init__(self, storage_key: str, original_error: Exception) -> None:
        self.storage_key = storage_key
        super().__init__(f"failed to download input asset {storage_key}: {original_error}")


class EngineRunError(RuntimeError):
    def __init__(self, original_error: Exception) -> None:
        super().__init__(f"failed to run OpenStoryline engine: {original_error}")


class OutputUploadError(RuntimeError):
    def __init__(self, storage_key: str, original_error: Exception) -> None:
        self.storage_key = storage_key
        super().__init__(f"failed to upload output asset {storage_key}: {original_error}")


class OutputAssetPersistenceError(RuntimeError):
    def __init__(self, original_error: Exception) -> None:
        super().__init__(f"failed to persist generated asset_objects: {original_error}")


def _dict_or_empty(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _nested_dict(source: dict[str, Any], *keys: str) -> dict[str, Any]:
    for key in keys:
        value = source.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _openstoryline_result_payload(
    raw_response: dict[str, Any],
    production_config: dict[str, Any],
) -> dict[str, Any]:
    openstoryline = _nested_dict(raw_response, "openstoryline")
    fire_red = _nested_dict(raw_response, "fire_red")
    selected_bgm = _nested_dict(openstoryline, "selected_bgm", "bgm") or _nested_dict(
        fire_red,
        "selected_bgm",
        "bgm",
    )
    voiceover = _nested_dict(openstoryline, "voiceover") or _nested_dict(
        fire_red,
        "voiceover",
    )
    production_config_used = _dict_or_empty(
        openstoryline.get("production_config_used")
    ) or production_config

    return {
        "engine_adapter": openstoryline.get("engine_adapter")
        or raw_response.get("engine_adapter")
        or "unknown",
        "session_id": openstoryline.get("session_id") or fire_red.get("session_id"),
        "production_config_used": production_config_used,
        "selected_bgm": selected_bgm,
        "voiceover": voiceover,
    }


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
            try:
                self._cos_client.download_file(
                    storage_key=asset.storage_key,
                    destination=local_path,
                    bucket_name=asset.bucket_name,
                )
            except Exception as exc:
                raise InputDownloadError(asset.storage_key, exc) from exc
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
        desired_outputs: tuple[str, ...],
        final_video_path: Path,
        cover_image_path: Path | None,
        subtitle_path: Path | None,
    ) -> list[UploadedAsset]:
        def upload(local_path: Path, asset_type: str) -> UploadedAsset:
            storage_key = job.output_object_key(
                asset_type,
                self._settings.cos_result_prefix,
            )
            try:
                return self._cos_client.upload_file(
                    local_path=local_path,
                    storage_key=storage_key,
                    asset_type=asset_type,
                )
            except Exception as exc:
                raise OutputUploadError(storage_key, exc) from exc

        uploaded_assets = [
            upload(final_video_path, "video")
        ]
        if "cover" in desired_outputs and cover_image_path and cover_image_path.exists():
            uploaded_assets.append(upload(cover_image_path, "cover"))
        if "subtitles" in desired_outputs and subtitle_path and subtitle_path.exists():
            uploaded_assets.append(upload(subtitle_path, "subtitle"))
        return uploaded_assets

    def _validate_outputs(
        self,
        desired_outputs: tuple[str, ...],
        run_result: EngineRunResult,
    ) -> None:
        required_paths = {"final_video": run_result.final_video_path}
        if "cover" in desired_outputs:
            required_paths["cover"] = run_result.cover_image_path
        if "subtitles" in desired_outputs:
            required_paths["subtitles"] = run_result.subtitle_path

        missing_outputs = [
            output_name
            for output_name, output_path in required_paths.items()
            if output_path is None or not output_path.is_file()
        ]
        if missing_outputs:
            if "final_video" in missing_outputs:
                raise OutputValidationError(
                    missing_outputs,
                    failure_code="FINAL_VIDEO_MISSING",
                    failure_status="failed_manual",
                )
            raise OutputValidationError(missing_outputs)

    def _cos_output_configured(self) -> bool:
        return bool(getattr(self._settings, "cos_output_configured", True))

    def _local_outputs_payload(self, run_result: EngineRunResult) -> dict[str, str | None]:
        return {
            "final_video_path": str(run_result.final_video_path),
            "cover_image_path": str(run_result.cover_image_path)
            if run_result.cover_image_path
            else None,
            "subtitle_path": str(run_result.subtitle_path)
            if run_result.subtitle_path
            else None,
            "metadata_path": str(run_result.metadata_path),
        }

    def _outputs_payload(self, uploaded_assets: list[UploadedAsset]) -> dict[str, str]:
        output_keys = {"video": "final_video", "cover": "cover", "subtitle": "subtitles"}
        return {
            output_keys[asset.asset_type]: asset.storage_key
            for asset in uploaded_assets
            if asset.asset_type in output_keys
        }

    def _uploaded_assets_payload(
        self,
        uploaded_assets: list[UploadedAsset],
        persisted_assets: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if persisted_assets is not None:
            return persisted_assets
        return [
            {
                "asset_type": asset.asset_type,
                "bucket_name": asset.bucket_name,
                "storage_provider": "tencent_cos",
                "storage_key": asset.storage_key,
                "mime_type": asset.mime_type,
                "etag": asset.etag,
                "file_size_bytes": asset.file_size_bytes,
            }
            for asset in uploaded_assets
        ]

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
        run_result: EngineRunResult | None = None
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
            try:
                run_result = self._openstoryline_client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=input_assets,
                    workspace_dir=workspace_dir,
                    output_dir=output_dir,
                )
            except Exception as exc:
                raise EngineRunError(exc) from exc
            log_payload["steps"].append(
                {
                    "stage": "openstoryline_rendering",
                    "metadata_path": str(run_result.metadata_path),
                }
            )
            self._validate_outputs(directive.desired_outputs, run_result)
            log_payload["steps"].append(
                {
                    "stage": "output_validation",
                    "status": "succeeded",
                    "checked_outputs": list(directive.desired_outputs),
                }
            )
            local_outputs = self._local_outputs_payload(run_result)
            uploaded_assets: list[UploadedAsset] = []
            persisted_assets: list[dict[str, Any]] = []
            upload_mode = "local_only"
            if self._cos_output_configured():
                self._repository.update_stage(
                    job.id,
                    status="running",
                    current_stage="uploading_outputs",
                    progress_pct=80,
                    log_payload=log_payload,
                )
                uploaded_assets = self._upload_outputs(
                    job=job,
                    desired_outputs=directive.desired_outputs,
                    final_video_path=run_result.final_video_path,
                    cover_image_path=run_result.cover_image_path,
                    subtitle_path=run_result.subtitle_path,
                )
                try:
                    persisted_assets = self._repository.insert_output_assets(
                        job,
                        uploaded_assets,
                    )
                except Exception as exc:
                    raise OutputAssetPersistenceError(exc) from exc
                upload_mode = "tencent_cos"
                log_payload["steps"].append(
                    {
                        "stage": "uploading_outputs",
                        "status": "succeeded",
                        "uploaded_assets": persisted_assets,
                    }
                )
            else:
                log_payload["steps"].append(
                    {
                        "stage": "uploading_outputs",
                        "status": "skipped",
                        "reason": "cos_not_configured",
                        "local_outputs": local_outputs,
                    }
                )
            self._repository.mark_succeeded(
                job.id,
                result_payload={
                    "engine": run_result.raw_response.get("engine")
                    or "openstoryline-skeleton",
                    "engine_adapter": run_result.raw_response.get("engine_adapter")
                    or "unknown",
                    "execution_mode": directive.execution_mode,
                    "script_locked": directive.script_locked,
                    "desired_outputs": list(directive.desired_outputs),
                    "final_video_path": local_outputs["final_video_path"],
                    "cover_image_path": local_outputs["cover_image_path"],
                    "subtitle_path": local_outputs["subtitle_path"],
                    "metadata_path": local_outputs["metadata_path"],
                    "upload_mode": upload_mode,
                    "local_outputs": local_outputs,
                    "outputs": self._outputs_payload(uploaded_assets),
                    "uploaded_assets": self._uploaded_assets_payload(
                        uploaded_assets,
                        persisted_assets,
                    ),
                    "openstoryline": _openstoryline_result_payload(
                        run_result.raw_response,
                        directive.production_config,
                    ),
                    "engine_response": run_result.raw_response,
                },
                log_payload=log_payload,
            )
        except InputAssetContractError as exc:
            log_payload["steps"].append(
                {
                    "stage": "input_asset_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="input_asset_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload=log_payload,
                status="failed_manual",
            )
            return
        except OutputValidationError as exc:
            log_payload["steps"].append(
                {
                    "stage": "output_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "missing_outputs": exc.missing_outputs,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="output_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload=log_payload,
                status=exc.failure_status,
            )
            return
        except InputDownloadError as exc:
            log_payload["steps"].append(
                {
                    "stage": "downloading_inputs",
                    "status": "failed",
                    "failure_code": "input_download_failed",
                    "storage_key": exc.storage_key,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="downloading_inputs_failed",
                failure_reason=f"input_download_failed: {exc}",
                log_payload=log_payload,
                status="failed_retryable",
            )
            raise
        except EngineRunError as exc:
            log_payload["steps"].append(
                {
                    "stage": "openstoryline_rendering",
                    "status": "failed",
                    "failure_code": "engine_run_failed",
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="openstoryline_rendering_failed",
                failure_reason=f"engine_run_failed: {exc}",
                log_payload=log_payload,
                status="failed_retryable",
            )
            raise
        except OutputUploadError as exc:
            upload_failure_step: dict[str, Any] = {
                "stage": "uploading_outputs",
                "status": "failed",
                "failure_code": "OUTPUT_UPLOAD_FAILED",
                "storage_key": exc.storage_key,
                "error": str(exc),
            }
            if run_result is not None:
                upload_failure_step["local_outputs"] = self._local_outputs_payload(
                    run_result,
                )
            log_payload["steps"].append(upload_failure_step)
            self._repository.mark_failed(
                job.id,
                current_stage="uploading_outputs_failed",
                failure_reason=f"OUTPUT_UPLOAD_FAILED: {exc}",
                log_payload=log_payload,
                status="failed_retryable",
            )
            raise
        except OutputAssetPersistenceError as exc:
            log_payload["steps"].append(
                {
                    "stage": "asset_objects_persistence",
                    "status": "failed",
                    "failure_code": "asset_objects_insert_failed",
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="asset_objects_persistence_failed",
                failure_reason=f"asset_objects_insert_failed: {exc}",
                log_payload=log_payload,
                status="failed_retryable",
            )
            raise
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
            shutil.rmtree(output_dir, ignore_errors=True)
