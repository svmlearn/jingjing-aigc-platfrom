from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path
from typing import Protocol

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
        raise UnsupportedEngineAdapterError(
            "FireRed adapter for /v1/runs is not enabled yet; add the "
            "session/chat/output mapping before switching OPENSTORYLINE_ENGINE_ADAPTER."
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
