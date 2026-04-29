from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _read_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    supabase_db_url: str
    cos_secret_id: str
    cos_secret_key: str
    cos_bucket: str
    cos_region: str
    cos_result_prefix: str
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
    def cos_output_configured(self) -> bool:
        return all(
            [
                self.cos_secret_id,
                self.cos_secret_key,
                self.cos_bucket,
                self.cos_region,
            ]
        )

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            supabase_db_url=os.environ["SUPABASE_DB_URL"],
            cos_secret_id=os.getenv("WORKER_COS_SECRET_ID")
            or os.getenv("COS_SECRET_ID", ""),
            cos_secret_key=os.getenv("WORKER_COS_SECRET_KEY")
            or os.getenv("COS_SECRET_KEY", ""),
            cos_bucket=os.getenv("WORKER_COS_BUCKET")
            or os.getenv("COS_BUCKET", ""),
            cos_region=os.getenv("WORKER_COS_REGION")
            or os.getenv("COS_REGION", ""),
            cos_result_prefix=(
                os.getenv("WORKER_COS_RESULT_PREFIX", "video-results").strip("/")
                or "video-results"
            ),
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
            raise ValueError("WORKER_MAX_CONCURRENCY must stay fixed at 1 for staging")
        return settings
