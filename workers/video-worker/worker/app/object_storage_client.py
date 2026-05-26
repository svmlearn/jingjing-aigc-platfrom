from __future__ import annotations

import mimetypes
from pathlib import Path

from .config import Settings
from .models import UploadedAsset


class ObjectStorageClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._aliyun_bucket = None

    def download_file(
        self,
        storage_key: str,
        destination: Path,
        bucket_name: str | None = None,
        storage_provider: str = "aliyun_oss",
    ) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if storage_provider != "aliyun_oss":
            raise RuntimeError(f"Unsupported storage provider: {storage_provider}")
        bucket = self._get_aliyun_bucket(bucket_name)
        bucket.get_object_to_file(storage_key, str(destination))
        return destination

    def upload_file(
        self,
        local_path: Path,
        storage_key: str,
        asset_type: str,
        bucket_name: str | None = None,
        storage_provider: str | None = None,
    ) -> UploadedAsset:
        provider = storage_provider or self._settings.storage_provider
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        if provider != "aliyun_oss":
            raise RuntimeError(f"Unsupported storage provider: {provider}")
        bucket = self._get_aliyun_bucket(bucket_name)
        result = bucket.put_object_from_file(
            storage_key,
            str(local_path),
            headers={"Content-Type": mime_type},
        )
        etag = getattr(result, "etag", None) or _read_aliyun_etag(result)
        resolved_bucket = bucket_name or self._settings.aliyun_oss_bucket
        return UploadedAsset(
            asset_type=asset_type,
            storage_provider=provider,
            bucket_name=resolved_bucket,
            storage_key=storage_key,
            mime_type=mime_type,
            file_size_bytes=local_path.stat().st_size,
            etag=etag,
            local_path=local_path,
        )

    def create_signed_read_url(
        self,
        *,
        storage_key: str,
        bucket_name: str | None = None,
        storage_provider: str = "aliyun_oss",
        expires_seconds: int = 3600,
    ) -> str:
        if storage_provider != "aliyun_oss":
            raise RuntimeError(f"Unsupported storage provider: {storage_provider}")
        bucket = self._get_aliyun_bucket(bucket_name)
        return str(bucket.sign_url("GET", storage_key, expires_seconds))

    def _get_aliyun_bucket(self, bucket_name: str | None = None):
        if not all(
            [
                self._settings.aliyun_oss_access_key_id,
                self._settings.aliyun_oss_access_key_secret,
                self._settings.aliyun_oss_bucket,
                self._settings.aliyun_oss_region,
                self._settings.aliyun_oss_endpoint,
            ]
        ):
            raise RuntimeError("Aliyun OSS is not configured for this worker")

        import oss2

        resolved_bucket = bucket_name or self._settings.aliyun_oss_bucket
        if self._aliyun_bucket is None or getattr(self._aliyun_bucket, "bucket_name", None) != resolved_bucket:
            auth = oss2.Auth(
                self._settings.aliyun_oss_access_key_id,
                self._settings.aliyun_oss_access_key_secret,
            )
            self._aliyun_bucket = oss2.Bucket(
                auth,
                self._settings.aliyun_oss_endpoint,
                resolved_bucket,
            )
        return self._aliyun_bucket


def _read_aliyun_etag(result: object) -> str | None:
    response = getattr(result, "resp", None) or getattr(result, "res", None)
    headers = getattr(response, "headers", None)
    if isinstance(headers, dict):
        value = headers.get("etag") or headers.get("ETag")
        return str(value) if value else None
    return None
