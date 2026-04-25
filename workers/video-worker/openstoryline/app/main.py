from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .config import Settings
from .schemas import RunRequest, RunResponse

app = FastAPI(title="openstoryline-engine", version="0.1.0")
settings = Settings.from_env()

MINIMAL_JPEG_BASE64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDw8PDw8PDw8PDw8QFREW"
    "FRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGi0lHyUtLS0tLS0t"
    "LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAgMBIgAC"
    "EQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAAFAAIDBAYBB//EADYQAAIBAgQDBgQEBwEAAAAA"
    "AAABAgMRBBIhMQVBUQYiYXGBEzKRobHB0SNSYnKS4fAHFSMzQ1Nz/8QAGQEAAwEBAQAAAAAAAA"
    "AAAAAAAAECAwQF/8QAHREAAgICAwEAAAAAAAAAAAAAAAECEQMhEjFBcf/aAAwDAQACEQMRAD8A"
    "9YooooooooA//2Q=="
)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_placeholder_video(path: Path, request: RunRequest) -> None:
    ensure_parent(path)
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


def write_placeholder_cover(path: Path) -> None:
    ensure_parent(path)
    path.write_bytes(base64.b64decode(MINIMAL_JPEG_BASE64))


def write_placeholder_subtitle(path: Path, request: RunRequest) -> None:
    ensure_parent(path)
    path.write_text(
        "1\n00:00:00,000 --> 00:00:02,000\nOpenStoryline skeleton subtitle\n",
        encoding="utf-8",
    )


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "openstoryline-engine",
        "http_port": settings.port,
        "mcp_port": settings.mcp_port,
        "outputs_dir": str(settings.outputs_dir),
    }


@app.post("/v1/runs", response_model=RunResponse)
def run_video_job(request: RunRequest) -> RunResponse:
    if "[force_fail]" in request.instruction_text:
        raise HTTPException(status_code=500, detail="forced engine failure")

    output_dir = Path(request.output_dir)
    final_video_path = output_dir / "final.mp4"
    cover_image_path = output_dir / "cover.jpg"
    subtitle_path = output_dir / "subtitles.srt"
    metadata_path = output_dir / "run-metadata.json"

    write_placeholder_video(final_video_path, request)
    write_placeholder_cover(cover_image_path)
    write_placeholder_subtitle(subtitle_path, request)
    ensure_parent(metadata_path)
    metadata_path.write_text(
        json.dumps(
            {
                "job_id": request.job_id,
                "engine": "openstoryline-skeleton",
                "workspace_dir": request.workspace_dir,
                "output_dir": request.output_dir,
                "input_assets": [asset.model_dump() for asset in request.input_assets],
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
            "http_port": settings.port,
            "mcp_port": settings.mcp_port,
            "input_asset_count": len(request.input_assets),
        },
    )
