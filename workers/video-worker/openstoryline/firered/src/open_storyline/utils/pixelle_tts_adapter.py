from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict

import requests

from open_storyline.utils.ffmpeg_utils import resolve_ffmpeg_executable
from open_storyline.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_EDGE_WORKFLOW_ID = "1983513964837543938"
DEFAULT_CLONE_WORKFLOW_ID = "1983718528991862786"


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _as_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _str_or_empty(value: Any) -> str:
    return str(value or "").strip()


def speed_to_edge_rate(speed: float) -> str:
    speed = max(0.5, min(2.0, float(speed)))
    pct = int(round((speed - 1.0) * 100))
    if pct == 0:
        return "+0%"
    return f"{pct:+d}%"


class PixelleTTSAdapter:
    """
    Pixelle voiceover bridge used by OpenStoryline.

    The historical "pixelle_clone" provider is a RunningHub workflow, not the
    RunningHub standard model API. Keep this adapter workflow-based so consumer
    RunningHub keys can use the configured workflow ids.
    """

    def __init__(self, *, fallback_cfg: Dict[str, Any], clone_cfg: Dict[str, Any]):
        self.fallback_cfg = fallback_cfg if isinstance(fallback_cfg, dict) else {}
        self.clone_cfg = clone_cfg if isinstance(clone_cfg, dict) else {}

    @classmethod
    def from_generate_voiceover_config(cls, cfg: Any) -> "PixelleTTSAdapter":
        fallback = getattr(cfg, "fallback", None) or {}
        clone = getattr(cfg, "clone", None) or {}
        fallback_pixelle = fallback.get("pixelle") if isinstance(fallback, dict) else {}
        clone_pixelle = clone.get("pixelle") if isinstance(clone, dict) else {}
        return cls(
            fallback_cfg=fallback_pixelle if isinstance(fallback_pixelle, dict) else {},
            clone_cfg=clone_pixelle if isinstance(clone_pixelle, dict) else {},
        )

    @property
    def fallback_enabled(self) -> bool:
        return _as_bool(self.fallback_cfg.get("enabled"), True)

    @property
    def try_edge_tts_enabled(self) -> bool:
        return _as_bool(self.fallback_cfg.get("try_edge_tts"), True)

    @property
    def runninghub_fallback_enabled(self) -> bool:
        return _as_bool(self.fallback_cfg.get("fallback_to_runninghub"), True)

    def with_runtime_runninghub_api_key(self, runtime_api_key: Any) -> "PixelleTTSAdapter":
        api_key = _str_or_empty(runtime_api_key)
        if not api_key:
            return self
        fallback_cfg = dict(self.fallback_cfg)
        clone_cfg = dict(self.clone_cfg)
        fallback_cfg["runninghub_api_key"] = api_key
        clone_cfg["runninghub_api_key"] = api_key
        return PixelleTTSAdapter(fallback_cfg=fallback_cfg, clone_cfg=clone_cfg)

    def with_runtime_clone_config(self, provider_cfg: Dict[str, Any]) -> "PixelleTTSAdapter":
        fallback_cfg = dict(self.fallback_cfg)
        clone_cfg = dict(self.clone_cfg)
        if isinstance(provider_cfg, dict):
            for src_key, dst_key in (
                ("api_key", "runninghub_api_key"),
                ("base_url", "runninghub_base_url"),
                ("workflow_id", "runninghub_tts_clone_workflow_id"),
                ("runninghub_tts_clone_workflow_id", "runninghub_tts_clone_workflow_id"),
                ("timeout_seconds", "timeout_seconds"),
            ):
                value = provider_cfg.get(src_key)
                if value not in (None, ""):
                    clone_cfg[dst_key] = value
        return PixelleTTSAdapter(fallback_cfg=fallback_cfg, clone_cfg=clone_cfg)

    def resolve_ref_audio(self, runtime_ref_audio: Any) -> str:
        return _str_or_empty(runtime_ref_audio) or _str_or_empty(self.clone_cfg.get("ref_audio"))

    async def synthesize_edge(self, *, text: str, output_path: Path) -> Dict[str, Any]:
        if not self.try_edge_tts_enabled:
            raise RuntimeError("pixelle edge tts is disabled")

        await self._edge_tts(
            text=text,
            output_path=output_path,
            voice=_str_or_empty(self.fallback_cfg.get("voice")) or "zh-CN-YunjianNeural",
            speed=_as_float(self.fallback_cfg.get("speed"), 1.2),
        )
        return {"provider": "pixelle_edge"}

    async def synthesize_runninghub_fallback(self, *, text: str, output_path: Path) -> Dict[str, Any]:
        if not self.runninghub_fallback_enabled:
            raise RuntimeError("pixelle runninghub fallback is disabled")

        await self._runninghub_tts(
            text=text,
            output_path=output_path,
            workflow_id=(
                _str_or_empty(self.fallback_cfg.get("runninghub_tts_edge_workflow_id"))
                or DEFAULT_EDGE_WORKFLOW_ID
            ),
            api_key=self._runninghub_api_key(self.fallback_cfg),
            runninghub_cfg=self.fallback_cfg,
            params={
                "voice": _str_or_empty(self.fallback_cfg.get("voice")) or "zh-CN-YunjianNeural",
                "speed": _as_float(self.fallback_cfg.get("speed"), 1.2),
            },
            timeout_seconds=_as_int(self.fallback_cfg.get("timeout_seconds"), 300),
        )
        return {"provider": "pixelle_runninghub"}

    async def synthesize_fallback(self, *, text: str, output_path: Path) -> Dict[str, Any]:
        if not self.fallback_enabled:
            raise RuntimeError("pixelle fallback is disabled")

        errors: list[str] = []

        if self.try_edge_tts_enabled:
            try:
                await self.synthesize_edge(text=text, output_path=output_path)
                return {
                    "provider": "pixelle_edge",
                    "fallback_errors": errors,
                }
            except Exception as exc:
                errors.append(f"edge_tts: {type(exc).__name__}: {exc}")
                logger.warning("Pixelle Edge-TTS fallback failed: %s", exc)

        if self.runninghub_fallback_enabled:
            try:
                await self.synthesize_runninghub_fallback(text=text, output_path=output_path)
                return {
                    "provider": "pixelle_runninghub",
                    "fallback_errors": errors,
                }
            except Exception as exc:
                errors.append(f"runninghub_tts_edge: {type(exc).__name__}: {exc}")
                logger.warning("Pixelle RunningHub fallback failed: %s", exc)

        raise RuntimeError("pixelle fallback failed: " + "; ".join(errors))

    async def synthesize_clone(self, *, text: str, ref_audio: str, output_path: Path) -> Dict[str, Any]:
        ref_audio = _str_or_empty(ref_audio)
        if not ref_audio:
            raise ValueError("clone_enabled requires ref_audio")

        await self._runninghub_tts(
            text=text,
            output_path=output_path,
            workflow_id=(
                _str_or_empty(self.clone_cfg.get("runninghub_tts_clone_workflow_id"))
                or DEFAULT_CLONE_WORKFLOW_ID
            ),
            api_key=self._runninghub_api_key(self.clone_cfg),
            runninghub_cfg=self.clone_cfg,
            params={"ref_audio": ref_audio},
            timeout_seconds=_as_int(self.clone_cfg.get("timeout_seconds"), 300),
        )
        return {
            "provider": "pixelle_clone",
            "ref_audio_present": True,
            "workflow_id": (
                _str_or_empty(self.clone_cfg.get("runninghub_tts_clone_workflow_id"))
                or DEFAULT_CLONE_WORKFLOW_ID
            ),
        }

    async def _edge_tts(self, *, text: str, output_path: Path, voice: str, speed: float) -> None:
        try:
            import edge_tts
        except Exception as exc:
            raise RuntimeError("edge-tts is not installed") from exc

        output_path.parent.mkdir(parents=True, exist_ok=True)
        rate = speed_to_edge_rate(speed)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
            await communicate.save(str(tmp_path))
            await asyncio.to_thread(self._convert_to_wav, tmp_path, output_path)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

    async def _runninghub_tts(
        self,
        *,
        text: str,
        output_path: Path,
        workflow_id: str,
        api_key: str,
        runninghub_cfg: Dict[str, Any],
        params: Dict[str, Any],
        timeout_seconds: int,
    ) -> None:
        if not api_key:
            raise ValueError("RunningHub API key is required for Pixelle RunningHub TTS")
        if not workflow_id:
            raise ValueError("RunningHub workflow id is required for Pixelle TTS")

        try:
            from comfykit import ComfyKit
        except Exception as exc:
            raise RuntimeError("comfykit is not installed") from exc

        workflow_params: Dict[str, Any] = {"text": text}
        workflow_params.update({k: v for k, v in (params or {}).items() if v not in (None, "")})

        kit = self._make_runninghub_kit(ComfyKit, api_key=api_key, cfg=runninghub_cfg)
        try:
            result = await kit.execute(workflow_id, workflow_params)
        finally:
            close = getattr(kit, "close", None)
            if callable(close):
                try:
                    maybe = close()
                    if hasattr(maybe, "__await__"):
                        await maybe
                except Exception:
                    pass

        status = str(getattr(result, "status", "") or "").lower()
        if status and status != "completed":
            raise RuntimeError(getattr(result, "msg", "") or f"RunningHub TTS status={status}")

        audio_path = self._extract_audio_path(result)
        if not audio_path:
            raise RuntimeError("RunningHub TTS did not return an audio file")

        await asyncio.to_thread(self._materialize_audio, audio_path, output_path, timeout_seconds)

    def _runninghub_api_key(self, cfg: Dict[str, Any]) -> str:
        return (
            _str_or_empty(cfg.get("runninghub_api_key"))
            or _str_or_empty(os.getenv("TTS_PIXELLE_CLONE_API_KEY"))
            or _str_or_empty(os.getenv("TTS_RUNNINGHUB_API_KEY"))
            or _str_or_empty(os.getenv("RUNNINGHUB_API_KEY"))
            or _str_or_empty(os.getenv("PIXELLE_RUNNINGHUB_API_KEY"))
        )

    def _runninghub_base_url(self, cfg: Dict[str, Any]) -> str:
        return (
            _str_or_empty(cfg.get("runninghub_base_url"))
            or _str_or_empty(os.getenv("TTS_PIXELLE_CLONE_BASE_URL"))
            or _str_or_empty(os.getenv("TTS_RUNNINGHUB_BASE_URL"))
            or _str_or_empty(os.getenv("RUNNINGHUB_BASE_URL"))
            or _str_or_empty(os.getenv("PIXELLE_RUNNINGHUB_BASE_URL"))
        ).rstrip("/")

    def _make_runninghub_kit(self, kit_cls: Any, *, api_key: str, cfg: Dict[str, Any]) -> Any:
        runninghub_url = self._runninghub_base_url(cfg)
        kwargs: Dict[str, Any] = {"runninghub_api_key": api_key}
        if runninghub_url:
            kwargs["runninghub_url"] = runninghub_url
        return kit_cls(**kwargs)

    def _extract_audio_path(self, result: Any) -> str:
        for attr in ("audios", "files"):
            values = getattr(result, attr, None)
            if isinstance(values, list) and values:
                return str(values[0])

        outputs = getattr(result, "outputs", None)
        if isinstance(outputs, dict):
            for value in outputs.values():
                if isinstance(value, str) and self._looks_like_audio(value):
                    return value
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, str) and self._looks_like_audio(item):
                            return item
        return ""

    def _looks_like_audio(self, value: str) -> bool:
        low = value.lower().split("?", 1)[0]
        return low.endswith((".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"))

    def _materialize_audio(self, source: str, output_path: Path, timeout_seconds: int) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if source.startswith(("http://", "https://")):
            suffix = Path(source.split("?", 1)[0]).suffix or ".audio"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                resp = requests.get(source, timeout=timeout_seconds)
                resp.raise_for_status()
                tmp_path.write_bytes(resp.content)
                self._convert_to_wav(tmp_path, output_path)
            finally:
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
            return

        self._convert_to_wav(Path(source), output_path)

    def _convert_to_wav(self, source: Path, output_path: Path) -> None:
        if not source.exists():
            raise FileNotFoundError(f"audio source not found: {source}")

        ffmpeg = resolve_ffmpeg_executable()
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "24000",
            "-ac",
            "1",
            str(output_path),
        ]
        completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if completed.returncode != 0:
            raise RuntimeError(
                f"ffmpeg audio conversion failed: {source}\n"
                f"{completed.stderr.decode('utf-8', errors='replace')}"
            )
