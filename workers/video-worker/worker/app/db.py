from __future__ import annotations

import re
from pathlib import Path
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


def _score_material_asset(row: dict[str, Any], query_terms: list[str]) -> float:
    score = 40.0
    if not query_terms:
        return score

    index_text = _normalize_search_text(_material_asset_index_text(row))
    hit_terms = [term for term in query_terms if term in index_text]
    if hit_terms:
        score += min(90.0, len(hit_terms) * 8.0)
        score += min(30.0, len(hit_terms) / max(len(query_terms), 1) * 30.0)
    return score


def _material_asset_index_text(row: dict[str, Any]) -> str:
    values: list[str] = [
        str(row.get("title") or ""),
        str(row.get("script_text") or ""),
        str(row.get("storage_key") or ""),
    ]
    for key in ("structure_summary", "engagement_snapshot", "trace_payload"):
        values.extend(_iter_search_strings(row.get(key)))
    return "\n".join(value for value in values if value)


def _iter_search_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for item in value.values():
            strings.extend(_iter_search_strings(item))
        return strings
    if isinstance(value, list | tuple):
        strings: list[str] = []
        for item in value:
            strings.extend(_iter_search_strings(item))
        return strings
    return []


def _tokenize_material_query(query: str) -> list[str]:
    normalized = _normalize_search_text(query)
    chunks = [
        chunk
        for chunk in re.split(r"[^\w\u4e00-\u9fff]+", normalized)
        if chunk
    ]
    terms: list[str] = []
    for chunk in chunks:
        terms.append(chunk)
        if _has_han_text(chunk) and len(chunk) > 2:
            for size in (2, 3, 4):
                if len(chunk) < size:
                    continue
                for index in range(0, len(chunk) - size + 1):
                    terms.append(chunk[index : index + size])
    return list(dict.fromkeys(terms))[:80]


def _normalize_search_text(value: str) -> str:
    return value.casefold().strip()


def _has_han_text(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def _build_material_asset_metadata(
    row: dict[str, Any],
    *,
    query_terms: list[str],
    match_score: float,
) -> dict[str, Any]:
    trace_payload = _dict_value(row.get("trace_payload"))
    material_analysis = _dict_value(trace_payload.get("materialAnalysis"))
    structure_summary = _dict_value(row.get("structure_summary"))
    tags = _string_list(
        material_analysis.get("tags")
        or trace_payload.get("tags")
        or structure_summary.get("tags")
    )
    labels = list(
        dict.fromkeys(
            tags
            + _string_list(material_analysis.get("sceneTags"))
            + _string_list(material_analysis.get("industryTags"))
            + _string_list(material_analysis.get("shotTags"))
        )
    )

    return {
        "source": "merchant_material_library",
        "material_item_id": str(row.get("material_item_id")),
        "asset_object_id": str(row.get("asset_object_id")),
        "title": row.get("title"),
        "description": row.get("script_text"),
        "tags": tags,
        "labels": labels,
        "query_terms": query_terms[:20],
        "match_score": round(match_score, 2),
    }


def _safe_material_file_name(row: dict[str, Any]) -> str:
    storage_key = str(row.get("storage_key") or "")
    asset_object_id = str(row.get("asset_object_id") or "asset")
    suffix = Path(storage_key).suffix or ".mp4"
    return f"material-{asset_object_id}{suffix}"


def _dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list | tuple):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


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

    def list_video_material_input_assets(
        self,
        merchant_id: str,
        *,
        query: str,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  si.id as material_item_id,
                  si.title,
                  si.script_text,
                  si.structure_summary,
                  si.engagement_snapshot,
                  si.trace_payload,
                  ao.id as asset_object_id,
                  ao.storage_provider,
                  ao.bucket_name,
                  ao.storage_key,
                  ao.mime_type,
                  ao.file_size_bytes,
                  ao.etag,
                  ao.sort_order
                from source_items si
                join asset_objects ao
                  on ao.owner_type = 'source_item'
                 and ao.owner_id = si.id
                 and ao.asset_type = 'video'
                where si.merchant_id = %s
                  and si.trace_payload @> '{"materialLibrary": true}'::jsonb
                  and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
                  and (
                    si.trace_payload @> '{"retrievalTargets":["video_edit_asset"]}'::jsonb
                    or si.structure_summary @> '{"retrievalTargets":["video_edit_asset"]}'::jsonb
                    or si.trace_payload->>'materialUsageType' = 'video_asset'
                    or si.structure_summary->>'materialUsageType' = 'video_asset'
                    or si.trace_payload->'materialAnalysis'->>'materialUsageType' = 'video_asset'
                  )
                order by si.created_at desc, ao.sort_order asc, ao.created_at asc
                limit 160
                """,
                (merchant_id,),
            )
            rows = cursor.fetchall()

        query_terms = _tokenize_material_query(query)
        ranked = sorted(
            rows,
            key=lambda row: (
                -_score_material_asset(row, query_terms),
                str(row.get("material_item_id")),
                int(row.get("sort_order") or 0),
            ),
        )

        payloads: list[dict[str, Any]] = []
        seen_storage_keys: set[tuple[str, str, str]] = set()
        for row in ranked:
            storage_provider = str(row.get("storage_provider") or "").strip()
            bucket_name = str(row.get("bucket_name") or "").strip()
            storage_key = str(row.get("storage_key") or "").strip()
            if not storage_provider or not bucket_name or not storage_key:
                continue

            storage_identity = (storage_provider, bucket_name, storage_key)
            if storage_identity in seen_storage_keys:
                continue
            seen_storage_keys.add(storage_identity)

            match_score = _score_material_asset(row, query_terms)
            metadata = _build_material_asset_metadata(
                row,
                query_terms=query_terms,
                match_score=match_score,
            )
            payloads.append(
                {
                    "asset_type": "video",
                    "storage_provider": storage_provider,
                    "bucket_name": bucket_name,
                    "storage_key": storage_key,
                    "file_name": _safe_material_file_name(row),
                    "role": "project_material",
                    "scene_type": "merchant_material_library",
                    "tags": metadata.get("tags") or [],
                    "labels": metadata.get("labels") or [],
                    "metadata": metadata,
                }
            )
            if len(payloads) >= limit:
                break

        return payloads

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
                        asset.storage_provider,
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
                        "storage_provider": asset.storage_provider,
                        "bucket_name": asset.bucket_name,
                        "storage_key": asset.storage_key,
                        "mime_type": asset.mime_type,
                        "etag": asset.etag,
                        "file_size_bytes": asset.file_size_bytes,
                    }
                )
        return inserted_assets
