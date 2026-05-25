from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Any

from .config import Settings
from .cos_client import ObjectStorageClient
from .db import VideoJobRepository
from .directive import (
    DirectiveValidationError,
    ProductionDirective,
    build_production_directive,
)
from .models import EngineRunResult, InputAsset, InputAssetContractError, UploadedAsset, VideoJob
from .openstoryline_client import OpenStorylineClient


class OutputValidationError(RuntimeError):
    def __init__(
        self,
        missing_outputs: list[str],
        *,
        failure_code: str = "missing_output_files",
        failure_status: str = "failed_retryable",
    ) -> None:
        self.missing_outputs = missing_outputs
        self.failure_code = failure_code
        self.failure_status = failure_status
        super().__init__(f"missing output files: {', '.join(missing_outputs)}")


class InputDownloadError(RuntimeError):
    def __init__(self, storage_key: str, original_error: Exception) -> None:
        self.storage_key = storage_key
        super().__init__(f"failed to download input asset {storage_key}: {original_error}")


class VoiceProfileReferenceError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        failure_code: str = "voice_profile_reference_invalid",
    ) -> None:
        self.failure_code = failure_code
        super().__init__(message)


class VoiceoverArtifactValidationError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        failure_code: str,
        failure_status: str = "failed_manual",
    ) -> None:
        self.failure_code = failure_code
        self.failure_status = failure_status
        super().__init__(message)


class EngineRunError(RuntimeError):
    def __init__(
        self,
        original_error: Exception,
        *,
        module_key: str | None = None,
        progress_event: dict[str, Any] | None = None,
    ) -> None:
        self.module_key = module_key
        self.progress_event = progress_event
        super().__init__(f"failed to run OpenStoryline engine: {original_error}")


class OutputUploadError(RuntimeError):
    def __init__(self, storage_key: str, original_error: Exception) -> None:
        self.storage_key = storage_key
        super().__init__(f"failed to upload output asset {storage_key}: {original_error}")


class OutputAssetPersistenceError(RuntimeError):
    def __init__(self, original_error: Exception) -> None:
        super().__init__(f"failed to persist generated asset_objects: {original_error}")


def _dict_or_empty(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _nested_dict(source: dict[str, Any], *keys: str) -> dict[str, Any]:
    for key in keys:
        value = source.get(key)
        if isinstance(value, dict):
            return value
    return {}


BROLL_SUBTITLE_TAIL_ALLOWED_MS = 4_000
BROLL_SUBTITLE_TAIL_FAIL_MIN_MS = 8_000
BROLL_SUBTITLE_TAIL_FAIL_RATIO = 0.12
TIMELINE_COVERAGE_TOLERANCE_MS = 250


PROGRESS_MODULES: tuple[dict[str, str], ...] = (
    {"key": "material_preparation", "label": "素材准备"},
    {"key": "material_match", "label": "素材匹配"},
    {"key": "voiceover", "label": "配音生成"},
    {"key": "lip_sync", "label": "lip_sync"},
    {"key": "subtitles", "label": "字幕与时间线"},
    {"key": "render", "label": "合成渲染"},
    {"key": "output_delivery", "label": "保存成片"},
)

OPENSTORYLINE_TOOL_MODULE_TOKENS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "material_preparation",
        (
            "prepare",
            "download",
            "input_asset",
        ),
    ),
    (
        "voiceover",
        (
            "generate_voiceover",
            "voiceover",
            "text_to_speech",
            "tts",
        ),
    ),
    (
        "lip_sync",
        (
            "lip_sync",
            "lipsync",
            "videoretalk",
            "retalk",
        ),
    ),
    (
        "subtitles",
        (
            "subtitle",
            "caption",
            "plan_timeline",
            "timeline",
            "generate_script",
            "local_asr",
            "asr",
        ),
    ),
    (
        "render",
        (
            "render_video",
            "compose_video",
            "export_video",
            "ffmpeg",
            "render",
        ),
    ),
    (
        "material_match",
        (
            "load_media",
            "search_media",
            "split_shots",
            "understand_clips",
            "group_clips",
            "filter_clips",
            "match",
            "clip",
            "media",
        ),
    ),
)

FAILURE_STAGE_BY_PROGRESS_MODULE = {
    "material_preparation": "upload",
    "material_match": "timeline",
    "voiceover": "clone_tts",
    "lip_sync": "lip_sync",
    "subtitles": "timeline",
    "render": "render",
    "output_delivery": "oss",
}

FAILURE_STAGES = frozenset({"upload", "asr", "clone_tts", "lip_sync", "timeline", "render", "oss"})
LIP_SYNC_AUDIO_ALLOWED_SUFFIXES = frozenset({".wav", ".mp3", ".aac"})
LIP_SYNC_AUDIO_MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024
LIP_SYNC_AUDIO_MIN_DURATION_MS_EXCLUSIVE = 2_000
LIP_SYNC_AUDIO_MAX_DURATION_MS_EXCLUSIVE = 120_000
LIP_SYNC_VIDEO_ALLOWED_SUFFIXES = frozenset({".mp4", ".avi", ".mov"})
LIP_SYNC_VIDEO_MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024
LIP_SYNC_VIDEO_MIN_DURATION_SECONDS_EXCLUSIVE = 2
LIP_SYNC_VIDEO_MAX_DURATION_SECONDS_EXCLUSIVE = 120
LIP_SYNC_VIDEO_MIN_FPS = 15
LIP_SYNC_VIDEO_MAX_FPS = 60
LIP_SYNC_VIDEO_ALLOWED_CODECS = frozenset({"h264", "h265", "hevc"})
LIP_SYNC_VIDEO_MIN_SIDE_PIXELS = 640
LIP_SYNC_VIDEO_MAX_SIDE_PIXELS = 2048


def _optional_bool(source: dict[str, Any], *keys: str, default: bool = True) -> bool:
    for key in keys:
        value = source.get(key)
        if isinstance(value, bool):
            return value
    return default


def _module_is_skipped(key: str, production_config: dict[str, Any]) -> bool:
    if key == "voiceover":
        return not _optional_bool(_nested_dict(production_config, "voiceover"), "enabled")
    if key == "lip_sync":
        return _nested_dict(production_config, "lip_sync", "lipSync").get("enabled") is not True
    if key == "subtitles":
        return not _optional_bool(_nested_dict(production_config, "subtitles"), "enabled")
    return False


def _progress_modules(
    *,
    active_key: str | None = None,
    failed_key: str | None = None,
    completed: bool = False,
    production_config: dict[str, Any] | None = None,
    active_progress_pct: int = 50,
    active_detail: str | None = None,
) -> list[dict[str, Any]]:
    production_config = production_config or {}
    active_index = next(
        (index for index, module in enumerate(PROGRESS_MODULES) if module["key"] == active_key),
        None,
    )
    failed_index = next(
        (index for index, module in enumerate(PROGRESS_MODULES) if module["key"] == failed_key),
        None,
    )
    modules: list[dict[str, Any]] = []

    for index, module in enumerate(PROGRESS_MODULES):
        key = module["key"]
        skipped = _module_is_skipped(key, production_config)
        status = "pending"
        progress_pct = 0

        if completed:
            status = "skipped" if skipped else "succeeded"
            progress_pct = 100
        elif failed_index is not None:
            if index < failed_index:
                status = "skipped" if skipped else "succeeded"
                progress_pct = 100
            elif index == failed_index:
                status = "failed"
                progress_pct = 100
            elif skipped:
                status = "skipped"
                progress_pct = 100
        elif active_index is not None:
            if index < active_index:
                status = "skipped" if skipped else "succeeded"
                progress_pct = 100
            elif index == active_index:
                status = "running"
                progress_pct = active_progress_pct
            elif skipped:
                status = "skipped"
                progress_pct = 100
        elif skipped:
            status = "skipped"
            progress_pct = 100

        modules.append(
            {
                "key": key,
                "label": module["label"],
                "status": status,
                "progress_pct": progress_pct,
                "detail": active_detail if index == active_index and active_detail else None,
            }
        )

    return modules


def _openstoryline_event_module_key(event: dict[str, Any]) -> str | None:
    text_parts = [
        event.get("name"),
        event.get("server"),
        event.get("tool_name"),
        event.get("node"),
        event.get("langgraph_node"),
        event.get("message"),
    ]
    args = event.get("args")
    if isinstance(args, dict):
        text_parts.extend(str(key) for key in args.keys())
    text = " ".join(str(value or "") for value in text_parts).lower()

    for key, tokens in OPENSTORYLINE_TOOL_MODULE_TOKENS:
        if any(token in text for token in tokens):
            return key
    return None


def _openstoryline_event_progress_pct(event: dict[str, Any]) -> int:
    if event.get("type") == "tool_start":
        return 5

    progress = event.get("progress")
    total = event.get("total")
    try:
        progress_value = float(progress)
        total_value = float(total) if total not in (None, 0, "0") else None
    except (TypeError, ValueError):
        return 100 if event.get("type") == "tool_end" else 50

    if total_value and total_value > 0:
        pct = progress_value / total_value * 100
    else:
        pct = progress_value if progress_value > 1 else progress_value * 100
    return max(5, min(100, round(pct)))


def _openstoryline_event_detail(event: dict[str, Any], module_key: str) -> str | None:
    message = event.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    name = event.get("name")
    if isinstance(name, str) and name.strip():
        return f"OpenStoryline 节点：{name.strip()}"
    label = next(
        (module["label"] for module in PROGRESS_MODULES if module["key"] == module_key),
        None,
    )
    return f"正在处理：{label}" if label else None


def _openstoryline_failure_module_key(exc: EngineRunError) -> str:
    if exc.module_key:
        return exc.module_key
    text = str(exc).lower()
    if any(token in text for token in ("lip_sync", "lipsync", "videoretalk", "retalk")):
        return "lip_sync"
    if "render_video" in text or "render" in text:
        return "render"
    if any(token in text for token in ("voiceover", "tts", "generate_voiceover")):
        return "voiceover"
    if any(token in text for token in ("timeline", "subtitle", "caption")):
        return "subtitles"
    return "material_match"


def _openstoryline_result_payload(
    raw_response: dict[str, Any],
    production_config: dict[str, Any],
) -> dict[str, Any]:
    openstoryline = _nested_dict(raw_response, "openstoryline")
    fire_red = _nested_dict(raw_response, "fire_red")
    selected_bgm = _nested_dict(openstoryline, "selected_bgm", "bgm") or _nested_dict(
        fire_red,
        "selected_bgm",
        "bgm",
    )
    voiceover = _extract_voiceover_payload(raw_response)
    production_config_used = _dict_or_empty(
        openstoryline.get("production_config_used")
    ) or production_config

    return {
        "engine_adapter": openstoryline.get("engine_adapter")
        or raw_response.get("engine_adapter")
        or "unknown",
        "session_id": openstoryline.get("session_id") or fire_red.get("session_id"),
        "production_config_used": production_config_used,
        "selected_bgm": selected_bgm,
        "voiceover": voiceover,
    }


def _extract_fire_red_run_id(raw_response: dict[str, Any] | None) -> str | None:
    if not isinstance(raw_response, dict):
        return None
    candidates: list[Any] = [
        raw_response.get("run_id"),
        raw_response.get("session_id"),
    ]
    for path in (
        ("fire_red", "run_id"),
        ("fire_red", "session_id"),
        ("openstoryline", "run_id"),
        ("openstoryline", "session_id"),
        ("fire_red_raw_response", "run_id"),
        ("fire_red_raw_response", "session_id"),
    ):
        cur: Any = raw_response
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        candidates.append(cur)
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _failure_context_value(job: VideoJob, *keys: str) -> str | None:
    for source in (job.input_payload, job.runtime_payload):
        if not isinstance(source, dict):
            continue
        for key in keys:
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        material_context = source.get("materialContext") or source.get("material_context")
        if isinstance(material_context, dict):
            for key in keys:
                value = material_context.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
    return None


def _partial_artifacts_payload(
    run_result: EngineRunResult | None,
    uploaded_assets: list[UploadedAsset] | None = None,
    persisted_assets: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    artifacts: dict[str, Any] = {}
    if run_result is not None:
        artifacts["local_outputs"] = {
            "final_video_path": str(run_result.final_video_path),
            "cover_image_path": str(run_result.cover_image_path) if run_result.cover_image_path else None,
            "subtitle_path": str(run_result.subtitle_path) if run_result.subtitle_path else None,
            "metadata_path": str(run_result.metadata_path),
        }
    if uploaded_assets:
        artifacts["uploaded_objects"] = [
            {
                "asset_type": asset.asset_type,
                "storage_provider": asset.storage_provider,
                "bucket_name": asset.bucket_name,
                "storage_key": asset.storage_key,
            }
            for asset in uploaded_assets
        ]
    if persisted_assets:
        artifacts["persisted_assets"] = persisted_assets
    return artifacts


def _final_asset_reference(
    uploaded_assets: list[UploadedAsset] | None = None,
    persisted_assets: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if persisted_assets:
        final = next(
            (asset for asset in persisted_assets if asset.get("asset_type") == "video"),
            persisted_assets[0],
        )
        return {
            "final_asset_id": final.get("asset_id"),
            "object_key": final.get("storage_key"),
        }
    if uploaded_assets:
        final_upload = next(
            (asset for asset in uploaded_assets if asset.asset_type == "video"),
            uploaded_assets[0],
        )
        return {
            "final_asset_id": None,
            "object_key": final_upload.storage_key,
        }
    return {"final_asset_id": None, "object_key": None}


def _summarize_failure(error: Any, max_length: int = 800) -> str:
    summary = str(error or "").strip()
    if len(summary) > max_length:
        return summary[:max_length] + "...<truncated>"
    return summary


def _number_value(source: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = source.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int | float):
            return float(value)
    return None


def _failure_stage_from_context(
    *,
    stage: str,
    error: Any,
    module_key: str | None = None,
) -> str:
    text = f"{stage} {module_key or ''} {error}".lower()
    if "asr" in text or "local_asr" in text:
        return "asr"
    if "lip_sync" in text or "lipsync" in text or "videoretalk" in text or "retalk" in text:
        return "lip_sync"
    if stage in {"input_asset_validation", "downloading_inputs", "directive_validation"}:
        return "upload"
    if stage in {"voice_profile_reference", "voiceover_artifact_validation"}:
        return "clone_tts"
    if stage == "lip_sync_input_validation":
        return "lip_sync"
    if stage in {"uploading_outputs", "asset_objects_persistence"}:
        return "oss"
    if stage == "output_validation":
        return "render"
    if module_key:
        mapped = FAILURE_STAGE_BY_PROGRESS_MODULE.get(module_key)
        if mapped:
            return mapped
    return "timeline"


def _annotate_failure_log(
    log_payload: dict[str, Any],
    *,
    job: VideoJob,
    stage: str,
    error: Any,
    module_key: str | None = None,
    run_result: EngineRunResult | None = None,
    uploaded_assets: list[UploadedAsset] | None = None,
    persisted_assets: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    failure_stage = _failure_stage_from_context(
        stage=stage,
        error=error,
        module_key=module_key,
    )
    if failure_stage not in FAILURE_STAGES:
        failure_stage = "timeline"
    partial_artifacts = _partial_artifacts_payload(
        run_result,
        uploaded_assets=uploaded_assets,
        persisted_assets=persisted_assets,
    )
    final_asset = _final_asset_reference(
        uploaded_assets=uploaded_assets,
        persisted_assets=persisted_assets,
    )
    failure_record = {
        "video_edit_job_id": job.id,
        "daily_task_id": _failure_context_value(job, "dailyTaskId", "daily_task_id"),
        "member_user_id": _failure_context_value(
            job,
            "memberUserId",
            "member_user_id",
            "createdByUserId",
            "created_by_user_id",
        )
        or job.created_by_user_id,
        "final_asset_id": final_asset["final_asset_id"],
        "object_key": final_asset["object_key"],
        "fire_red_run_id": _extract_fire_red_run_id(run_result.raw_response if run_result else None),
        "failure_summary": _summarize_failure(error),
        "failure_stage": failure_stage,
        "partial_artifacts": partial_artifacts,
    }
    return {
        **log_payload,
        "failure_diagnostic": failure_record,
        "failure_stage": failure_stage,
    }


def _voiceover_artifacts_summary(
    raw_response: dict[str, Any],
    production_config: dict[str, Any],
) -> dict[str, Any]:
    voiceover_config = _nested_dict(production_config, "voiceover")
    voiceover = _extract_voiceover_payload(raw_response)
    segments = voiceover.get("voiceover")
    if not isinstance(segments, list):
        segments = []
    total_duration_ms = 0
    providers: list[str] = []
    normalized_segments: list[dict[str, Any]] = []
    for segment in segments:
        if isinstance(segment, dict) and isinstance(segment.get("duration"), int | float):
            total_duration_ms += int(segment["duration"])
        if isinstance(segment, dict):
            provider = str(segment.get("provider") or "").strip()
            if provider and provider not in providers:
                providers.append(provider)
            normalized_segments.append(
                {
                    "voiceover_id": segment.get("voiceover_id"),
                    "group_id": segment.get("group_id"),
                    "path": segment.get("path"),
                    "duration_ms": segment.get("duration_ms") or segment.get("duration"),
                    "provider": provider or None,
                    "clone": segment.get("clone"),
                }
            )

    provider = voiceover.get("provider") or voiceover_config.get("provider")
    if not providers and provider:
        providers.append(str(provider))

    return {
        "provider": provider,
        "providers": providers,
        "mode": voiceover_config.get("mode", "system"),
        "clone_enabled": bool(voiceover_config.get("clone_enabled")),
        "voice_profile_id": voiceover_config.get("voice_profile_id"),
        "ref_audio_asset_id": voiceover_config.get("ref_audio_asset_id"),
        "segment_count": len(segments),
        "total_duration_ms": total_duration_ms,
        "segments": normalized_segments,
        "error_summary": None,
    }


def _extract_voiceover_payload(raw_response: dict[str, Any]) -> dict[str, Any]:
    candidates = (
        ("openstoryline", "voiceover"),
        ("fire_red", "voiceover"),
        ("fire_red", "raw_response", "generate_voiceover"),
        ("fire_red_raw_response", "generate_voiceover"),
        ("generate_voiceover",),
        ("fire_red", "generate_voiceover"),
    )
    for path in candidates:
        cur: Any = raw_response
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if isinstance(cur, dict) and cur:
            return cur
    return {}


def _extract_lip_sync_payload(raw_response: dict[str, Any]) -> dict[str, Any]:
    candidates = (
        ("openstoryline", "lip_sync"),
        ("fire_red", "lip_sync"),
        ("fire_red", "raw_response", "lip_sync"),
        ("fire_red_raw_response", "lip_sync"),
        ("lip_sync",),
        ("fire_red", "generate_lip_sync"),
    )
    for path in candidates:
        cur: Any = raw_response
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if isinstance(cur, dict) and cur:
            return cur
    return {}


def _max_timeline_end_ms(items: Any) -> int:
    if not isinstance(items, list):
        return 0
    max_end = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        timeline = item.get("timeline_window") if isinstance(item.get("timeline_window"), dict) else {}
        value = _number_value(timeline, "end")
        if value is not None:
            max_end = max(max_end, int(value))
    return max_end


def _timeline_start_end_ms(item: dict[str, Any]) -> tuple[int, int]:
    timeline = item.get("timeline_window") if isinstance(item.get("timeline_window"), dict) else {}
    start = _number_value(timeline, "start") or 0
    end = _number_value(timeline, "end") or start
    return int(start), int(end)


def _voiceover_windows_by_group(voiceover_track: Any) -> dict[str, list[tuple[int, int]]]:
    windows: dict[str, list[tuple[int, int]]] = {}
    if not isinstance(voiceover_track, list):
        return windows
    for item in voiceover_track:
        if not isinstance(item, dict):
            continue
        group_id = str(item.get("group_id") or "")
        if not group_id:
            continue
        start, end = _timeline_start_end_ms(item)
        if end <= start:
            continue
        windows.setdefault(group_id, []).append((start, end))
    return windows


def _retalked_windows_by_segment(segments: Any) -> dict[tuple[str, str], tuple[int, int]]:
    windows: dict[tuple[str, str], tuple[int, int]] = {}
    if not isinstance(segments, list):
        return windows
    for item in segments:
        if not isinstance(item, dict):
            continue
        group_id = str(item.get("group_id") or "")
        clip_id = str(item.get("clip_id") or "")
        if not group_id or not clip_id:
            continue
        timeline = item.get("timeline_window")
        if not isinstance(timeline, dict):
            continue
        start = _number_value(timeline, "start") or 0
        end = _number_value(timeline, "end") or start
        if end > start:
            windows[(group_id, clip_id)] = (int(start), int(end))
    return windows


def _iter_talking_head_label_values(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    values: list[str] = []
    for key in ("role", "scene_type", "sceneType", "asset_type", "assetType", "content_type", "contentType"):
        value = payload.get(key)
        if isinstance(value, str):
            values.append(value)
    for key in ("tags", "labels"):
        value = payload.get(key)
        if isinstance(value, list | tuple | set):
            values.extend(str(item) for item in value)
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        values.extend(_iter_talking_head_label_values(metadata))
    source_ref = payload.get("source_ref")
    if isinstance(source_ref, dict):
        values.extend(_iter_talking_head_label_values(source_ref))
    return values


def _timeline_clip_lookup(raw_response: dict[str, Any]) -> dict[str, dict[str, Any]]:
    split_shots = _extract_split_shots_payload(raw_response)
    clips = split_shots.get("clips") if isinstance(split_shots, dict) else None
    if not isinstance(clips, list):
        return {}
    return {
        str(clip.get("clip_id")): clip
        for clip in clips
        if isinstance(clip, dict) and clip.get("clip_id") is not None
    }


def _is_talking_head_timeline_segment(
    segment: dict[str, Any],
    clip_lookup: dict[str, dict[str, Any]] | None = None,
) -> bool:
    values = _iter_talking_head_label_values(segment)
    if clip_lookup:
        clip = clip_lookup.get(str(segment.get("clip_id") or ""))
        if isinstance(clip, dict):
            values.extend(_iter_talking_head_label_values(clip))
    normalized = {value.strip().lower().replace("_", "-") for value in values if value.strip()}
    return bool({"talking-head", "talkinghead", "user-talking-head", "真人口播", "口播"} & normalized)


def _validate_timeline_quality_for_directive(
    raw_response: dict[str, Any],
    production_config: dict[str, Any],
) -> None:
    plan_timeline = _extract_plan_timeline_payload(raw_response)
    tracks = plan_timeline.get("tracks") if isinstance(plan_timeline, dict) else None
    if not isinstance(tracks, dict):
        return
    video_track = tracks.get("video")
    if not isinstance(video_track, list) or not video_track:
        return

    typed_video_track = [segment for segment in video_track if isinstance(segment, dict)]
    clip_lookup = _timeline_clip_lookup(raw_response)
    for segment in typed_video_track:
        playback_rate = _number_value(segment, "playback_rate")
        if playback_rate is not None and float(playback_rate) < 1.0:
            raise VoiceoverArtifactValidationError(
                "timeline video segment uses playback_rate < 1.0 to stretch material duration",
                failure_code="timeline_video_slowdown_blocked",
            )

    video_end_ms = _max_timeline_end_ms(typed_video_track)
    subtitle_end_ms = _max_timeline_end_ms(tracks.get("subtitles"))
    if video_end_ms > 0 and subtitle_end_ms > 0:
        tail_gap_ms = video_end_ms - subtitle_end_ms
        tail_segments = [
            segment
            for segment in typed_video_track
            if _timeline_start_end_ms(segment)[1] > subtitle_end_ms + TIMELINE_COVERAGE_TOLERANCE_MS
        ]
        if tail_gap_ms > TIMELINE_COVERAGE_TOLERANCE_MS and any(
            _is_talking_head_timeline_segment(s, clip_lookup) for s in tail_segments
        ):
            raise VoiceoverArtifactValidationError(
                "talking-head segment continues after subtitle timeline ends",
                failure_code="timeline_talking_head_after_subtitles",
            )
        abnormal_broll_gap = tail_gap_ms > max(
            BROLL_SUBTITLE_TAIL_FAIL_MIN_MS,
            int(video_end_ms * BROLL_SUBTITLE_TAIL_FAIL_RATIO),
        )
        if tail_gap_ms > BROLL_SUBTITLE_TAIL_ALLOWED_MS and abnormal_broll_gap:
            raise VoiceoverArtifactValidationError(
                "subtitle timeline ends too early compared with final video timeline",
                failure_code="timeline_subtitle_tail_gap_too_long",
            )

    lip_sync_config = _nested_dict(production_config, "lip_sync", "lipSync")
    if lip_sync_config.get("enabled") is not True:
        return
    lip_payload = _extract_lip_sync_payload(raw_response)
    retalked_windows = _retalked_windows_by_segment(lip_payload.get("segments"))
    voiceover_windows = _voiceover_windows_by_group(tracks.get("voiceover"))
    for (group_id, clip_id), (seg_start, seg_end) in retalked_windows.items():
        voice_windows = voiceover_windows.get(group_id) or []
        covered_by_voice = any(
            start <= seg_start + TIMELINE_COVERAGE_TOLERANCE_MS
            and end + TIMELINE_COVERAGE_TOLERANCE_MS >= seg_end
            for start, end in voice_windows
        )
        if not covered_by_voice:
            raise VoiceoverArtifactValidationError(
                "retalked talking-head segment is not covered by a matching voiceover window",
                failure_code="lip_sync_talking_head_voiceover_window_gap",
            )
    for segment in typed_video_track:
        if not _is_talking_head_timeline_segment(segment, clip_lookup):
            continue
        group_id = str(segment.get("group_id") or "")
        clip_id = str(segment.get("clip_id") or "")
        seg_start, seg_end = _timeline_start_end_ms(segment)
        lip_window = retalked_windows.get((group_id, clip_id))
        if lip_window is None:
            raise VoiceoverArtifactValidationError(
                "talking-head timeline segment was not retalked by lip_sync",
                failure_code="lip_sync_talking_head_unretalked",
            )
        lip_start, lip_end = lip_window
        covered_by_lip = (
            lip_start <= seg_start + TIMELINE_COVERAGE_TOLERANCE_MS
            and lip_end + TIMELINE_COVERAGE_TOLERANCE_MS >= seg_end
        )
        if not covered_by_lip:
            raise VoiceoverArtifactValidationError(
                "talking-head timeline segment is not fully covered by lip_sync retalked window",
                failure_code="lip_sync_talking_head_unretalked",
            )
        voice_windows = voiceover_windows.get(group_id) or []
        covered_by_voice = any(
            start <= seg_start + TIMELINE_COVERAGE_TOLERANCE_MS
            and end + TIMELINE_COVERAGE_TOLERANCE_MS >= seg_end
            for start, end in voice_windows
        )
        if not covered_by_voice:
            raise VoiceoverArtifactValidationError(
                "talking-head timeline segment is not covered by a matching voiceover window",
                failure_code="lip_sync_talking_head_voiceover_window_gap",
            )


def _extract_plan_timeline_payload(raw_response: dict[str, Any]) -> dict[str, Any]:
    candidates = (
        ("openstoryline", "lip_sync", "plan_timeline"),
        ("fire_red", "lip_sync", "plan_timeline"),
        ("fire_red", "raw_response", "lip_sync", "plan_timeline"),
        ("fire_red_raw_response", "lip_sync", "plan_timeline"),
        ("lip_sync", "plan_timeline"),
        ("openstoryline", "plan_timeline"),
        ("fire_red", "plan_timeline"),
        ("fire_red", "raw_response", "plan_timeline"),
        ("fire_red_raw_response", "plan_timeline"),
        ("plan_timeline",),
    )
    for path in candidates:
        cur: Any = raw_response
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if isinstance(cur, dict) and cur:
            return cur
    return {}


def _extract_split_shots_payload(raw_response: dict[str, Any]) -> dict[str, Any]:
    candidates = (
        ("openstoryline", "split_shots"),
        ("fire_red", "split_shots"),
        ("fire_red", "raw_response", "split_shots"),
        ("fire_red_raw_response", "split_shots"),
        ("split_shots",),
    )
    for path in candidates:
        cur: Any = raw_response
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if isinstance(cur, dict) and cur:
            return cur
    return {}


def _validate_lip_sync_artifacts_for_directive(
    raw_response: dict[str, Any],
    production_config: dict[str, Any],
) -> dict[str, Any]:
    lip_sync_config = _nested_dict(production_config, "lip_sync", "lipSync")
    if lip_sync_config.get("enabled") is not True:
        return {}

    payload = _extract_lip_sync_payload(raw_response)
    segments = payload.get("segments") if isinstance(payload, dict) else None
    if not isinstance(segments, list) or not segments:
        raise VoiceoverArtifactValidationError(
            "lip_sync enabled but no retalked talking-head segments were produced",
            failure_code="lip_sync_artifacts_missing",
        )
    plan_timeline = payload.get("plan_timeline")
    tracks = plan_timeline.get("tracks") if isinstance(plan_timeline, dict) else None
    video_track = tracks.get("video") if isinstance(tracks, dict) else None
    if not isinstance(video_track, list) or not video_track:
        raise VoiceoverArtifactValidationError(
            "lip_sync enabled but retalked plan_timeline is missing",
            failure_code="lip_sync_plan_timeline_missing",
        )
    retalked_paths = {
        str(item.get("retalked_path") or "")
        for item in segments
        if isinstance(item, dict) and item.get("retalked_path")
    }
    consumed = [
        item
        for item in video_track
        if isinstance(item, dict)
        and str(item.get("source_path") or "") in retalked_paths
    ]
    if len(consumed) < len(retalked_paths):
        raise VoiceoverArtifactValidationError(
            "lip_sync produced retalked segments but render timeline does not consume them",
            failure_code="lip_sync_render_input_not_retalked",
        )
    return payload


def _is_clone_voiceover_summary(summary: dict[str, Any]) -> bool:
    provider_values = [
        str(summary.get("provider") or ""),
        *[str(item or "") for item in summary.get("providers", [])],
    ]
    return any(
        "clone" in value.strip().lower() or value.strip().lower() == "pixelle_clone"
        for value in provider_values
    )


def _validate_voiceover_artifacts_for_directive(
    summary: dict[str, Any],
    production_config: dict[str, Any],
) -> None:
    voiceover_config = _nested_dict(production_config, "voiceover")
    if voiceover_config.get("enabled") is False:
        return
    if not bool(voiceover_config.get("clone_enabled")):
        return
    if _nested_dict(production_config, "render").get("preserve_talking_head_original_audio"):
        if _is_clone_voiceover_summary(summary):
            return
    if int(summary.get("segment_count") or 0) <= 0 or int(summary.get("total_duration_ms") or 0) <= 0:
        raise VoiceoverArtifactValidationError(
            "clone voiceover produced no measurable voiceover segments",
            failure_code="voiceover_clone_artifacts_missing",
        )
    if not _is_clone_voiceover_summary(summary):
        raise VoiceoverArtifactValidationError(
            "voice_profile job did not use clone voiceover provider",
            failure_code="voiceover_clone_provider_not_used",
        )


def _validate_lip_sync_audio_inputs(summary: dict[str, Any]) -> None:
    segments = summary.get("segments")
    if not isinstance(segments, list):
        segments = []
    if not segments:
        raise VoiceoverArtifactValidationError(
            "lip_sync requires at least one cloned voiceover audio segment",
            failure_code="lip_sync_audio_missing",
        )

    for segment in segments:
        if not isinstance(segment, dict):
            continue
        path_value = segment.get("path")
        if not isinstance(path_value, str) or not path_value.strip():
            raise VoiceoverArtifactValidationError(
                "lip_sync cloned audio segment is missing a local path",
                failure_code="lip_sync_audio_path_missing",
            )
        audio_path = Path(path_value)
        suffix = audio_path.suffix.lower()
        if suffix not in LIP_SYNC_AUDIO_ALLOWED_SUFFIXES:
            raise VoiceoverArtifactValidationError(
                "lip_sync cloned audio must be wav, mp3, or aac",
                failure_code="lip_sync_audio_format_unsupported",
            )
        if audio_path.exists() and audio_path.stat().st_size > LIP_SYNC_AUDIO_MAX_FILE_SIZE_BYTES:
            raise VoiceoverArtifactValidationError(
                "lip_sync cloned audio exceeds 30MB",
                failure_code="lip_sync_audio_too_large",
            )
        duration_ms = _number_value(segment, "duration_ms", "duration")
        if duration_ms is None:
            raise VoiceoverArtifactValidationError(
                "lip_sync cloned audio duration is missing",
                failure_code="lip_sync_audio_duration_missing",
            )
        if not (
            LIP_SYNC_AUDIO_MIN_DURATION_MS_EXCLUSIVE
            < int(duration_ms)
            < LIP_SYNC_AUDIO_MAX_DURATION_MS_EXCLUSIVE
        ):
            raise VoiceoverArtifactValidationError(
                "lip_sync cloned audio duration must be greater than 2s and less than 120s",
                failure_code="lip_sync_audio_duration_out_of_range",
            )


def _validate_lip_sync_video_inputs(input_assets: list[dict[str, Any]]) -> None:
    talking_head_assets = [
        asset
        for asset in input_assets
        if str(asset.get("role") or "").strip().lower() == "talking_head"
        or str(asset.get("scene_type") or "").strip().lower() == "talking_head"
        or "talking_head" in {str(item).strip().lower() for item in asset.get("tags", []) if str(item).strip()}
        or str(_nested_dict(asset, "metadata").get("content_type") or "").strip().lower() == "talking_head"
    ]
    if not talking_head_assets:
        raise VoiceoverArtifactValidationError(
            "lip_sync requires a talking_head input video",
            failure_code="lip_sync_video_missing",
        )

    for asset in talking_head_assets:
        local_path_value = asset.get("local_path")
        file_name = str(asset.get("file_name") or local_path_value or "").strip()
        suffix = Path(file_name).suffix.lower()
        if suffix not in LIP_SYNC_VIDEO_ALLOWED_SUFFIXES:
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video must be mp4, avi, or mov",
                failure_code="lip_sync_video_format_unsupported",
            )
        local_path = Path(str(local_path_value)) if isinstance(local_path_value, str) and local_path_value else None
        if local_path and local_path.exists() and local_path.stat().st_size > LIP_SYNC_VIDEO_MAX_FILE_SIZE_BYTES:
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video exceeds 300MB",
                failure_code="lip_sync_video_too_large",
            )
        metadata = _nested_dict(asset, "metadata")
        duration_seconds = _number_value(metadata, "durationSeconds", "duration_seconds", "duration")
        if duration_seconds is not None and not (
            LIP_SYNC_VIDEO_MIN_DURATION_SECONDS_EXCLUSIVE
            < duration_seconds
            < LIP_SYNC_VIDEO_MAX_DURATION_SECONDS_EXCLUSIVE
        ):
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video duration must be greater than 2s and less than 120s",
                failure_code="lip_sync_video_duration_out_of_range",
            )
        file_size_bytes = _number_value(metadata, "fileSizeBytes", "file_size_bytes")
        if file_size_bytes is not None and file_size_bytes > LIP_SYNC_VIDEO_MAX_FILE_SIZE_BYTES:
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video exceeds 300MB",
                failure_code="lip_sync_video_too_large",
            )
        width = _number_value(metadata, "width")
        height = _number_value(metadata, "height")
        if width is not None and height is not None:
            if not (
                LIP_SYNC_VIDEO_MIN_SIDE_PIXELS
                <= width
                <= LIP_SYNC_VIDEO_MAX_SIDE_PIXELS
                and LIP_SYNC_VIDEO_MIN_SIDE_PIXELS
                <= height
                <= LIP_SYNC_VIDEO_MAX_SIDE_PIXELS
            ):
                raise VoiceoverArtifactValidationError(
                    "lip_sync talking-head video width and height must each be 640-2048 pixels",
                    failure_code="lip_sync_video_resolution_out_of_range",
                )
        fps = _number_value(metadata, "fps", "frameRate", "frame_rate")
        if fps is not None and not (LIP_SYNC_VIDEO_MIN_FPS <= fps <= LIP_SYNC_VIDEO_MAX_FPS):
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video fps must be 15-60",
                failure_code="lip_sync_video_fps_out_of_range",
            )
        codec = str(metadata.get("codec") or metadata.get("videoCodec") or metadata.get("video_codec") or "").strip().lower()
        if codec and codec not in LIP_SYNC_VIDEO_ALLOWED_CODECS:
            raise VoiceoverArtifactValidationError(
                "lip_sync talking-head video codec must be H.264 or H.265",
                failure_code="lip_sync_video_codec_unsupported",
            )


def _validate_lip_sync_inputs_for_directive(
    summary: dict[str, Any],
    production_config: dict[str, Any],
    input_assets: list[dict[str, Any]],
) -> None:
    lip_sync = _nested_dict(production_config, "lip_sync", "lipSync")
    if lip_sync.get("enabled") is not True:
        return
    voiceover = _nested_dict(production_config, "voiceover")
    if lip_sync.get("require_voice_profile", lip_sync.get("requireVoiceProfile", True)) is not False:
        if voiceover.get("mode") != "voice_profile" or not _is_clone_voiceover_summary(summary):
            raise VoiceoverArtifactValidationError(
                "lip_sync requires a successfully cloned voice_profile voiceover",
                failure_code="lip_sync_voice_profile_required",
            )
    _validate_lip_sync_audio_inputs(summary)
    _validate_lip_sync_video_inputs(input_assets)


class JobProcessor:
    def __init__(
        self,
        settings: Settings,
        repository: VideoJobRepository,
        cos_client: ObjectStorageClient,
        openstoryline_client: OpenStorylineClient,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._cos_client = cos_client
        self._openstoryline_client = openstoryline_client

    def _workspace_for(self, job: VideoJob) -> tuple[Path, Path, Path]:
        job_temp_dir = self._settings.worker_temp_root / "jobs" / job.id
        input_dir = job_temp_dir / "inputs"
        output_dir = self._settings.worker_output_root / "jobs" / job.id
        input_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        return job_temp_dir, input_dir, output_dir

    def _download_inputs(self, job: VideoJob, input_dir: Path) -> list[dict[str, Any]]:
        downloaded_assets: list[dict[str, Any]] = []
        default_buckets = getattr(
            self._settings,
            "default_input_buckets",
            getattr(self._settings, "cos_bucket", ""),
        )
        default_storage_provider = getattr(self._settings, "storage_provider", "aliyun_oss")
        for asset in job.input_assets(
            default_buckets,
            default_storage_provider=default_storage_provider,
        ):
            downloaded_assets.append(self._download_input_asset(asset, input_dir))
        return downloaded_assets

    def _download_input_asset(self, asset: InputAsset, input_dir: Path) -> dict[str, Any]:
        local_path = input_dir / asset.file_name
        try:
            self._cos_client.download_file(
                storage_key=asset.storage_key,
                destination=local_path,
                bucket_name=asset.bucket_name,
                storage_provider=asset.storage_provider,
            )
        except Exception as exc:
            raise InputDownloadError(asset.storage_key, exc) from exc
        downloaded: dict[str, Any] = {
            "asset_id": asset.asset_id,
            "asset_type": asset.asset_type,
            "storage_provider": asset.storage_provider,
            "storage_key": asset.storage_key,
            "file_name": asset.file_name,
            "local_path": str(local_path),
        }
        if asset.role:
            downloaded["role"] = asset.role
        if asset.scene_type:
            downloaded["scene_type"] = asset.scene_type
        if asset.tags:
            downloaded["tags"] = list(asset.tags)
        if asset.labels:
            downloaded["labels"] = list(asset.labels)
        if asset.metadata:
            downloaded["metadata"] = asset.metadata
        return downloaded

    def _prepare_voice_profile_reference(
        self,
        production_config: dict[str, Any],
        input_dir: Path,
    ) -> dict[str, Any]:
        voiceover = _nested_dict(production_config, "voiceover")
        if voiceover.get("mode") != "voice_profile":
            return production_config
        ref_audio_asset = _nested_dict(voiceover, "ref_audio_asset", "refAudioAsset")
        storage_key = str(
            ref_audio_asset.get("storage_key") or ref_audio_asset.get("storageKey") or ""
        ).strip()
        if not storage_key:
            raise VoiceProfileReferenceError(
                "voice_profile voiceover requires ref_audio_asset.storage_key"
            )
        bucket_name = str(
            ref_audio_asset.get("bucket_name") or ref_audio_asset.get("bucketName") or ""
        ).strip()
        storage_provider = str(
            ref_audio_asset.get("storage_provider")
            or ref_audio_asset.get("storageProvider")
            or getattr(self._settings, "storage_provider", "aliyun_oss")
        ).strip()

        local_path = input_dir / "voice_profile_ref_audio" / Path(storage_key).name
        try:
            self._cos_client.download_file(
                storage_key=storage_key,
                destination=local_path,
                bucket_name=bucket_name or None,
                storage_provider=storage_provider,
            )
        except Exception as exc:
            raise InputDownloadError(storage_key, exc) from exc

        return {
            **production_config,
            "voiceover": {
                **voiceover,
                "ref_audio": str(local_path),
            },
        }

    def _upload_outputs(
        self,
        job: VideoJob,
        desired_outputs: tuple[str, ...],
        final_video_path: Path,
        cover_image_path: Path | None,
        subtitle_path: Path | None,
    ) -> list[UploadedAsset]:
        def upload(local_path: Path, asset_type: str) -> UploadedAsset:
            storage_key = job.output_object_key(
                asset_type,
                getattr(self._settings, "storage_result_prefix", self._settings.cos_result_prefix),
            )
            try:
                return self._cos_client.upload_file(
                    local_path=local_path,
                    storage_key=storage_key,
                    asset_type=asset_type,
                    storage_provider=getattr(self._settings, "storage_provider", "aliyun_oss"),
                )
            except Exception as exc:
                raise OutputUploadError(storage_key, exc) from exc

        uploaded_assets = [
            upload(final_video_path, "video")
        ]
        if "cover" in desired_outputs and cover_image_path and cover_image_path.exists():
            uploaded_assets.append(upload(cover_image_path, "cover"))
        if "subtitles" in desired_outputs and subtitle_path and subtitle_path.exists():
            uploaded_assets.append(upload(subtitle_path, "subtitle"))
        return uploaded_assets

    def _validate_outputs(
        self,
        desired_outputs: tuple[str, ...],
        run_result: EngineRunResult,
    ) -> None:
        required_paths = {"final_video": run_result.final_video_path}
        if "cover" in desired_outputs:
            required_paths["cover"] = run_result.cover_image_path
        if "subtitles" in desired_outputs:
            required_paths["subtitles"] = run_result.subtitle_path

        missing_outputs = [
            output_name
            for output_name, output_path in required_paths.items()
            if output_path is None or not output_path.is_file()
        ]
        if missing_outputs:
            if "final_video" in missing_outputs:
                raise OutputValidationError(
                    missing_outputs,
                    failure_code="FINAL_VIDEO_MISSING",
                    failure_status="failed_manual",
                )
            raise OutputValidationError(missing_outputs)

    def _cos_output_configured(self) -> bool:
        return bool(
            getattr(
                self._settings,
                "output_storage_configured",
                getattr(self._settings, "cos_output_configured", True),
            )
        )

    def _local_outputs_payload(self, run_result: EngineRunResult) -> dict[str, str | None]:
        return {
            "final_video_path": str(run_result.final_video_path),
            "cover_image_path": str(run_result.cover_image_path)
            if run_result.cover_image_path
            else None,
            "subtitle_path": str(run_result.subtitle_path)
            if run_result.subtitle_path
            else None,
            "metadata_path": str(run_result.metadata_path),
        }

    def _outputs_payload(self, uploaded_assets: list[UploadedAsset]) -> dict[str, str]:
        output_keys = {"video": "final_video", "cover": "cover", "subtitle": "subtitles"}
        return {
            output_keys[asset.asset_type]: asset.storage_key
            for asset in uploaded_assets
            if asset.asset_type in output_keys
        }

    def _uploaded_assets_payload(
        self,
        uploaded_assets: list[UploadedAsset],
        persisted_assets: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if persisted_assets is not None:
            return persisted_assets
        return [
            {
                "asset_type": asset.asset_type,
                "bucket_name": asset.bucket_name,
                "storage_provider": asset.storage_provider,
                "storage_key": asset.storage_key,
                "mime_type": asset.mime_type,
                "etag": asset.etag,
                "file_size_bytes": asset.file_size_bytes,
            }
            for asset in uploaded_assets
        ]

    def process(self, job: VideoJob) -> None:
        job_started_at = time.monotonic()
        log_payload: dict[str, Any] = {
            "steps": [],
            "timings_ms": {},
            "worker": {"id": getattr(self._settings, "worker_id", "video-worker")},
        }

        def record_timing(stage: str, started_at: float) -> None:
            timings = _dict_or_empty(log_payload.get("timings_ms"))
            timings[stage] = int((time.monotonic() - started_at) * 1000)
            timings["total_elapsed"] = int((time.monotonic() - job_started_at) * 1000)
            log_payload["timings_ms"] = timings

        try:
            directive = build_production_directive(job)
        except DirectiveValidationError as exc:
            record_timing("directive_validation", job_started_at)
            log_payload["steps"].append(
                {
                    "stage": "directive_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="directive_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload=_annotate_failure_log(
                    log_payload,
                    job=job,
                    stage="directive_validation",
                    error=exc,
                ),
                status=exc.failure_status,
            )
            return

        workspace_dir, input_dir, output_dir = self._workspace_for(job)
        existing_runtime_payload = _dict_or_empty(job.runtime_payload)
        uploaded_assets: list[UploadedAsset] = []
        persisted_assets: list[dict[str, Any]] = []
        self_hosted_fast_path = (
            directive.execution_mode == "self_hosted_rehearsal_fast_path"
            or existing_runtime_payload.get("self_hosted_rehearsal_fast_path") is True
        )

        def stage_runtime_payload(**payload: Any) -> dict[str, Any]:
            runtime_payload = {
                **payload,
                "execution_mode": directive.execution_mode,
            }
            if self_hosted_fast_path:
                runtime_payload["self_hosted_rehearsal_fast_path"] = True
            return runtime_payload

        record_timing("directive_validation", job_started_at)
        log_payload["steps"].append(
            {
                "stage": "directive_validation",
                "status": "succeeded",
                "execution_mode": directive.execution_mode,
                "desired_outputs": list(directive.desired_outputs),
                "locked_fields": list(directive.locked_fields),
            }
        )
        self._repository.update_stage(
            job.id,
            status="preparing",
            current_stage="downloading_inputs",
            progress_pct=10,
            runtime_payload=stage_runtime_payload(
                workspace_dir=str(workspace_dir),
                output_dir=str(output_dir),
                progress_modules=_progress_modules(
                    active_key="material_preparation",
                    production_config=directive.production_config,
                ),
            ),
            log_payload=log_payload,
        )
        run_result: EngineRunResult | None = None
        lip_sync_artifacts: dict[str, Any] = {}
        try:
            stage_started_at = time.monotonic()
            user_input_assets = self._download_inputs(job, input_dir)
            input_assets = list(user_input_assets)
            directive_production_config = self._prepare_voice_profile_reference(
                directive.production_config,
                input_dir,
            )
            if directive_production_config is not directive.production_config:
                directive = ProductionDirective(
                    job_id=directive.job_id,
                    execution_mode=directive.execution_mode,
                    script_text=directive.script_text,
                    script_locked=directive.script_locked,
                    target_platform=directive.target_platform,
                    aspect_ratio=directive.aspect_ratio,
                    desired_outputs=directive.desired_outputs,
                    locked_fields=directive.locked_fields,
                    source=directive.source,
                    material_context=directive.material_context,
                    production_config=directive_production_config,
                )
            record_timing("downloading_inputs", stage_started_at)
            log_payload["steps"].append(
                {
                    "stage": "downloading_inputs",
                    "inputs_downloaded": len(input_assets),
                    "user_inputs_downloaded": len(user_input_assets),
                    "material_library_prefetch": "disabled_openstoryline_search_media",
                    "voice_profile_ref_audio_prepared": (
                        directive.production_config.get("voiceover", {}).get("mode")
                        == "voice_profile"
                    ),
                }
            )
            self._repository.update_stage(
                job.id,
                status="running",
                current_stage="openstoryline_rendering",
                progress_pct=50,
                runtime_payload=stage_runtime_payload(
                    workspace_dir=str(workspace_dir),
                    output_dir=str(output_dir),
                    input_assets=input_assets,
                    progress_modules=_progress_modules(
                        active_key="material_match",
                        production_config=directive.production_config,
                    ),
                ),
                log_payload=log_payload,
            )

            progress_state = {
                "active_key": "material_match",
                "progress_pct": 50,
                "event_count": 0,
            }

            def handle_openstoryline_progress(event: dict[str, Any]) -> None:
                module_key = _openstoryline_event_module_key(event)
                if module_key is None:
                    return

                progress_state["active_key"] = module_key
                progress_state["event_count"] += 1
                event_progress = _openstoryline_event_progress_pct(event)
                if event.get("type") == "tool_end" and module_key != "render":
                    active_progress = 100
                else:
                    active_progress = event_progress
                progress_state["progress_pct"] = max(
                    int(progress_state["progress_pct"]),
                    min(75, 50 + int(progress_state["event_count"]) * 4),
                )
                log_payload["openstoryline_progress"] = {
                    "last_event": {
                        "type": event.get("type"),
                        "server": event.get("server"),
                        "name": event.get("name"),
                        "message": event.get("message"),
                        "is_error": event.get("is_error"),
                        "summary": event.get("summary"),
                    },
                    "active_module": module_key,
                }
                self._repository.update_stage(
                    job.id,
                    status="running",
                    current_stage=f"openstoryline_{module_key}",
                    progress_pct=int(progress_state["progress_pct"]),
                    runtime_payload=stage_runtime_payload(
                        workspace_dir=str(workspace_dir),
                        output_dir=str(output_dir),
                        input_assets=input_assets,
                        openstoryline_progress=log_payload["openstoryline_progress"],
                        progress_modules=_progress_modules(
                            active_key=module_key,
                            active_progress_pct=active_progress,
                            active_detail=_openstoryline_event_detail(event, module_key),
                            production_config=directive.production_config,
                        ),
                    ),
                    log_payload=log_payload,
                )

            try:
                stage_started_at = time.monotonic()
                run_result = self._openstoryline_client.run_job(
                    job=job,
                    directive=directive,
                    input_assets=input_assets,
                    workspace_dir=workspace_dir,
                    output_dir=output_dir,
                    progress_callback=handle_openstoryline_progress,
                )
                record_timing("openstoryline_rendering", stage_started_at)
            except Exception as exc:
                raise EngineRunError(
                    exc,
                    module_key=str(progress_state.get("active_key") or "") or None,
                    progress_event=log_payload.get("openstoryline_progress"),
                ) from exc
            log_payload["steps"].append(
                {
                    "stage": "openstoryline_rendering",
                    "metadata_path": str(run_result.metadata_path),
                }
            )
            stage_started_at = time.monotonic()
            self._validate_outputs(directive.desired_outputs, run_result)
            voiceover_artifacts = _voiceover_artifacts_summary(
                run_result.raw_response,
                directive.production_config,
            )
            _validate_voiceover_artifacts_for_directive(
                voiceover_artifacts,
                directive.production_config,
            )
            try:
                _validate_lip_sync_inputs_for_directive(
                    voiceover_artifacts,
                    directive.production_config,
                    input_assets,
                )
            except VoiceoverArtifactValidationError as exc:
                exc.validation_stage = "lip_sync_input_validation"
                raise
            try:
                lip_sync_artifacts = _validate_lip_sync_artifacts_for_directive(
                    run_result.raw_response,
                    directive.production_config,
                )
            except VoiceoverArtifactValidationError as exc:
                exc.validation_stage = "lip_sync_artifact_validation"
                raise
            try:
                _validate_timeline_quality_for_directive(
                    run_result.raw_response,
                    directive.production_config,
                )
            except VoiceoverArtifactValidationError as exc:
                exc.validation_stage = "timeline_quality_validation"
                raise
            record_timing("output_validation", stage_started_at)
            log_payload["steps"].append(
                {
                    "stage": "output_validation",
                    "status": "succeeded",
                    "checked_outputs": list(directive.desired_outputs),
                }
            )
            local_outputs = self._local_outputs_payload(run_result)
            upload_mode = "local_only"
            if self._cos_output_configured():
                self._repository.update_stage(
                    job.id,
                    status="running",
                    current_stage="uploading_outputs",
                    progress_pct=80,
                    runtime_payload=stage_runtime_payload(
                        workspace_dir=str(workspace_dir),
                        output_dir=str(output_dir),
                        input_assets=input_assets,
                        progress_modules=_progress_modules(
                            active_key="output_delivery",
                            production_config=directive.production_config,
                        ),
                    ),
                    log_payload=log_payload,
                )
                stage_started_at = time.monotonic()
                uploaded_assets = self._upload_outputs(
                    job=job,
                    desired_outputs=directive.desired_outputs,
                    final_video_path=run_result.final_video_path,
                    cover_image_path=run_result.cover_image_path,
                    subtitle_path=run_result.subtitle_path,
                )
                record_timing("uploading_outputs", stage_started_at)
                try:
                    stage_started_at = time.monotonic()
                    persisted_assets = self._repository.insert_output_assets(
                        job,
                        uploaded_assets,
                    )
                    record_timing("asset_objects_persistence", stage_started_at)
                except Exception as exc:
                    raise OutputAssetPersistenceError(exc) from exc
                upload_mode = getattr(self._settings, "storage_provider", "aliyun_oss")
                log_payload["steps"].append(
                    {
                        "stage": "uploading_outputs",
                        "status": "succeeded",
                        "uploaded_assets": persisted_assets,
                    }
                )
            else:
                log_payload["steps"].append(
                    {
                        "stage": "uploading_outputs",
                        "status": "skipped",
                        "reason": "object_storage_not_configured",
                        "local_outputs": local_outputs,
                    }
                )
            self._repository.mark_succeeded(
                job.id,
                result_payload={
                    "engine": run_result.raw_response.get("engine")
                    or "openstoryline-skeleton",
                    "engine_adapter": run_result.raw_response.get("engine_adapter")
                    or "unknown",
                    "execution_mode": directive.execution_mode,
                    "script_locked": directive.script_locked,
                    "desired_outputs": list(directive.desired_outputs),
                    "final_video_path": local_outputs["final_video_path"],
                    "cover_image_path": local_outputs["cover_image_path"],
                    "subtitle_path": local_outputs["subtitle_path"],
                    "metadata_path": local_outputs["metadata_path"],
                    "upload_mode": upload_mode,
                    "local_outputs": local_outputs,
                    "outputs": self._outputs_payload(uploaded_assets),
                    "uploaded_assets": self._uploaded_assets_payload(
                        uploaded_assets,
                        persisted_assets,
                    ),
                    "progress_modules": _progress_modules(
                        completed=True,
                        production_config=directive.production_config,
                    ),
                    "openstoryline": _openstoryline_result_payload(
                        run_result.raw_response,
                        directive.production_config,
                    ),
                    "voiceover_artifacts": voiceover_artifacts,
                    "lip_sync_artifacts": lip_sync_artifacts,
                    "engine_response": run_result.raw_response,
                },
                log_payload=log_payload,
            )
        except InputAssetContractError as exc:
            log_payload["steps"].append(
                {
                    "stage": "input_asset_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="input_asset_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="input_asset_validation",
                        error=exc,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="material_preparation",
                        production_config=directive.production_config,
                    ),
                },
                status="failed_manual",
            )
            return
        except OutputValidationError as exc:
            log_payload["steps"].append(
                {
                    "stage": "output_validation",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "missing_outputs": exc.missing_outputs,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="output_validation_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="output_validation",
                        error=exc,
                        run_result=run_result,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="render",
                        production_config=directive.production_config,
                    ),
                },
                status=exc.failure_status,
            )
            return
        except InputDownloadError as exc:
            log_payload["steps"].append(
                {
                    "stage": "downloading_inputs",
                    "status": "failed",
                    "failure_code": "input_download_failed",
                    "storage_key": exc.storage_key,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="downloading_inputs_failed",
                failure_reason=f"input_download_failed: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="downloading_inputs",
                        error=exc,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="material_preparation",
                        production_config=directive.production_config,
                    ),
                },
                status="failed_retryable",
            )
            raise
        except VoiceProfileReferenceError as exc:
            log_payload["steps"].append(
                {
                    "stage": "voice_profile_reference",
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="voice_profile_reference_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="voice_profile_reference",
                        error=exc,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="voiceover",
                        production_config=directive.production_config,
                    ),
                },
                status="failed_manual",
            )
            return
        except VoiceoverArtifactValidationError as exc:
            validation_stage = getattr(exc, "validation_stage", "voiceover_artifact_validation")
            if validation_stage.startswith("lip_sync"):
                progress_key = "lip_sync"
            elif validation_stage.startswith("timeline"):
                progress_key = "render"
            else:
                progress_key = "voiceover"
            log_payload["steps"].append(
                {
                    "stage": validation_stage,
                    "status": "failed",
                    "failure_code": exc.failure_code,
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage=f"{validation_stage}_failed",
                failure_reason=f"{exc.failure_code}: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage=validation_stage,
                        error=exc,
                        run_result=run_result,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key=progress_key,
                        production_config=directive.production_config,
                    ),
                },
                status=exc.failure_status,
            )
            return
        except EngineRunError as exc:
            failed_module_key = _openstoryline_failure_module_key(exc)
            log_payload["steps"].append(
                {
                    "stage": "openstoryline_rendering",
                    "status": "failed",
                    "failure_code": "engine_run_failed",
                    "error": str(exc),
                    "active_module": failed_module_key,
                    "openstoryline_progress": exc.progress_event,
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="openstoryline_rendering_failed",
                failure_reason=f"engine_run_failed: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="openstoryline_rendering",
                        error=exc,
                        module_key=failed_module_key,
                        run_result=run_result,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key=failed_module_key,
                        production_config=directive.production_config,
                    ),
                },
                status="failed_retryable",
            )
            raise
        except OutputUploadError as exc:
            upload_failure_step: dict[str, Any] = {
                "stage": "uploading_outputs",
                "status": "failed",
                "failure_code": "OUTPUT_UPLOAD_FAILED",
                "storage_key": exc.storage_key,
                "error": str(exc),
            }
            if run_result is not None:
                upload_failure_step["local_outputs"] = self._local_outputs_payload(
                    run_result,
                )
            log_payload["steps"].append(upload_failure_step)
            self._repository.mark_failed(
                job.id,
                current_stage="uploading_outputs_failed",
                failure_reason=f"OUTPUT_UPLOAD_FAILED: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="uploading_outputs",
                        error=exc,
                        run_result=run_result,
                        uploaded_assets=uploaded_assets,
                        persisted_assets=persisted_assets,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="output_delivery",
                        production_config=directive.production_config,
                    ),
                },
                status="failed_retryable",
            )
            raise
        except OutputAssetPersistenceError as exc:
            log_payload["steps"].append(
                {
                    "stage": "asset_objects_persistence",
                    "status": "failed",
                    "failure_code": "asset_objects_insert_failed",
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="asset_objects_persistence_failed",
                failure_reason=f"asset_objects_insert_failed: {exc}",
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="asset_objects_persistence",
                        error=exc,
                        run_result=run_result,
                        uploaded_assets=uploaded_assets,
                        persisted_assets=persisted_assets,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="output_delivery",
                        production_config=directive.production_config,
                    ),
                },
                status="failed_retryable",
            )
            raise
        except Exception as exc:
            log_payload["steps"].append(
                {
                    "stage": "failed",
                    "error": str(exc),
                }
            )
            self._repository.mark_failed(
                job.id,
                current_stage="failed",
                failure_reason=str(exc),
                log_payload={
                    **_annotate_failure_log(
                        log_payload,
                        job=job,
                        stage="failed",
                        error=exc,
                        run_result=run_result,
                        uploaded_assets=uploaded_assets,
                        persisted_assets=persisted_assets,
                    ),
                    "progress_modules": _progress_modules(
                        failed_key="material_match",
                        production_config=directive.production_config,
                    ),
                },
            )
            raise
        finally:
            shutil.rmtree(workspace_dir, ignore_errors=True)
            shutil.rmtree(output_dir, ignore_errors=True)
