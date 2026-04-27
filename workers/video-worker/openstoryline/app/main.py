from __future__ import annotations

from fastapi import FastAPI, HTTPException

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
        "http_port": settings.port,
        "mcp_port": settings.mcp_port,
        "outputs_dir": str(settings.outputs_dir),
    }


@app.post("/v1/runs", response_model=RunResponse)
def run_video_job(request: RunRequest) -> RunResponse:
    if "[force_fail]" in request.instruction_text:
        raise HTTPException(status_code=500, detail="forced engine failure")

    try:
        adapter = create_engine_adapter(app.state.settings)
        return adapter.run(request)
    except UnsupportedEngineAdapterError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
