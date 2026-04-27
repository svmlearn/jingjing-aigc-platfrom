from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


class InputAssetContractError(ValueError):
    def __init__(self, message: str, *, failure_code: str = "invalid_input_assets") -> None:
        super().__init__(message)
        self.failure_code = failure_code


@dataclass(frozen=True)
class InputAsset:
    asset_type: str
    bucket_name: str
    storage_key: str
    file_name: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any], default_bucket: str) -> "InputAsset":
        _validate_storage_provider(payload.get("storage_provider"))
        storage_key = _required_string(payload, "storage_key")
        file_name = _safe_file_name(payload.get("file_name") or Path(storage_key).name)
        return cls(
            asset_type=str(payload.get("asset_type", "video")),
            bucket_name=_bucket_name(payload, default_bucket),
            storage_key=storage_key,
            file_name=file_name,
        )


@dataclass(frozen=True)
class UploadedAsset:
    asset_type: str
    bucket_name: str
    storage_key: str
    mime_type: str
    file_size_bytes: int
    etag: str | None
    local_path: Path


@dataclass(frozen=True)
class EngineRunResult:
    final_video_path: Path
    cover_image_path: Path | None
    subtitle_path: Path | None
    metadata_path: Path
    raw_response: dict[str, Any]


@dataclass(frozen=True)
class VideoJob:
    id: str
    merchant_id: str
    draft_id: str
    content_variant_id: str
    status: str
    current_stage: str | None
    instruction_text: str
    input_payload: dict[str, Any]
    runtime_payload: dict[str, Any]
    retry_count: int

    @classmethod
    def from_record(cls, record: dict[str, Any]) -> "VideoJob":
        return cls(
            id=str(record["id"]),
            merchant_id=str(record["merchant_id"]),
            draft_id=str(record["draft_id"]),
            content_variant_id=str(record["content_variant_id"]),
            status=str(record["status"]),
            current_stage=record.get("current_stage"),
            instruction_text=str(record.get("instruction_text") or ""),
            input_payload=record.get("input_payload") or {},
            runtime_payload=record.get("runtime_payload") or {},
            retry_count=int(record.get("retry_count") or 0),
        )

    def input_assets(self, default_bucket: str) -> list[InputAsset]:
        raw_assets = self.input_payload.get("input_assets") or []
        if not isinstance(raw_assets, list):
            raise InputAssetContractError("input_payload.input_assets must be a list")
        for item in raw_assets:
            if not isinstance(item, dict):
                raise InputAssetContractError("each input asset must be an object")
        return [InputAsset.from_payload(item, default_bucket) for item in raw_assets]

    def output_object_key(self, asset_type: str) -> str:
        root = {
            "video": "video-outputs",
            "cover": "video-covers",
            "subtitle": "video-subtitles",
        }[asset_type]
        filename = {
            "video": "final.mp4",
            "cover": "cover.jpg",
            "subtitle": "subtitles.srt",
        }[asset_type]
        return (
            f"{root}/{self.merchant_id}/{self.draft_id}/"
            f"{self.content_variant_id}/{self.id}/{filename}"
        )


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise InputAssetContractError(f"input asset requires {key}")
    return value.strip()


def _validate_storage_provider(value: Any) -> None:
    if value is None:
        return
    if not isinstance(value, str) or value.strip().lower() != "tencent_cos":
        raise InputAssetContractError(
            "input asset storage_provider must be tencent_cos"
        )


def _bucket_name(payload: dict[str, Any], default_bucket: str) -> str:
    if "bucket_name" not in payload or payload.get("bucket_name") is None:
        return default_bucket
    value = payload["bucket_name"]
    if not isinstance(value, str) or not value.strip():
        raise InputAssetContractError("input asset bucket_name must be a string")
    return value.strip()


def _safe_file_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InputAssetContractError("input asset requires safe file_name")
    file_name = value.strip()
    if (
        Path(file_name).name != file_name
        or Path(file_name).is_absolute()
        or "/" in file_name
        or "\\" in file_name
        or ":" in file_name
    ):
        raise InputAssetContractError("input asset file_name must not contain a path")
    return file_name
