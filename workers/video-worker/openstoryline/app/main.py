from __future__ import annotations

import json

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .config import Settings
from .engine_adapters import (
    UnsupportedEngineAdapterError,
    create_engine_adapter,
)
from .schemas import RunRequest, RunResponse

app = FastAPI(title="openstoryline-engine", version="0.1.0")
app.state.settings = Settings.from_env()


@app.get("/health")
def health() -> dict[str, object]:
    settings: Settings = app.state.settings
    return {
        "status": "ok",
        "service": "openstoryline-engine",
        "engine_adapter": settings.engine_adapter,
        "fire_red_base_url_configured": bool(settings.fire_red_base_url),
        "fire_red_run_timeout_seconds": settings.fire_red_run_timeout_seconds,
        "fire_red_stream_idle_timeout_seconds": settings.fire_red_stream_idle_timeout_seconds,
        "fire_red_provider_key_configured": settings.fire_red_provider_key_configured,
        "http_port": settings.port,
        "mcp_port": settings.mcp_port,
        "outputs_dir": str(settings.outputs_dir),
    }


@app.get("/ready")
def ready() -> dict[str, object]:
    settings: Settings = app.state.settings
    payload: dict[str, object] = {
        "status": "ready",
        "service": "openstoryline-engine",
        "engine_adapter": settings.engine_adapter,
    }

    if settings.engine_adapter != "fire_red":
        return payload

    missing = []
    if not settings.fire_red_base_url:
        missing.append("FIRERED_OPENSTORYLINE_BASE_URL")
    if not settings.fire_red_provider_key_configured:
        missing.append("FIRERED_PROVIDER_KEY")
    if missing:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "engine_adapter": settings.engine_adapter,
                "missing": missing,
            },
        )

    try:
        response = httpx.get(
            f"{settings.fire_red_base_url}/ready",
            headers=(
                {"X-FIRERED-PROVIDER-KEY": settings.fire_red_provider_key}
                if settings.fire_red_provider_key
                else {}
            ),
            timeout=5.0,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail: object
        try:
            detail = exc.response.json()
        except Exception:
            detail = exc.response.text
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "engine_adapter": settings.engine_adapter,
                "fire_red_base_url": settings.fire_red_base_url,
                "fire_red_ready": detail,
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "engine_adapter": settings.engine_adapter,
                "fire_red_base_url": settings.fire_red_base_url,
                "reason": f"{type(exc).__name__}: {exc}",
            },
        ) from exc

    payload["fire_red_base_url_configured"] = True
    payload["fire_red_provider_key_configured"] = True
    try:
        payload["fire_red_ready"] = response.json()
    except Exception:
        payload["fire_red_ready"] = {"status": "ready"}
    return payload


@app.post("/v1/runs", response_model=RunResponse)
def run_video_job(request: RunRequest) -> RunResponse:
    if "[force_fail]" in request.instruction_text:
        raise HTTPException(status_code=500, detail="forced engine failure")

    try:
        adapter = create_engine_adapter(app.state.settings)
        return adapter.run(request)
    except UnsupportedEngineAdapterError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@app.post("/v1/runs/stream")
def stream_video_job(request: RunRequest) -> StreamingResponse:
    if "[force_fail]" in request.instruction_text:
        raise HTTPException(status_code=500, detail="forced engine failure")

    try:
        adapter = create_engine_adapter(app.state.settings)
    except UnsupportedEngineAdapterError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    def generate():
        try:
            for event in adapter.stream(request):
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps(
                {
                    "type": "error",
                    "error": {
                        "message": f"{type(exc).__name__}: {exc}",
                    },
                },
                ensure_ascii=False,
            ) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
