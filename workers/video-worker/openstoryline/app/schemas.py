from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class InputAsset(BaseModel):
    local_path: str
    asset_type: str
    file_name: str | None = None


class RunRequest(BaseModel):
    job_id: str
    merchant_id: str
    draft_id: str
    content_variant_id: str
    instruction_text: str = ""
    workspace_dir: str
    output_dir: str
    input_assets: list[InputAsset] = Field(default_factory=list)
    execution_mode: str = "staging_worker"
    script_text: str = ""
    production_directive: dict[str, Any] = Field(default_factory=dict)
    production_config: dict[str, Any] = Field(default_factory=dict)
    runtime_payload: dict[str, Any] = Field(default_factory=dict)


class RunResponse(BaseModel):
    job_id: str
    final_video_path: str
    cover_image_path: str | None = None
    subtitle_path: str | None = None
    metadata_path: str
    engine: str = "openstoryline-skeleton"
    raw_response: dict[str, Any] = Field(default_factory=dict)
