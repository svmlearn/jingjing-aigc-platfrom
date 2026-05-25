from __future__ import annotations

import base64
import json
import re
import time
import subprocess
from pathlib import Path
from typing import Any, Iterator, Protocol
from urllib.parse import quote

import httpx

from .config import Settings
from .schemas import RunRequest, RunResponse

MINIMAL_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDw8PDw8PDw8PDw8QFREW"
    "FRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGi0lHyUtLS0tLS0t"
    "LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAgMBIgAC"
    "EQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAFAAIDBAYBB//EADYQAAIBAgQDBgQEBwEAAAAA"
    "AAABAgMRBBIhMQVBUQYiYXGBEzKRobHB0SNSYnKS4fAHFSMzQ1Nz/8QAGQEAAwEBAQAAAAAAAA"
    "AAAAAAAAECAwQF/8QAHREAAgICAwEAAAAAAAAAAAAAAAECEQMhEjFBcf/aAAwDAQACEQMRAD8A"
    "9YooooooooA//2Q=="
)

TALKING_HEAD_LABELS = {
    "talking_head",
    "talking-head",
    "talkinghead",
    "口播",
    "真人口播",
    "真人开头口播",
    "真人结尾口播",
}
TALKING_HEAD_SCRIPT_TOKENS = (
    "真人开头口播",
    "真人结尾口播",
    "真人口播",
    "口播",
    "出镜讲解",
    "人物讲解",
)
ALIYUN_ASR_PROVIDER = "aliyun_paraformer"
ALIYUN_ASR_PROVIDER_ALIASES = {"aliyun", "aliyun_paraformer", "dashscope", "dashscope_paraformer"}
LOCAL_ASR_PROVIDER_ALIASES = {"local", "local_funasr", "funasr"}


class UnsupportedEngineAdapterError(RuntimeError):
    pass


class EngineAdapter(Protocol):
    def run(self, request: RunRequest) -> RunResponse:
        ...

    def stream(self, request: RunRequest) -> Iterator[dict[str, Any]]:
        ...


def create_engine_adapter(settings: Settings) -> EngineAdapter:
    if settings.engine_adapter == "skeleton":
        return SkeletonEngineAdapter(settings)
    if settings.engine_adapter == "fire_red":
        return FireRedEngineAdapter(settings)
    raise UnsupportedEngineAdapterError(
        f"unsupported OpenStoryline engine adapter: {settings.engine_adapter}"
    )


class SkeletonEngineAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def run(self, request: RunRequest) -> RunResponse:
        output_dir = Path(request.output_dir)
        final_video_path = output_dir / "final.mp4"
        cover_image_path = output_dir / "cover.jpg"
        subtitle_path = output_dir / "subtitles.srt"
        metadata_path = output_dir / "run-metadata.json"

        _write_placeholder_video(final_video_path)
        _write_placeholder_cover(cover_image_path)
        _write_placeholder_subtitle(subtitle_path)
        _ensure_parent(metadata_path)
        metadata_path.write_text(
            json.dumps(
                {
                    "job_id": request.job_id,
                    "engine": "openstoryline-skeleton",
                    "engine_adapter": self._settings.engine_adapter,
                    "execution_mode": request.execution_mode,
                    "script_locked": bool(
                        request.production_directive.get("script_locked")
                    ),
                    "desired_outputs": request.production_directive.get(
                        "desired_outputs",
                        [],
                    ),
                    "workspace_dir": request.workspace_dir,
                    "output_dir": request.output_dir,
                    "input_assets": [
                        asset.model_dump() for asset in request.input_assets
                    ],
                },
                ensure_ascii=True,
                indent=2,
            ),
            encoding="utf-8",
        )

        return RunResponse(
            job_id=request.job_id,
            final_video_path=str(final_video_path),
            cover_image_path=str(cover_image_path),
            subtitle_path=str(subtitle_path),
            metadata_path=str(metadata_path),
            raw_response={
                "engine": "openstoryline-skeleton",
                "engine_adapter": self._settings.engine_adapter,
                "http_port": self._settings.port,
                "mcp_port": self._settings.mcp_port,
                "input_asset_count": len(request.input_assets),
                "execution_mode": request.execution_mode,
                "script_locked": bool(request.production_directive.get("script_locked")),
            },
        )

    def stream(self, request: RunRequest) -> Iterator[dict[str, Any]]:
        response = self.run(request)
        yield {"type": "result", "data": response.model_dump()}


class FireRedEngineAdapter:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def run(self, request: RunRequest) -> RunResponse:
        if not self._settings.fire_red_base_url:
            raise UnsupportedEngineAdapterError(
                "FireRed adapter requires FIRERED_OPENSTORYLINE_BASE_URL before "
                "it can serve /v1/runs."
            )
        if not self._settings.fire_red_provider_key_configured:
            raise UnsupportedEngineAdapterError(
                "FireRed adapter requires FIRERED_PROVIDER_KEY before it can "
                "serve /v1/runs."
            )

        output_dir = Path(request.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        payload = _build_fire_red_run_payload(self._settings, request)
        headers = (
            {"X-FIRERED-PROVIDER-KEY": self._settings.fire_red_provider_key}
            if self._settings.fire_red_provider_key
            else {}
        )
        response = httpx.post(
            f"{self._settings.fire_red_base_url}/api/worker/runs",
            json=payload,
            headers=headers,
            timeout=self._settings.fire_red_run_timeout_seconds,
        )
        _raise_for_status_with_body(response, "FireRed run")
        fire_red_response = response.json()

        return self._response_from_fire_red_response(
            request=request,
            payload=payload,
            fire_red_response=fire_red_response,
        )

    def stream(self, request: RunRequest) -> Iterator[dict[str, Any]]:
        if not self._settings.fire_red_base_url:
            raise UnsupportedEngineAdapterError(
                "FireRed adapter requires FIRERED_OPENSTORYLINE_BASE_URL before "
                "it can serve /v1/runs/stream."
            )
        if not self._settings.fire_red_provider_key_configured:
            raise UnsupportedEngineAdapterError(
                "FireRed adapter requires FIRERED_PROVIDER_KEY before it can "
                "serve /v1/runs/stream."
            )

        output_dir = Path(request.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        payload = _build_fire_red_run_payload(self._settings, request)
        headers = (
            {"X-FIRERED-PROVIDER-KEY": self._settings.fire_red_provider_key}
            if self._settings.fire_red_provider_key
            else {}
        )
        run_timeout_seconds = float(self._settings.fire_red_run_timeout_seconds)
        run_started_at = time.monotonic()
        try:
            with httpx.stream(
                "POST",
                f"{self._settings.fire_red_base_url}/api/worker/runs/stream",
                json=payload,
                headers=headers,
                timeout=httpx.Timeout(
                    timeout=float(self._settings.fire_red_run_timeout_seconds),
                    read=float(self._settings.fire_red_stream_idle_timeout_seconds),
                ),
            ) as response:
                _raise_for_status_with_body(response, "FireRed stream run")
                last_event_at = run_started_at
                for line in response.iter_lines():
                    now = time.monotonic()
                    if now - run_started_at > run_timeout_seconds:
                        yield {
                            "type": "error",
                            "error": {
                                "message": (
                                    "FireRed stream run timeout after "
                                    f"{_format_timeout_seconds(run_timeout_seconds)}s"
                                ),
                            },
                        }
                        return
                    event = _decode_stream_event(line)
                    if event is None:
                        if (
                            now - last_event_at
                            > self._settings.fire_red_stream_idle_timeout_seconds
                        ):
                            yield {
                                "type": "error",
                                "error": {
                                    "message": (
                                        "FireRed stream idle timeout after "
                                        f"{self._settings.fire_red_stream_idle_timeout_seconds}s"
                                    ),
                                },
                            }
                            return
                        continue
                    last_event_at = now
                    event_type = event.get("type")
                    if event_type == "progress":
                        yield event
                        continue
                    if event_type == "result":
                        data = event.get("data")
                        if not isinstance(data, dict):
                            yield {
                                "type": "error",
                                "error": {"message": "FireRed stream result payload is invalid"},
                            }
                            return
                        mapped_response = self._response_from_fire_red_response(
                            request=request,
                            payload=payload,
                            fire_red_response=data,
                        )
                        yield {"type": "result", "data": mapped_response.model_dump()}
                        return
                    if event_type == "error":
                        yield event
                        return

        except httpx.ReadTimeout:
            yield {
                "type": "error",
                "error": {
                    "message": (
                        "FireRed stream idle timeout after "
                        f"{self._settings.fire_red_stream_idle_timeout_seconds}s"
                    ),
                },
            }
            return

        yield {
            "type": "error",
            "error": {"message": "FireRed stream ended without a result event"},
        }

    def _response_from_fire_red_response(
        self,
        *,
        request: RunRequest,
        payload: dict[str, object],
        fire_red_response: dict[str, object],
    ) -> RunResponse:
        output_dir = Path(request.output_dir)
        final_video_path = Path(
            fire_red_response.get("final_video_path") or output_dir / "final.mp4"
        )
        cover_image_path = _resolve_optional_path(
            fire_red_response.get("cover_image_path")
        )
        subtitle_path = _resolve_optional_path(fire_red_response.get("subtitle_path"))

        desired_outputs = set(
            request.production_directive.get("desired_outputs") or ["final_video"]
        )
        if "cover" in desired_outputs and cover_image_path is None:
            cover_image_path = output_dir / "cover.jpg"
            _write_video_cover_thumbnail(final_video_path, cover_image_path)
        if "subtitles" in desired_outputs and subtitle_path is None:
            subtitle_path = output_dir / "subtitles.srt"
            _write_script_subtitle(subtitle_path, request.script_text)

        metadata_path = _resolve_optional_path(fire_red_response.get("metadata_path"))
        if metadata_path is None:
            metadata_path = output_dir / "run-metadata.json"
        _write_fire_red_metadata(
            metadata_path=metadata_path,
            request=request,
            mapped_payload=payload,
            fire_red_response=fire_red_response,
        )

        production_config = request.production_config or {}
        raw_response = {
            "engine": "fire_red-openstoryline",
            "engine_adapter": self._settings.engine_adapter,
            "fire_red": fire_red_response,
            "openstoryline": {
                "engine_adapter": self._settings.engine_adapter,
                "session_id": fire_red_response.get("session_id"),
                "production_config_used": production_config,
                "selected_bgm": _first_dict(fire_red_response, "selected_bgm", "bgm"),
                "voiceover": _first_dict(fire_red_response, "voiceover"),
                "lip_sync": _first_dict(fire_red_response, "lip_sync"),
            },
        }
        if isinstance(fire_red_response.get("raw_response"), dict):
            raw_response["fire_red_raw_response"] = fire_red_response["raw_response"]
            raw_response["openstoryline"]["lip_sync"] = _nested_first_dict(
                fire_red_response,
                ("lip_sync",),
                ("raw_response", "lip_sync"),
            )

        return RunResponse(
            job_id=request.job_id,
            final_video_path=str(final_video_path),
            cover_image_path=str(cover_image_path) if cover_image_path else None,
            subtitle_path=str(subtitle_path) if subtitle_path else None,
            metadata_path=str(metadata_path),
            engine="fire_red-openstoryline",
            raw_response=raw_response,
        )


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _write_placeholder_video(path: Path) -> None:
    _ensure_parent(path)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=#111111:s=1080x1920:d=4",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def _write_placeholder_cover(path: Path) -> None:
    _ensure_parent(path)
    path.write_bytes(base64.b64decode(MINIMAL_JPEG_BASE64))


def _write_placeholder_subtitle(path: Path) -> None:
    _ensure_parent(path)
    path.write_text(
        "1\n00:00:00,000 --> 00:00:02,000\nOpenStoryline skeleton subtitle\n",
        encoding="utf-8",
    )


def _build_fire_red_run_payload(
    settings: Settings,
    request: RunRequest,
) -> dict[str, object]:
    directive = request.production_directive or {}
    desired_outputs = list(directive.get("desired_outputs") or ["final_video"])
    production_config = request.production_config or {}
    production_config = _with_talking_head_audio_policy(
        production_config,
        request,
    )
    _assert_original_audio_asr_ready(settings, production_config)
    service_config = _build_fire_red_service_config(
        settings,
        production_config,
        request,
        require_private_search=not _is_worker_rehearsal_fast_path(request),
    )
    if _is_worker_rehearsal_fast_path(request):
        service_config = {
            **service_config,
            "worker_rehearsal_fast_path": True,
        }
    payload = {
        "job_id": request.job_id,
        "merchant_id": request.merchant_id,
        "draft_id": request.draft_id,
        "content_variant_id": request.content_variant_id,
        "created_by_user_id": request.created_by_user_id,
        "instruction_text": request.instruction_text,
        "workspace_dir": request.workspace_dir,
        "output_dir": request.output_dir,
        "execution_mode": request.execution_mode,
        "script_text": request.script_text,
        "production_directive": directive,
        "production_config": production_config,
        "service_config": service_config,
        "runtime_payload": request.runtime_payload,
        "desired_outputs": desired_outputs,
        "input_assets": [
            _compact_payload(asset.model_dump()) for asset in request.input_assets
        ],
        "prompt": _build_fire_red_prompt(request, desired_outputs, production_config),
    }
    return payload


def _is_worker_rehearsal_fast_path(request: RunRequest) -> bool:
    if request.execution_mode == "self_hosted_rehearsal_fast_path":
        return True
    return request.runtime_payload.get("self_hosted_rehearsal_fast_path") is True


def _build_fire_red_service_config(
    settings: Settings,
    production_config: dict[str, object],
    request: RunRequest,
    *,
    require_private_search: bool = True,
) -> dict[str, object]:
    service_config: dict[str, object] = {}
    private_pexels_base_url = _private_pexels_base_url_for_request(
        settings,
        request,
        require_private_search=require_private_search,
    )
    if private_pexels_base_url:
        service_config["search_media"] = {
            "pexels": _compact_dict(
                {
                    "mode": "custom",
                    "base_url": private_pexels_base_url,
                    "api_key": settings.private_pexels_api_key,
                }
            )
        }

    if settings.asr_provider:
        asr_provider = _normalized_asr_provider(settings.asr_provider)
        asr_provider_config = _compact_dict(
            {
                "model": settings.aliyun_asr_model,
                "api_key": settings.aliyun_asr_api_key,
                "workspace": settings.aliyun_asr_workspace,
                "format": "wav",
                "sample_rate": 16000,
                "language_hints": ["zh", "en"],
            }
        )
        service_config["asr"] = {
            "provider": asr_provider,
            asr_provider: asr_provider_config,
        }
        if asr_provider in {"aliyun", "dashscope", "dashscope_paraformer"}:
            service_config["asr"]["aliyun_paraformer"] = asr_provider_config

    lip_sync = production_config.get("lip_sync")
    if isinstance(lip_sync, dict) and lip_sync.get("enabled") is True:
        provider = str(
            lip_sync.get("provider") or settings.lip_sync_provider or "aliyun_videoretalk"
        ).strip() or "aliyun_videoretalk"
        if provider == "aliyun_videoretalk":
            provider_config = _compact_dict(
                {
                    "base_url": settings.aliyun_videoretalk_base_url,
                    "api_key": settings.aliyun_videoretalk_api_key,
                    "model": settings.aliyun_videoretalk_model,
                    "timeout_seconds": settings.aliyun_videoretalk_timeout_seconds,
                    "poll_interval_seconds": settings.aliyun_videoretalk_poll_interval_seconds,
                    "upload_url_mode": settings.aliyun_videoretalk_upload_url_mode,
                    "ref_image_url": settings.aliyun_videoretalk_ref_image_url,
                    "video_extension": settings.aliyun_videoretalk_video_extension,
                    "query_face_threshold": settings.aliyun_videoretalk_query_face_threshold,
                }
            )
        else:
            provider_config = {}
        service_config["lip_sync"] = {
            "provider": provider,
            provider: provider_config,
        }

    voiceover = production_config.get("voiceover")
    if not isinstance(voiceover, dict) or voiceover.get("enabled") is False:
        return service_config

    provider = str(voiceover.get("provider") or settings.tts_provider).strip()
    clone_enabled = _as_bool(
        voiceover.get("clone_enabled")
        or voiceover.get("cloneEnabled")
        or provider in {"pixelle_clone", "pixelle_runninghub_clone"}
    )
    if clone_enabled:
        tts_config = {
            "provider": "pixelle_clone",
            "pixelle_clone": _compact_dict(
                {
                    "base_url": settings.tts_pixelle_clone_base_url,
                    "api_key": settings.tts_pixelle_clone_api_key,
                }
            ),
            "clone_enabled": True,
        }
        ref_audio = str(
            voiceover.get("ref_audio") or voiceover.get("refAudio") or ""
        ).strip()
        if ref_audio:
            tts_config["ref_audio"] = ref_audio
            tts_config["pixelle_clone"]["ref_audio"] = ref_audio
        external_voice_id = str(
            voiceover.get("external_voice_id")
            or voiceover.get("externalVoiceId")
            or ""
        ).strip()
        if external_voice_id:
            tts_config["pixelle_clone"]["external_voice_id"] = external_voice_id
        service_config["tts"] = tts_config
        return service_config

    if provider == "minimax":
        provider_config = _compact_dict(
            {
                "base_url": settings.tts_minimax_base_url,
                "api_key": settings.tts_minimax_api_key,
            }
        )
        fallback_config = _compact_dict(
            {
                "base_url": settings.tts_runninghub_base_url,
                "api_key": settings.tts_runninghub_api_key,
            }
        )
    elif provider == "302":
        provider_config = _compact_dict(
            {
                "base_url": settings.tts_302_base_url,
                "api_key": settings.tts_302_api_key,
            }
        )
        fallback_config = {}
    else:
        provider = "bytedance_bigtts"
        provider_config = _compact_dict(
            {
                "base_url": settings.tts_bytedance_bigtts_base_url,
                "uid": settings.tts_bytedance_bigtts_uid,
                "appid": settings.tts_bytedance_bigtts_appid,
                "access_key": settings.tts_bytedance_bigtts_access_key,
                "resource_id": settings.tts_bytedance_bigtts_resource_id,
                "speaker": settings.tts_bytedance_bigtts_speaker,
            }
        )
        fallback_config = {}

    service_config["tts"] = {
        "provider": provider,
        provider: provider_config,
    }
    if provider == "minimax" and fallback_config:
        service_config["tts"]["fallback_provider"] = "runninghub"
        service_config["tts"]["runninghub"] = fallback_config
    return service_config


def _private_pexels_base_url_for_request(
    settings: Settings,
    request: RunRequest,
    *,
    require_private_search: bool,
) -> str:
    base_url = str(settings.private_pexels_base_url or "").strip().rstrip("/")
    api_key = str(settings.private_pexels_api_key or "").strip()
    merchant_id = str(request.merchant_id or "").strip()

    if not require_private_search and not (base_url or api_key):
        return ""

    missing: list[str] = []
    if not base_url:
        missing.append("PRIVATE_PEXELS_BASE_URL")
    if not api_key:
        missing.append("PRIVATE_PEXELS_API_KEY")
    if not merchant_id:
        missing.append("merchant_id")
    if missing:
        raise UnsupportedEngineAdapterError(
            "FireRed worker jobs require merchant-scoped private media search "
            f"({', '.join(missing)} missing); official Pexels fallback is disabled."
        )

    return f"{base_url}/merchants/{quote(merchant_id, safe='')}"


def _assert_original_audio_asr_ready(
    settings: Settings,
    production_config: dict[str, object],
) -> None:
    if not _requires_original_audio_asr(production_config):
        return

    provider = _normalized_asr_provider(settings.asr_provider)
    if provider != ALIYUN_ASR_PROVIDER:
        raise UnsupportedEngineAdapterError(
            "talking-head original-audio subtitles require OPENSTORYLINE_ASR_PROVIDER=aliyun_paraformer; "
            f"got {provider or '(empty)'}."
        )
    if not str(settings.aliyun_asr_api_key or "").strip():
        raise UnsupportedEngineAdapterError(
            "talking-head original-audio subtitles require ALIYUN_ASR_API_KEY or DASHSCOPE_API_KEY."
        )


def _requires_original_audio_asr(production_config: dict[str, object]) -> bool:
    subtitles = production_config.get("subtitles")
    if not isinstance(subtitles, dict):
        return False
    source = (
        subtitles.get("talking_head_source")
        or subtitles.get("talkingHeadSource")
        or subtitles.get("source")
    )
    return str(source or "").strip().lower() == "asr_original_audio"


def _normalized_asr_provider(value: object) -> str:
    provider = str(value or "").strip().lower()
    if provider in {"aliyun", "dashscope", "dashscope_paraformer"}:
        return ALIYUN_ASR_PROVIDER
    return provider


def _with_talking_head_audio_policy(
    production_config: dict[str, object],
    request: RunRequest,
) -> dict[str, object]:
    if not _voiceover_enabled(production_config):
        return production_config
    if not _is_talking_head_request(request):
        return production_config

    render = production_config.get("render")
    render_config = dict(render) if isinstance(render, dict) else {}
    if _as_bool(
        render_config.get("preserve_talking_head_original_audio")
        or render_config.get("preserveTalkingHeadOriginalAudio")
    ):
        render_config["include_original_audio"] = True
        render_config["include_video_audio"] = True
        render_config["video_volume_scale"] = render_config.get("video_volume_scale", 1)
        render_config["audio_policy"] = (
            render_config.get("audio_policy")
            or "preserve_talking_head_original_audio_with_voiceover"
        )
        updated = dict(production_config)
        updated["render"] = render_config
        updated["asset_classification"] = _talking_head_asset_classification(
            production_config
        )
        return updated

    render_config["include_original_audio"] = False
    render_config["include_video_audio"] = False
    render_config["video_volume_scale"] = 0
    render_config["audio_policy"] = "mute_source_for_talking_head_voiceover"

    updated = dict(production_config)
    updated["render"] = render_config
    updated["asset_classification"] = _talking_head_asset_classification(
        production_config
    )
    return updated


def _talking_head_asset_classification(
    production_config: dict[str, object],
) -> dict[str, object]:
    existing = production_config.get("asset_classification")
    base = existing if isinstance(existing, dict) else {}
    return {
        **base,
        "talking_head": True,
        "standard": (
            "explicit asset/script tags first; locked script semantics second; "
            "filename alone is never sufficient"
        ),
    }


def _voiceover_enabled(production_config: dict[str, object]) -> bool:
    voiceover = production_config.get("voiceover")
    return not (isinstance(voiceover, dict) and voiceover.get("enabled") is False)


def _is_talking_head_request(request: RunRequest) -> bool:
    for asset in request.input_assets:
        if _asset_has_talking_head_label(asset.model_dump()):
            return True

    script_text = " ".join(
        [
            str(request.script_text or ""),
            json.dumps(request.production_directive or {}, ensure_ascii=False),
            json.dumps(request.production_config or {}, ensure_ascii=False),
        ]
    )
    return any(token in script_text for token in TALKING_HEAD_SCRIPT_TOKENS)


def _asset_has_talking_head_label(asset: dict[str, object]) -> bool:
    values: list[str] = []
    for key in ("role", "scene_type"):
        value = asset.get(key)
        if isinstance(value, str):
            values.append(value)
    for key in ("tags", "labels"):
        value = asset.get(key)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
    metadata = asset.get("metadata")
    if isinstance(metadata, dict):
        for key in ("role", "scene_type", "asset_type", "content_type"):
            value = metadata.get(key)
            if isinstance(value, str):
                values.append(value)
        for key in ("tags", "labels"):
            value = metadata.get(key)
            if isinstance(value, list):
                values.extend(str(item) for item in value)

    normalized = {
        str(value).strip().lower().replace("_", "-")
        for value in values
        if str(value).strip()
    }
    return any(
        label.lower().replace("_", "-") in normalized
        for label in TALKING_HEAD_LABELS
    )


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _build_fire_red_prompt(
    request: RunRequest,
    desired_outputs: list[str],
    production_config: dict[str, object],
) -> str:
    directive_json = json.dumps(
        request.production_directive or {},
        ensure_ascii=False,
        indent=2,
    )
    production_config_json = json.dumps(
        production_config,
        ensure_ascii=False,
        indent=2,
    )
    assets_json = json.dumps(
        [_compact_payload(asset.model_dump()) for asset in request.input_assets],
        ensure_ascii=False,
        indent=2,
    )
    script_text = (request.script_text or "").strip()
    instruction_text = (request.instruction_text or "").strip()
    return "\n".join(
        [
            "You are the FireRed OpenStoryline production engine for a locked worker job.",
            "This is an unattended background worker run.",
            "Approval to execute has already been granted by the platform.",
            "Do not ask for confirmation; execute the required production tools directly.",
            "Prioritize explicitly uploaded media already present in this session.",
            "When a script scene needs more visuals or the uploaded media is insufficient, call search_media to search the current merchant private media library.",
            "Never use official Pexels or any material outside this merchant's private media library.",
            "Do not rewrite the locked script unless ProductionDirective explicitly allows it.",
            "The final step must produce a render_video artifact.",
            "Required production nodes:",
            "- Use generate_voiceover when productionConfig.voiceover.enabled is true.",
            "- Use generate_voiceover when voiceover.enabled is true.",
            "- Use select_bgm when productionConfig.bgm.enabled is true.",
            "- Use select_bgm when bgm.enabled is true.",
            "- When productionConfig.lip_sync.enabled is true, run plan_timeline first, then run lip_sync before render_video.",
            "- For lip_sync, only replace talking-head segments; keep B-roll and ordinary project media unchanged.",
            "- Do not call ASR for script_audio_alignment; ASR is only allowed for explicit asr_original_audio rollback mode.",
            "- render_video must consume the retalked talking-head segments produced by lip_sync.",
            "- Use render_video as the final node and include BGM/TTS tracks according to productionConfig.",
            "- After render_video completes successfully, stop immediately; do not call read_node_history or any other production tool.",
            f"Desired outputs: {', '.join(desired_outputs)}",
            "",
            "Locked script:",
            script_text or "(empty)",
            "",
            "Worker instruction:",
            instruction_text or "(empty)",
            "",
            "Input assets:",
            assets_json,
            "",
            "ProductionDirective:",
            directive_json,
            "",
            "ProductionConfig:",
            production_config_json,
        ]
    )


def _compact_dict(payload: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if value}


def _compact_payload(payload: dict[str, object]) -> dict[str, object]:
    return {
        key: value
        for key, value in payload.items()
        if value not in (None, "", [], {})
    }


def _first_dict(payload: dict[str, object], *keys: str) -> dict[str, object]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _nested_first_dict(payload: dict[str, object], *paths: tuple[str, ...]) -> dict[str, object]:
    for path in paths:
        cur: object = payload
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if isinstance(cur, dict) and cur:
            return cur
    return {}


def _resolve_optional_path(value: object) -> Path | None:
    if not value:
        return None
    return Path(str(value))


def _decode_stream_event(line: str | bytes) -> dict[str, Any] | None:
    if isinstance(line, bytes):
        line = line.decode("utf-8")
    line = line.strip()
    if not line:
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        return {
            "type": "error",
            "error": {"message": f"invalid stream event JSON: {exc}"},
        }
    return data if isinstance(data, dict) else None


def _format_timeout_seconds(seconds: float) -> str:
    return str(int(seconds)) if seconds.is_integer() else str(seconds)


def _raise_for_status_with_body(response: httpx.Response, action: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        try:
            body_text = response.text
        except httpx.ResponseNotRead:
            response.read()
            body_text = response.text
        body = _redact_sensitive_text(body_text or "").strip()
        if len(body) > 2000:
            body = body[:2000] + "...<truncated>"
        detail = f"{action} failed: {exc}"
        if body:
            detail = f"{detail}; response_body={body}"
        raise RuntimeError(detail) from exc


def _redact_sensitive_text(value: str) -> str:
    value = re.sub(
        r'("?(?:api[_-]?key|access[_-]?key|token|secret|provider[_-]?key)"?\s*[:=]\s*")([^"]+)(")',
        r"\1***\3",
        value,
        flags=re.IGNORECASE,
    )
    return value


def _write_video_cover_thumbnail(video_path: Path, cover_path: Path) -> None:
    _ensure_parent(cover_path)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                "0",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                str(cover_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except Exception:
        _write_placeholder_cover(cover_path)


def _write_script_subtitle(path: Path, script_text: str) -> None:
    text = " ".join((script_text or "Generated video").split())
    _ensure_parent(path)
    path.write_text(
        f"1\n00:00:00,000 --> 00:00:04,000\n{text}\n",
        encoding="utf-8",
    )


def _write_fire_red_metadata(
    *,
    metadata_path: Path,
    request: RunRequest,
    mapped_payload: dict[str, object],
    fire_red_response: dict[str, object],
) -> None:
    _ensure_parent(metadata_path)
    metadata_path.write_text(
        json.dumps(
            {
                "job_id": request.job_id,
                "engine": "fire_red-openstoryline",
                "engine_adapter": "fire_red",
                "mapped_payload": _mask_sensitive_payload(mapped_payload),
                "fire_red_response": fire_red_response,
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )


def _mask_sensitive_payload(value: object) -> object:
    if isinstance(value, dict):
        masked: dict[str, object] = {}
        for key, item in value.items():
            normalized_key = key.lower()
            if any(token in normalized_key for token in ("api_key", "access_key", "token", "secret")):
                masked[key] = "***"
            else:
                masked[key] = _mask_sensitive_payload(item)
        return masked
    if isinstance(value, list):
        return [_mask_sensitive_payload(item) for item in value]
    return value
