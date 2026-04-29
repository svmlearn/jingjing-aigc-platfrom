from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .models import UploadedAsset, VideoJob


class VideoJobRepository:
    def __init__(self, db_url: str) -> None:
        self._db_url = db_url

    def _connect(self) -> Connection:
        return Connection.connect(self._db_url, row_factory=dict_row)

    def sweep_stale_jobs(self, stale_minutes: int) -> int:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = 'failed_retryable',
                    current_stage = 'stale_timeout',
                    failure_reason = concat(
                      coalesce(failure_reason, ''),
                      case when failure_reason is null or failure_reason = '' then '' else '; ' end,
                      'worker marked stale after timeout'
                    ),
                    finished_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where status in ('queued', 'preparing', 'running')
                  and updated_at < timezone('utc', now()) - (%s * interval '1 minute')
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
                    started_at = coalesce(started_at, timezone('utc', now())),
                    updated_at = timezone('utc', now())
                from next_job
                where jobs.id = next_job.id
                returning jobs.*
                """
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
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = %s,
                    current_stage = %s,
                    progress_pct = %s,
                    runtime_payload = coalesce(%s, runtime_payload),
                    log_payload = coalesce(%s, log_payload),
                    updated_at = timezone('utc', now())
                where id = %s
                """,
                (
                    status,
                    current_stage,
                    progress_pct,
                    Jsonb(runtime_payload) if runtime_payload is not None else None,
                    Jsonb(log_payload) if log_payload is not None else None,
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
                    result_payload = %s,
                    log_payload = %s,
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
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update video_edit_jobs
                set status = %s,
                    current_stage = %s,
                    failure_reason = %s,
                    log_payload = %s,
                    finished_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where id = %s
                """,
                (status, current_stage, failure_reason, Jsonb(log_payload), job_id),
            )

    def insert_output_assets(
        self,
        job: VideoJob,
        uploaded_assets: list[UploadedAsset],
    ) -> None:
        rows = [
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
            )
            for asset in uploaded_assets
        ]
        if not rows:
            return
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.executemany(
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
                """,
                rows,
            )
