from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

import httpx

from .config import Settings
from .directive import ProductionDirective
from .models import EngineRunResult, VideoJob


class OpenStorylineClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.openstoryline_base_url
        self._timeout = settings.openstoryline_timeout_seconds

    def healthcheck(self) -> dict[str, Any]:
        response = httpx.get(f"{self._base_url}/ready", timeout=30.0)
        response.raise_for_status()
        return response.json()

    def run_job(
        self,
        job: VideoJob,
        directive: ProductionDirective,
        input_assets: list[dict[str, Any]],
        workspace_dir: Path,
        output_dir: Path,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> EngineRunResult:
        payload = self._build_run_payload(
            job=job,
            directive=directive,
            input_assets=input_assets,
            workspace_dir=workspace_dir,
            output_dir=output_dir,
        )
        if progress_callback is not None:
            try:
                return self._run_job_stream(payload, progress_callback)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise
            except RuntimeError as exc:
                message = str(exc)
                stream_transport_failed = (
                    "RemoteProtocolError" in message
                    or "incomplete chunked read" in message
                    or "stream ended without a result event" in message
                )
                if (
                    ("404 Not Found" not in message or "/runs/stream" not in message)
                    and not stream_transport_failed
                ):
                    raise

        response = httpx.post(
            f"{self._base_url}/v1/runs",
            json=payload,
            timeout=self._timeout,
        )
        response.raise_for_status()
        return self._engine_result_from_payload(response.json())

    def _build_run_payload(
        self,
        *,
        job: VideoJob,
        directive: ProductionDirective,
        input_assets: list[dict[str, Any]],
        workspace_dir: Path,
        output_dir: Path,
    ) -> dict[str, Any]:
        return {
            "job_id": job.id,
            "merchant_id": job.merchant_id,
            "draft_id": job.draft_id,
            "content_variant_id": job.content_variant_id,
            "created_by_user_id": job.created_by_user_id,
            "instruction_text": job.instruction_text,
            "workspace_dir": str(workspace_dir),
            "output_dir": str(output_dir),
            "input_assets": input_assets,
            "execution_mode": directive.execution_mode,
            "script_text": directive.script_text,
            "production_directive": directive.to_payload(),
            "production_config": directive.production_config,
            "runtime_payload": job.runtime_payload,
        }

    def _run_job_stream(
        self,
        payload: dict[str, Any],
        progress_callback: Callable[[dict[str, Any]], None],
    ) -> EngineRunResult:
        run_timeout_seconds = float(self._timeout)
        run_started_at = time.monotonic()
        with httpx.stream(
            "POST",
            f"{self._base_url}/v1/runs/stream",
            json=payload,
            timeout=self._timeout,
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if time.monotonic() - run_started_at > run_timeout_seconds:
                    raise RuntimeError(
                        "OpenStoryline stream run timeout after "
                        f"{_format_timeout_seconds(run_timeout_seconds)}s"
                    )
                event = self._decode_stream_event(line)
                if event is None:
                    continue

                event_type = event.get("type")
                if event_type == "progress":
                    progress_event = event.get("event") or event.get("data")
                    if isinstance(progress_event, dict):
                        progress_callback(progress_event)
                    continue

                if event_type == "result":
                    data = event.get("data")
                    if not isinstance(data, dict):
                        raise RuntimeError("OpenStoryline stream result payload is invalid")
                    return self._engine_result_from_payload(data)

                if event_type == "error":
                    raise RuntimeError(self._format_stream_error(event))

        raise RuntimeError("OpenStoryline stream ended without a result event")

    @staticmethod
    def _decode_stream_event(line: str | bytes) -> dict[str, Any] | None:
        if isinstance(line, bytes):
            line = line.decode("utf-8")
        line = line.strip()
        if not line:
            return None
        try:
            data = json.loads(line)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"invalid OpenStoryline stream event JSON: {exc}") from exc
        return data if isinstance(data, dict) else None

    @staticmethod
    def _format_stream_error(event: dict[str, Any]) -> str:
        error = event.get("error")
        if isinstance(error, dict):
            message = _format_error_detail(error)
            if message:
                return str(message)
        if isinstance(error, str) and error.strip():
            return error.strip()
        message = event.get("message")
        return str(message or "OpenStoryline stream failed")

    @staticmethod
    def _engine_result_from_payload(data: dict[str, Any]) -> EngineRunResult:
        return EngineRunResult(
            final_video_path=Path(data["final_video_path"]),
            cover_image_path=Path(data["cover_image_path"])
            if data.get("cover_image_path")
            else None,
            subtitle_path=Path(data["subtitle_path"])
            if data.get("subtitle_path")
            else None,
            metadata_path=Path(data["metadata_path"]),
            raw_response=data.get("raw_response") or data,
        )


def _format_error_detail(error: dict[str, Any]) -> str:
    parts = []
    message = error.get("message") or error.get("detail")
    if message:
        parts.append(str(message))

    root_cause = error.get("root_cause")
    if root_cause and str(root_cause) not in parts:
        parts.append(f"root_cause={root_cause}")

    last_event = error.get("last_event")
    if isinstance(last_event, dict):
        event_name = last_event.get("name")
        event_type = last_event.get("type")
        if event_name or event_type:
            parts.append(f"last_event={event_type or 'event'}:{event_name or 'unknown'}")

    last_tool = error.get("last_tool")
    if isinstance(last_tool, dict):
        tool_name = last_tool.get("name")
        summary = last_tool.get("summary")
        if tool_name:
            parts.append(f"last_tool={tool_name}")
        if summary:
            parts.append(f"tool_summary={summary}")

    return "; ".join(parts)


def _format_timeout_seconds(seconds: float) -> str:
    return str(int(seconds)) if seconds.is_integer() else str(seconds)
