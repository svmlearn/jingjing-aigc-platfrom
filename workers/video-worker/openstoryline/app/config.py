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
        )
