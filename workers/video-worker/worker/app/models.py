from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


SUPPORTED_STORAGE_PROVIDERS = frozenset({"aliyun_oss"})


class InputAssetContractError(ValueError):
    def __init__(self, message: str, *, failure_code: str = "invalid_input_assets") -> None:
        super().__init__(message)
        self.failure_code = failure_code


@dataclass(frozen=True)
class InputAsset:
    asset_id: str | None
    asset_type: str
    storage_provider: str
    bucket_name: str
    storage_key: str
    file_name: str
    role: str | None = None
    scene_type: str | None = None
    tags: tuple[str, ...] = ()
    labels: tuple[str, ...] = ()
    metadata: dict[str, Any] | None = None

    @classmethod
    def from_payload(
        cls,
        payload: dict[str, Any],
        default_buckets: str | Mapping[str, str],
        default_storage_provider: str = "aliyun_oss",
    ) -> "InputAsset":
        storage_provider = _storage_provider(
            payload.get("storage_provider"),
            default_storage_provider=default_storage_provider,
        )
        storage_key = _required_string(payload, "storage_key")
        file_name = _safe_file_name(payload.get("file_name") or Path(storage_key).name)
        return cls(
            asset_id=_optional_string(payload.get("asset_id") or payload.get("id")),
            asset_type=str(payload.get("asset_type", "video")),
            storage_provider=storage_provider,
            bucket_name=_bucket_name(payload, default_buckets, storage_provider),
            storage_key=storage_key,
            file_name=file_name,
            role=_optional_string(payload.get("role")),
            scene_type=_optional_string(
                payload.get("scene_type") or payload.get("sceneType")
            ),
            tags=_string_tuple(payload.get("tags")),
            labels=_string_tuple(payload.get("labels")),
            metadata=_metadata_dict(payload.get("metadata")),
        )


@dataclass(frozen=True)
class UploadedAsset:
    asset_type: str
    storage_provider: str
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
    created_by_user_id: str | None
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
            created_by_user_id=(
                str(record["created_by_user_id"])
                if record.get("created_by_user_id") is not None
                else None
            ),
            status=str(record["status"]),
            current_stage=record.get("current_stage"),
            instruction_text=str(record.get("instruction_text") or ""),
            input_payload=record.get("input_payload") or {},
            runtime_payload=record.get("runtime_payload") or {},
            retry_count=int(record.get("retry_count") or 0),
        )

    def input_assets(
        self,
        default_buckets: str | Mapping[str, str],
        default_storage_provider: str = "aliyun_oss",
    ) -> list[InputAsset]:
        if not isinstance(self.input_payload, dict):
            raise InputAssetContractError("input_payload must be an object")
        raw_assets = (
            self.input_payload.get("input_assets")
            if "input_assets" in self.input_payload
            else []
        )
        if not isinstance(raw_assets, list):
            raise InputAssetContractError("input_payload.input_assets must be a list")
        for item in raw_assets:
            if not isinstance(item, dict):
                raise InputAssetContractError("each input asset must be an object")
        return [
            InputAsset.from_payload(
                item,
                default_buckets,
                default_storage_provider=default_storage_provider,
            )
            for item in raw_assets
        ]

    def output_object_key(self, asset_type: str, result_prefix: str = "video-results") -> str:
        root = result_prefix.strip("/") or "video-results"
        filename = {
            "video": "final.mp4",
            "cover": "cover.jpg",
            "subtitle": "subtitles.srt",
        }[asset_type]
        return f"{root}/{self.merchant_id}/{self.id}/{filename}"


def _required_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise InputAssetContractError(f"input asset requires {key}")
    return value.strip()


def _storage_provider(value: Any, *, default_storage_provider: str = "aliyun_oss") -> str:
    if value is None:
        normalized_default = str(default_storage_provider or "aliyun_oss").strip().lower()
        if normalized_default in SUPPORTED_STORAGE_PROVIDERS:
            return normalized_default
        return "aliyun_oss"
    if not isinstance(value, str):
        raise InputAssetContractError(
            "input asset storage_provider must be aliyun_oss"
        )
    normalized = value.strip().lower()
    if normalized in SUPPORTED_STORAGE_PROVIDERS:
        return normalized
    raise InputAssetContractError(
        "input asset storage_provider must be aliyun_oss"
    )


def _bucket_name(
    payload: dict[str, Any],
    default_buckets: str | Mapping[str, str],
    storage_provider: str,
) -> str:
    if "bucket_name" not in payload or payload.get("bucket_name") is None:
        if isinstance(default_buckets, str):
            return default_buckets
        return str(default_buckets.get(storage_provider) or "")
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


def _optional_string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _string_tuple(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list | tuple):
        return ()
    return tuple(
        str(item).strip()
        for item in value
        if str(item).strip()
    )


def _metadata_dict(value: Any) -> dict[str, Any] | None:
    return dict(value) if isinstance(value, dict) else None
