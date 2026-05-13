from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path
from typing import Any, Iterator, Protocol

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
        response.raise_for_status()
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
        with httpx.stream(
            "POST",
            f"{self._settings.fire_red_base_url}/api/worker/runs/stream",
            json=payload,
            headers=headers,
            timeout=self._settings.fire_red_run_timeout_seconds,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                event = _decode_stream_event(line)
                if event is None:
                    continue
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
            },
        }
        if isinstance(fire_red_response.get("raw_response"), dict):
            raw_response["fire_red_raw_response"] = fire_red_response["raw_response"]

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
    payload = {
        "job_id": request.job_id,
        "merchant_id": request.merchant_id,
        "draft_id": request.draft_id,
        "content_variant_id": request.content_variant_id,
        "instruction_text": request.instruction_text,
        "workspace_dir": request.workspace_dir,
        "output_dir": request.output_dir,
        "execution_mode": request.execution_mode,
        "script_text": request.script_text,
        "production_directive": directive,
        "production_config": production_config,
        "service_config": _build_fire_red_service_config(settings, production_config),
        "runtime_payload": request.runtime_payload,
        "desired_outputs": desired_outputs,
        "input_assets": [asset.model_dump() for asset in request.input_assets],
        "prompt": _build_fire_red_prompt(request, desired_outputs, production_config),
    }
    return payload


def _build_fire_red_service_config(
    settings: Settings,
    production_config: dict[str, object],
) -> dict[str, object]:
    voiceover = production_config.get("voiceover")
    if not isinstance(voiceover, dict) or voiceover.get("enabled") is False:
        return {}

    provider = str(voiceover.get("provider") or settings.tts_provider).strip()
    if provider == "minimax":
        provider_config = _compact_dict(
            {
                "base_url": settings.tts_minimax_base_url,
                "api_key": settings.tts_minimax_api_key,
            }
        )
    elif provider == "302":
        provider_config = _compact_dict(
            {
                "base_url": settings.tts_302_base_url,
                "api_key": settings.tts_302_api_key,
            }
        )
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

    return {
        "tts": {
            "provider": provider,
            provider: provider_config,
        }
    }


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
        [asset.model_dump() for asset in request.input_assets],
        ensure_ascii=False,
        indent=2,
    )
    script_text = (request.script_text or "").strip()
    instruction_text = (request.instruction_text or "").strip()
    return "\n".join(
        [
            "You are the FireRed OpenStoryline production engine for a locked worker job.",
            "Use the uploaded media in this session and render a final video.",
            "Do not rewrite the locked script unless ProductionDirective explicitly allows it.",
            "The final step must produce a render_video artifact.",
            "Required production nodes:",
            "- Use generate_voiceover when productionConfig.voiceover.enabled is true.",
            "- Use generate_voiceover when voiceover.enabled is true.",
            "- Use select_bgm when productionConfig.bgm.enabled is true.",
            "- Use select_bgm when bgm.enabled is true.",
            "- Use render_video as the final node and include BGM/TTS tracks according to productionConfig.",
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


def _compact_dict(payload: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in payload.items() if value}


def _first_dict(payload: dict[str, object], *keys: str) -> dict[str, object]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
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
