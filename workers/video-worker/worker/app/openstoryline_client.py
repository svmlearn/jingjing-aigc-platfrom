from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from .config import Settings
from .models import EngineRunResult, VideoJob


class OpenStorylineClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.openstoryline_base_url
        self._timeout = settings.openstoryline_timeout_seconds

    def healthcheck(self) -> dict[str, Any]:
        response = httpx.get(f"{self._base_url}/health", timeout=10.0)
        response.raise_for_status()
        return response.json()

    def run_job(
        self,
        job: VideoJob,
        input_assets: list[dict[str, str]],
        workspace_dir: Path,
        output_dir: Path,
    ) -> EngineRunResult:
        payload = {
            "job_id": job.id,
            "merchant_id": job.merchant_id,
            "draft_id": job.draft_id,
            "content_variant_id": job.content_variant_id,
            "instruction_text": job.instruction_text,
            "workspace_dir": str(workspace_dir),
            "output_dir": str(output_dir),
            "input_assets": input_assets,
            "runtime_payload": job.runtime_payload,
        }
        response = httpx.post(
            f"{self._base_url}/v1/runs",
            json=payload,
            timeout=self._timeout,
        )
        response.raise_for_status()
        data = response.json()
        return EngineRunResult(
            final_video_path=Path(data["final_video_path"]),
            cover_image_path=Path(data["cover_image_path"])
            if data.get("cover_image_path")
            else None,
            subtitle_path=Path(data["subtitle_path"])
            if data.get("subtitle_path")
            else None,
            metadata_path=Path(data["metadata_path"]),
            raw_response=data.get("raw_response") or data,
        )
