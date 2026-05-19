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
    fire_red_stream_idle_timeout_seconds: int = 180
    fire_red_provider_key_configured: bool = False
    fire_red_provider_key: str = ""
    private_pexels_base_url: str = ""
    private_pexels_api_key: str = ""
    tts_provider: str = "bytedance_bigtts"
    tts_302_base_url: str = "https://api.302.ai"
    tts_302_api_key: str = ""
    tts_minimax_base_url: str = "https://api.minimax.io"
    tts_minimax_api_key: str = ""
    tts_runninghub_base_url: str = "https://www.runninghub.cn"
    tts_runninghub_api_key: str = ""
    tts_bytedance_bigtts_base_url: str = "https://openspeech.bytedance.com"
    tts_bytedance_bigtts_uid: str = "openstoryline"
    tts_bytedance_bigtts_appid: str = ""
    tts_bytedance_bigtts_access_key: str = ""
    tts_bytedance_bigtts_resource_id: str = ""
    tts_bytedance_bigtts_speaker: str = ""
    tts_pixelle_clone_base_url: str = ""
    tts_pixelle_clone_api_key: str = ""
    asr_provider: str = "aliyun_paraformer"
    aliyun_asr_model: str = "paraformer-realtime-v2"
    aliyun_asr_api_key: str = ""
    aliyun_asr_workspace: str = ""

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
            fire_red_stream_idle_timeout_seconds=int(
                os.getenv("FIRERED_STREAM_IDLE_TIMEOUT_SECONDS", "180")
            ),
            fire_red_provider_key_configured=bool(
                os.getenv("FIRERED_PROVIDER_KEY", "").strip()
            ),
            fire_red_provider_key=os.getenv("FIRERED_PROVIDER_KEY", "").strip(),
            private_pexels_base_url=(
                os.getenv("PRIVATE_PEXELS_BASE_URL", "")
                or os.getenv("PEXELS_BASE_URL", "")
            )
            .strip()
            .rstrip("/"),
            private_pexels_api_key=(
                os.getenv("PRIVATE_PEXELS_API_KEY", "")
                or os.getenv("PEXELS_API_KEY", "")
            ).strip(),
            tts_provider=os.getenv(
                "OPENSTORYLINE_TTS_PROVIDER",
                "bytedance_bigtts",
            ).strip() or "bytedance_bigtts",
            tts_302_base_url=os.getenv(
                "TTS_302_BASE_URL",
                "https://api.302.ai",
            ).strip(),
            tts_302_api_key=os.getenv("TTS_302_API_KEY", "").strip(),
            tts_minimax_base_url=os.getenv(
                "TTS_MINIMAX_BASE_URL",
                "https://api.minimax.io",
            ).strip(),
            tts_minimax_api_key=os.getenv("TTS_MINIMAX_API_KEY", "").strip(),
            tts_runninghub_base_url=(
                os.getenv("TTS_RUNNINGHUB_BASE_URL", "https://www.runninghub.cn")
                or "https://www.runninghub.cn"
            ).strip(),
            tts_runninghub_api_key=(
                os.getenv("TTS_RUNNINGHUB_API_KEY", "")
                or os.getenv("RUNNINGHUB_API_KEY", "")
            ).strip(),
            tts_bytedance_bigtts_base_url=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_BASE_URL",
                "https://openspeech.bytedance.com",
            ).strip(),
            tts_bytedance_bigtts_uid=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_UID",
                "openstoryline",
            ).strip(),
            tts_bytedance_bigtts_appid=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_APPID",
                "",
            ).strip(),
            tts_bytedance_bigtts_access_key=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_ACCESS_KEY",
                "",
            ).strip(),
            tts_bytedance_bigtts_resource_id=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_RESOURCE_ID",
                "",
            ).strip(),
            tts_bytedance_bigtts_speaker=os.getenv(
                "TTS_BYTEDANCE_BIGTTS_SPEAKER",
                "",
            ).strip(),
            tts_pixelle_clone_base_url=os.getenv(
                "TTS_PIXELLE_CLONE_BASE_URL",
                "",
            ).strip(),
            tts_pixelle_clone_api_key=os.getenv(
                "TTS_PIXELLE_CLONE_API_KEY",
                "",
            ).strip(),
            asr_provider=os.getenv(
                "OPENSTORYLINE_ASR_PROVIDER",
                "aliyun_paraformer",
            ).strip() or "aliyun_paraformer",
            aliyun_asr_model=os.getenv(
                "ALIYUN_ASR_MODEL",
                "paraformer-realtime-v2",
            ).strip() or "paraformer-realtime-v2",
            aliyun_asr_api_key=(
                os.getenv("ALIYUN_ASR_API_KEY", "")
                or os.getenv("DASHSCOPE_API_KEY", "")
            ).strip(),
            aliyun_asr_workspace=os.getenv("ALIYUN_ASR_WORKSPACE", "").strip(),
        )
