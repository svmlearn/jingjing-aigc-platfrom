from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .models import UploadedAsset, VideoJob


ALLOWED_VIDEO_JOB_STATUSES = frozenset(
    {
        "pending",
        "queued",
        "preparing",
        "running",
        "succeeded",
        "failed_retryable",
        "failed_manual",
        "cancelled",
    }
)
FAILURE_VIDEO_JOB_STATUSES = frozenset({"failed_retryable", "failed_manual"})


def validate_video_job_status(
    status: str,
    *,
    allowed_statuses: frozenset[str] = ALLOWED_VIDEO_JOB_STATUSES,
) -> str:
    if status not in allowed_statuses:
        allowed = ", ".join(sorted(allowed_statuses))
        raise ValueError(
            f"invalid video_edit_jobs.status '{status}'; allowed values: {allowed}"
        )
    return status


class VideoJobRepository:
    def __init__(self, db_url: str, *, worker_id: str = "video-worker") -> None:
        self._db_url = db_url
        self._worker_id = worker_id

    def _connect(self) -> Connection:
        return Connection.connect(self._db_url, row_factory=dict_row)

    def sweep_stale_jobs(self, stale_minutes: int) -> int:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = 'failed_retryable',
                    current_stage = 'stale_timeout',
                    failure_code = 'worker_heartbeat_timeout',
                    failure_reason = concat(
                      coalesce(failure_reason, ''),
                      case when failure_reason is null or failure_reason = '' then '' else '; ' end,
                      'worker marked stale after timeout'
                    ),
                    timeout_at = timezone('utc', now()),
                    finished_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where status in ('queued', 'preparing', 'running')
                  and coalesce(heartbeat_at, updated_at) < timezone('utc', now()) - (%s * interval '1 minute')
                """,
                (stale_minutes,),
            )
            return cursor.rowcount

    def claim_next_job(self) -> VideoJob | None:
        with self._connect() as connection, connection.transaction(), connection.cursor() as cursor:
            cursor.execute(
                """
                with next_job as (
                  select id
                  from video_edit_jobs
                  where status = 'pending'
                  order by created_at asc
                  limit 1
                  for update skip locked
                )
                update video_edit_jobs as jobs
                set status = 'queued',
                    current_stage = 'claimed',
                    progress_pct = 0,
                    failure_reason = null,
                    failure_code = null,
                    worker_id = %s,
                    claimed_at = timezone('utc', now()),
                    heartbeat_at = timezone('utc', now()),
                    started_at = coalesce(started_at, timezone('utc', now())),
                    updated_at = timezone('utc', now())
                from next_job
                where jobs.id = next_job.id
                returning jobs.*
                """,
                (self._worker_id,),
            )
            record = cursor.fetchone()
            if not record:
                return None
            return VideoJob.from_record(record)

    def update_stage(
        self,
        job_id: str,
        *,
        status: str,
        current_stage: str,
        progress_pct: int,
        runtime_payload: dict[str, Any] | None = None,
        log_payload: dict[str, Any] | None = None,
    ) -> None:
        validate_video_job_status(status)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = %s,
                    current_stage = %s,
                    progress_pct = %s,
                    runtime_payload = coalesce(%s::jsonb, runtime_payload),
                    log_payload = coalesce(%s::jsonb, log_payload),
                    heartbeat_at = timezone('utc', now()),
                    worker_id = coalesce(worker_id, %s),
                    updated_at = timezone('utc', now())
                where id = %s
                """,
                (
                    status,
                    current_stage,
                    progress_pct,
                    Jsonb(runtime_payload) if runtime_payload is not None else None,
                    Jsonb(log_payload) if log_payload is not None else None,
                    self._worker_id,
                    job_id,
                ),
            )

    def mark_succeeded(
        self,
        job_id: str,
        *,
        result_payload: dict[str, Any],
        log_payload: dict[str, Any],
    ) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = 'succeeded',
                    current_stage = 'completed',
                    progress_pct = 100,
                    result_payload = %s::jsonb,
                    log_payload = %s::jsonb,
                    heartbeat_at = timezone('utc', now()),
                    finished_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where id = %s
                """,
                (Jsonb(result_payload), Jsonb(log_payload), job_id),
            )

    def mark_failed(
        self,
        job_id: str,
        *,
        current_stage: str,
        failure_reason: str,
        log_payload: dict[str, Any],
        status: str = "failed_retryable",
    ) -> None:
        validate_video_job_status(status, allowed_statuses=FAILURE_VIDEO_JOB_STATUSES)
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = %s,
                    current_stage = %s,
                    failure_code = %s,
                    failure_reason = %s,
                    log_payload = %s::jsonb,
                    heartbeat_at = timezone('utc', now()),
                    finished_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where id = %s
                """,
                (
                    status,
                    current_stage,
                    current_stage,
                    failure_reason,
                    Jsonb(log_payload),
                    job_id,
                ),
            )

    def insert_output_assets(
        self,
        job: VideoJob,
        uploaded_assets: list[UploadedAsset],
    ) -> list[dict[str, Any]]:
        if not uploaded_assets:
            return []
        inserted_assets: list[dict[str, Any]] = []
        with self._connect() as connection, connection.cursor() as cursor:
            for asset in uploaded_assets:
                cursor.execute(
                    """
                    insert into asset_objects (
                      owner_type,
                      owner_id,
                      asset_type,
                      storage_provider,
                      bucket_name,
                      storage_key,
                      mime_type,
                      file_size_bytes,
                      etag,
                      created_at,
                      updated_at
                    ) values (
                      %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      timezone('utc', now()),
                      timezone('utc', now())
                    )
                    returning id
                    """,
                    (
                        "content_variant",
                        job.content_variant_id,
                        asset.asset_type,
                        "tencent_cos",
                        asset.bucket_name,
                        asset.storage_key,
                        asset.mime_type,
                        asset.file_size_bytes,
                        asset.etag,
                    ),
                )
                record = cursor.fetchone() or {}
                inserted_assets.append(
                    {
                        "asset_id": str(record.get("id") or ""),
                        "asset_type": asset.asset_type,
                        "storage_provider": "tencent_cos",
                        "bucket_name": asset.bucket_name,
                        "storage_key": asset.storage_key,
                        "mime_type": asset.mime_type,
                        "etag": asset.etag,
                        "file_size_bytes": asset.file_size_bytes,
                    }
                )
        return inserted_assets
