from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    mcp_port: int
    outputs_dir: Path
    models_dir: Path
    engine_adapter: str
    fire_red_base_url: str
    fire_red_run_timeout_seconds: int = 900
    fire_red_provider_key_configured: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            host=os.getenv("OPENSTORYLINE_HOST", "0.0.0.0"),
            port=int(os.getenv("OPENSTORYLINE_PORT", "8000")),
            mcp_port=int(os.getenv("OPENSTORYLINE_MCP_PORT", "8001")),
            outputs_dir=Path(
                os.getenv(
                    "OPENSTORYLINE_OUTPUTS_DIR",
                    "/srv/jingjing-video-worker/outputs",
                )
            ),
            models_dir=Path(
                os.getenv(
                    "OPENSTORYLINE_MODELS_DIR",
                    "/srv/jingjing-video-worker/models",
                )
            ),
            engine_adapter=(
                os.getenv("OPENSTORYLINE_ENGINE_ADAPTER", "skeleton").strip().lower()
                or "skeleton"
            ),
            fire_red_base_url=os.getenv(
                "FIRERED_OPENSTORYLINE_BASE_URL",
                "",
            )
            .strip()
            .rstrip("/"),
            fire_red_run_timeout_seconds=int(
                os.getenv("FIRERED_RUN_TIMEOUT_SECONDS", "900")
            ),
            fire_red_provider_key_configured=bool(
                os.getenv("FIRERED_PROVIDER_KEY", "").strip()
            ),
        )
