from __future__ import annotations

import mimetypes
from pathlib import Path

from qcloud_cos import CosConfig, CosS3Client

from .config import Settings
from .models import UploadedAsset


class TencentCosClient:
    def __init__(self, settings: Settings) -> None:
        self._default_bucket = settings.cos_bucket
        self._configured = settings.cos_output_configured
        if not self._configured:
            self._client = None
            return

        config = CosConfig(
            Region=settings.cos_region,
            SecretId=settings.cos_secret_id,
            SecretKey=settings.cos_secret_key,
            Token=None,
            Scheme="https",
        )
        self._client = CosS3Client(config)

    def download_file(
        self,
        storage_key: str,
        destination: Path,
        bucket_name: str | None = None,
    ) -> Path:
        if self._client is None:
            raise RuntimeError("Tencent COS is not configured for this worker")
        destination.parent.mkdir(parents=True, exist_ok=True)
        self._client.download_file(
            Bucket=bucket_name or self._default_bucket,
            Key=storage_key,
            DestFilePath=str(destination),
        )
        return destination

    def upload_file(
        self,
        local_path: Path,
        storage_key: str,
        asset_type: str,
        bucket_name: str | None = None,
    ) -> UploadedAsset:
        if self._client is None:
            raise RuntimeError("Tencent COS is not configured for this worker")
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        with local_path.open("rb") as file_obj:
            response = self._client.put_object(
                Bucket=bucket_name or self._default_bucket,
                Body=file_obj,
                Key=storage_key,
                ContentType=mime_type,
                EnableMD5=False,
            )
        etag = response.get("ETag")
        return UploadedAsset(
            asset_type=asset_type,
            bucket_name=bucket_name or self._default_bucket,
            storage_key=storage_key,
            mime_type=mime_type,
            file_size_bytes=local_path.stat().st_size,
            etag=etag,
            local_path=local_path,
        )
