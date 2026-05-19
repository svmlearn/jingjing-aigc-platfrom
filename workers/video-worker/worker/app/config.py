from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from pathlib import Path

SUPPORTED_STORAGE_PROVIDERS = frozenset({"tencent_cos", "aliyun_oss"})


def _read_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _read_storage_provider() -> str:
    value = (
        os.getenv("WORKER_STORAGE_PROVIDER")
        or os.getenv("STORAGE_PROVIDER")
        or "aliyun_oss"
    )
    normalized = value.strip().lower()
    if normalized not in SUPPORTED_STORAGE_PROVIDERS:
        allowed = ", ".join(sorted(SUPPORTED_STORAGE_PROVIDERS))
        raise ValueError(
            f"WORKER_STORAGE_PROVIDER must be one of: {allowed}"
        )
    return normalized


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_provider: str
    cos_secret_id: str
    cos_secret_key: str
    cos_bucket: str
    cos_region: str
    aliyun_oss_access_key_id: str
    aliyun_oss_access_key_secret: str
    aliyun_oss_bucket: str
    aliyun_oss_region: str
    aliyun_oss_endpoint: str
    storage_result_prefix: str
    worker_id: str
    worker_poll_interval_seconds: int
    worker_max_concurrency: int
    video_job_stale_minutes: int
    worker_temp_root: Path
    worker_models_root: Path
    worker_output_root: Path
    openstoryline_base_url: str
    openstoryline_timeout_seconds: int
    log_level: str

    @property
    def cos_result_prefix(self) -> str:
        return self.storage_result_prefix

    @property
    def default_input_buckets(self) -> dict[str, str]:
        return {
            "tencent_cos": self.cos_bucket,
            "aliyun_oss": self.aliyun_oss_bucket,
        }

    @property
    def output_storage_configured(self) -> bool:
        if self.storage_provider == "aliyun_oss":
            return all(
                [
                    self.aliyun_oss_access_key_id,
                    self.aliyun_oss_access_key_secret,
                    self.aliyun_oss_bucket,
                    self.aliyun_oss_region,
                    self.aliyun_oss_endpoint,
                ]
            )
        return all(
            [
                self.cos_secret_id,
                self.cos_secret_key,
                self.cos_bucket,
                self.cos_region,
            ]
        )

    @property
    def cos_output_configured(self) -> bool:
        return self.output_storage_configured

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = os.getenv("WORKER_DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
        if not database_url:
            raise RuntimeError(
                "WORKER_DATABASE_URL is required; SUPABASE_DB_URL is accepted only as a compatibility fallback"
            )
        storage_provider = _read_storage_provider()
        settings = cls(
            database_url=database_url,
            storage_provider=storage_provider,
            cos_secret_id=os.getenv("WORKER_COS_SECRET_ID")
            or os.getenv("COS_SECRET_ID", ""),
            cos_secret_key=os.getenv("WORKER_COS_SECRET_KEY")
            or os.getenv("COS_SECRET_KEY", ""),
            cos_bucket=os.getenv("WORKER_COS_BUCKET")
            or os.getenv("COS_BUCKET", ""),
            cos_region=os.getenv("WORKER_COS_REGION")
            or os.getenv("COS_REGION", ""),
            aliyun_oss_access_key_id=os.getenv("WORKER_ALIYUN_OSS_ACCESS_KEY_ID")
            or os.getenv("ALIYUN_OSS_ACCESS_KEY_ID", ""),
            aliyun_oss_access_key_secret=os.getenv("WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET")
            or os.getenv("ALIYUN_OSS_ACCESS_KEY_SECRET", ""),
            aliyun_oss_bucket=os.getenv("WORKER_ALIYUN_OSS_BUCKET")
            or os.getenv("ALIYUN_OSS_BUCKET", ""),
            aliyun_oss_region=os.getenv("WORKER_ALIYUN_OSS_REGION")
            or os.getenv("ALIYUN_OSS_REGION", ""),
            aliyun_oss_endpoint=os.getenv("WORKER_ALIYUN_OSS_ENDPOINT")
            or os.getenv("ALIYUN_OSS_ENDPOINT", ""),
            storage_result_prefix=(
                os.getenv("WORKER_STORAGE_RESULT_PREFIX")
                or (
                    os.getenv("WORKER_ALIYUN_OSS_RESULT_PREFIX")
                    if storage_provider == "aliyun_oss"
                    else None
                )
                or os.getenv("WORKER_COS_RESULT_PREFIX")
                or "video-results"
            ).strip("/")
            or "video-results",
            worker_id=os.getenv("WORKER_ID", socket.gethostname()).strip()
            or "video-worker",
            worker_poll_interval_seconds=_read_int(
                "WORKER_POLL_INTERVAL_SECONDS", 10
            ),
            worker_max_concurrency=_read_int("WORKER_MAX_CONCURRENCY", 1),
            video_job_stale_minutes=_read_int("VIDEO_JOB_STALE_MINUTES", 120),
            worker_temp_root=Path(
                os.getenv("WORKER_TEMP_ROOT", "/srv/jingjing-video-worker/tmp")
            ),
            worker_models_root=Path(
                os.getenv("WORKER_MODELS_ROOT", "/srv/jingjing-video-worker/models")
            ),
            worker_output_root=Path(
                os.getenv("WORKER_OUTPUT_ROOT", "/srv/jingjing-video-worker/outputs")
            ),
            openstoryline_base_url=os.getenv(
                "OPENSTORYLINE_BASE_URL", "http://openstoryline-engine:8000"
            ).rstrip("/"),
            openstoryline_timeout_seconds=_read_int(
                "OPENSTORYLINE_TIMEOUT_SECONDS", 1800
            ),
            log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        )
        if settings.worker_max_concurrency != 1:
            raise ValueError(
                "WORKER_MAX_CONCURRENCY must stay fixed at 1 for domestic phase-1 validation"
            )
        return settings
