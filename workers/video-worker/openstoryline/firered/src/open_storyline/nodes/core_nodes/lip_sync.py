from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable

import requests

from open_storyline.nodes.core_nodes.base_node import BaseNode, NodeMeta
from open_storyline.nodes.node_schema import LipSyncInput
from open_storyline.nodes.node_state import NodeState
from open_storyline.utils.ffmpeg_utils import resolve_ffmpeg_executable
from open_storyline.utils.register import NODE_REGISTRY


MILLISECONDS_PER_SECOND = 1000.0
DEFAULT_PROVIDER = "aliyun_videoretalk"
DEFAULT_MODEL = "videoretalk"
DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_INTERVAL_SECONDS = 15
MIN_DURATION_MS = 2_000
MAX_DURATION_MS = 120_000
MAX_AUDIO_BYTES = 30 * 1024 * 1024
MAX_VIDEO_BYTES = 300 * 1024 * 1024
AUDIO_SUFFIXES = {".wav", ".mp3", ".aac"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".avi"}
TALKING_HEAD_TOKENS = {
    "talking-head",
    "talking_head",
    "talkinghead",
    "真人口播",
    "口播",
}
OSS_UPLOAD_URL_MODES = {"auto", "oss", "aliyun_oss"}
SECRET_LIKE_QUERY_RE = re.compile(
    r"([?&][A-Za-z0-9_.-]*(?:signature|token|accesskeyid|access_key_id|keyid|key|expires|security-token|x-oss-[^=]*)=)[^&\s\"']+",
    re.IGNORECASE,
)


class LipSyncProviderConfigError(RuntimeError):
    pass


class LipSyncProviderError(RuntimeError):
    def __init__(self, message: str, *, provider_task_id: str | None = None) -> None:
        self.provider_task_id = provider_task_id
        super().__init__(message)


class AliyunVideoRetalkAdapter:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        model: str = DEFAULT_MODEL,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        poll_interval_seconds: int = DEFAULT_POLL_INTERVAL_SECONDS,
        ref_image_url: str = "",
        video_extension: bool = False,
        query_face_threshold: int | None = None,
    ) -> None:
        self.api_key = str(api_key or "").strip()
        self.base_url = str(base_url or DEFAULT_BASE_URL).strip().rstrip("/")
        self.model = str(model or DEFAULT_MODEL).strip()
        self.timeout_seconds = int(timeout_seconds or DEFAULT_TIMEOUT_SECONDS)
        self.poll_interval_seconds = int(poll_interval_seconds or DEFAULT_POLL_INTERVAL_SECONDS)
        self.ref_image_url = str(ref_image_url or "").strip()
        self.video_extension = self._as_bool(video_extension)
        self.query_face_threshold = (
            int(query_face_threshold)
            if self.ref_image_url and query_face_threshold not in (None, "")
            else None
        )
        if not self.api_key:
            raise LipSyncProviderConfigError(
                "lip_sync provider aliyun_videoretalk is missing api_key"
            )

    def run(
        self,
        *,
        video_url: str,
        audio_url: str,
        output_dir: Path,
        output_name: str,
    ) -> tuple[Path, dict[str, Any]]:
        task_id = self.submit(video_url=video_url, audio_url=audio_url)
        result_url, raw_response = self.poll(task_id)
        output_path = self.download(result_url, output_dir=output_dir, output_name=output_name)
        raw_response.setdefault("provider_task_id", task_id)
        raw_response.setdefault("result_url", result_url)
        return output_path, raw_response

    def submit(self, *, video_url: str, audio_url: str) -> str:
        endpoint = f"{self.base_url}/services/aigc/image2video/video-synthesis/"
        payload = {
            "model": self.model,
            "input": {
                "video_url": video_url,
                "audio_url": audio_url,
            },
            "parameters": {
                "video_extension": self.video_extension,
            },
        }
        if self.ref_image_url:
            payload["input"]["ref_image_url"] = self.ref_image_url
        if self.query_face_threshold is not None:
            payload["parameters"]["query_face_threshold"] = self.query_face_threshold
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=60)
        except requests.RequestException as exc:
            raise LipSyncProviderError(
                f"aliyun_videoretalk submit request failed: {exc}"
            ) from exc
        self._raise_for_status(response, "submit")
        data = response.json()
        task_id = data.get("output", {}).get("task_id") or data.get("task_id")
        if not task_id:
            raise LipSyncProviderError(
                f"aliyun_videoretalk submit response missing task_id: {self._safe_text(data)}"
            )
        return str(task_id)

    def poll(self, task_id: str) -> tuple[str, dict[str, Any]]:
        endpoint = f"{self.base_url}/tasks/{task_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        deadline = time.monotonic() + max(1, self.timeout_seconds)
        last_response: dict[str, Any] = {}
        while time.monotonic() < deadline:
            try:
                response = requests.get(endpoint, headers=headers, timeout=60)
            except requests.RequestException as exc:
                raise LipSyncProviderError(
                    f"aliyun_videoretalk poll request failed: {exc}",
                    provider_task_id=task_id,
                ) from exc
            self._raise_for_status(response, "poll", provider_task_id=task_id)
            data = response.json()
            last_response = data
            output = data.get("output", {}) if isinstance(data.get("output"), dict) else {}
            status = str(output.get("task_status") or data.get("task_status") or "").upper()
            if status == "SUCCEEDED":
                result_url = (
                    output.get("video_url")
                    or output.get("output_video_url")
                    or output.get("url")
                    or self._nested_value(output, "results", "video_url")
                    or self._nested_value(output, "results", "output_video_url")
                    or self._nested_value(output, "results", "url")
                    or data.get("video_url")
                )
                if not result_url:
                    raise LipSyncProviderError(
                        f"aliyun_videoretalk succeeded without result video url: {self._safe_text(data)}",
                        provider_task_id=task_id,
                    )
                return str(result_url), data
            if status in {"FAILED", "CANCELED", "CANCELLED"}:
                raise LipSyncProviderError(
                    f"aliyun_videoretalk task failed: {self._safe_text(data)}",
                    provider_task_id=task_id,
                )
            time.sleep(max(1, self.poll_interval_seconds))
        raise LipSyncProviderError(
            f"aliyun_videoretalk task timed out after {self.timeout_seconds}s: {self._safe_text(last_response)}",
            provider_task_id=task_id,
        )

    def download(self, result_url: str, *, output_dir: Path, output_name: str) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        try:
            response = requests.get(result_url, stream=True, timeout=120)
        except requests.RequestException as exc:
            raise LipSyncProviderError(f"aliyun_videoretalk download failed: {exc}") from exc
        self._raise_for_status(response, "download")
        content_type = response.headers.get("content-type", "")
        suffix = mimetypes.guess_extension(content_type) or Path(result_url).suffix or ".mp4"
        if suffix.lower() not in VIDEO_SUFFIXES:
            suffix = ".mp4"
        output_path = output_dir / f"{output_name}{suffix}"
        with output_path.open("wb") as fh:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
        return output_path

    def _raise_for_status(
        self,
        response: requests.Response,
        action: str,
        *,
        provider_task_id: str | None = None,
    ) -> None:
        if response.ok:
            return
        text = ""
        try:
            text = json.dumps(response.json(), ensure_ascii=False)
        except Exception:
            text = response.text or ""
        text = self._sanitize_diagnostic_text(text)
        raise LipSyncProviderError(
            f"aliyun_videoretalk {action} failed: HTTP {response.status_code}. {text[:2000]}",
            provider_task_id=provider_task_id,
        )

    @staticmethod
    def _safe_text(data: Any) -> str:
        try:
            text = json.dumps(data, ensure_ascii=False)
        except Exception:
            text = str(data)
        return AliyunVideoRetalkAdapter._sanitize_diagnostic_text(text)[:2000]

    @staticmethod
    def _sanitize_diagnostic_text(text: str) -> str:
        return SECRET_LIKE_QUERY_RE.sub(r"\1<redacted>", str(text or ""))

    @staticmethod
    def _nested_value(payload: Any, *keys: str) -> Any:
        cur = payload
        for key in keys:
            if not isinstance(cur, dict):
                return None
            cur = cur.get(key)
        return cur

    @staticmethod
    def _as_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return False


@NODE_REGISTRY.register()
class LipSyncNode(BaseNode):
    meta = NodeMeta(
        name="lip_sync",
        description=(
            "Run provider lip-sync for talking-head segments after timeline planning "
            "and return a retalked timeline for render_video."
        ),
        node_id="lip_sync",
        node_kind="lip_sync",
        require_prior_kind=["load_media", "split_shots", "group_clips", "generate_script", "tts", "plan_timeline"],
        default_require_prior_kind=["plan_timeline"],
        next_available_node=["render_video"],
    )

    input_schema = LipSyncInput

    async def default_process(self, node_state: NodeState, inputs: Dict[str, Any]) -> Any:
        plan_timeline = inputs.get("plan_timeline") or {}
        node_state.node_summary.info_for_user("lip_sync skipped; render_video will use original timeline")
        return {
            "provider": None,
            "enabled": False,
            "scope": "talking_head_segments",
            "segments": [],
            "plan_timeline": plan_timeline,
        }

    async def process(self, node_state: NodeState, inputs: Dict[str, Any]) -> Any:
        provider = str(inputs.get("provider") or DEFAULT_PROVIDER).strip().lower()
        if provider != DEFAULT_PROVIDER:
            raise ValueError(f"unsupported lip_sync provider: {provider}")

        plan_timeline = inputs.get("plan_timeline") or {}
        tracks = plan_timeline.get("tracks") if isinstance(plan_timeline, dict) else None
        if not isinstance(tracks, dict):
            raise ValueError("lip_sync requires plan_timeline.tracks")

        video_segments = tracks.get("video") if isinstance(tracks.get("video"), list) else []
        if not video_segments:
            raise ValueError("lip_sync requires non-empty plan_timeline.tracks.video")

        voiceover_by_group = self._voiceover_by_group(inputs.get("tts") or {})
        clip_lookup = self._clip_lookup(inputs.get("split_shots") or {})
        targets = [
            segment
            for segment in video_segments
            if self._is_lip_sync_target(segment, clip_lookup)
        ]
        if not targets:
            raise ValueError(
                "lip_sync enabled but no talking-head timeline segments were found"
            )

        output_dir = self._prepare_output_directory(node_state) / "lip_sync"
        output_dir.mkdir(parents=True, exist_ok=True)
        adapter = self._adapter_from_inputs(inputs)

        updated_plan_timeline = self._deep_copy_jsonable(plan_timeline)
        updated_video = updated_plan_timeline.setdefault("tracks", {}).setdefault("video", [])
        updated_segments_by_key = {
            self._segment_key(segment): segment
            for segment in updated_video
            if isinstance(segment, dict)
        }

        outputs: list[dict[str, Any]] = []
        ffmpeg = resolve_ffmpeg_executable()
        total = len(targets)
        for index, segment in enumerate(targets, start=1):
            group_id = str(segment.get("group_id") or "")
            clip_id = str(segment.get("clip_id") or "")
            self._ensure_talking_head_segment(segment, clip_lookup)
            voiceover = voiceover_by_group.get(group_id)
            if not voiceover:
                raise ValueError(f"lip_sync target group {group_id} has no cloned voiceover")

            source_path = self._source_path_for_segment(segment)
            audio_path = Path(str(voiceover.get("path") or "")).expanduser()
            self._validate_file(source_path, VIDEO_SUFFIXES, max_bytes=MAX_VIDEO_BYTES, kind="video")
            self._validate_file(audio_path, AUDIO_SUFFIXES, max_bytes=MAX_AUDIO_BYTES, kind="audio")
            self._validate_duration_ms(voiceover.get("duration_ms") or voiceover.get("duration"), kind="audio")

            segment_dir = output_dir / f"{index:04d}_{group_id or 'group'}_{clip_id or 'clip'}"
            segment_dir.mkdir(parents=True, exist_ok=True)
            video_input_path = self._prepare_video_input(
                source_path=source_path,
                segment=segment,
                output_dir=segment_dir,
                ffmpeg=ffmpeg,
            )
            self._validate_duration_ms(
                self._duration_ms_for_segment(segment, fallback_path=video_input_path),
                kind="video",
            )

            video_url = self._provider_url_for_path(video_input_path, inputs, label="video")
            audio_url = self._provider_url_for_path(audio_path, inputs, label="audio")
            await self._report_progress(
                node_state,
                index - 1,
                total,
                f"lip_sync submitting {index}/{total}",
            )

            retalked_path, raw_provider_response = adapter.run(
                video_url=video_url,
                audio_url=audio_url,
                output_dir=segment_dir,
                output_name=f"retalked_{group_id or index}_{clip_id or index}",
            )

            updated_segment = updated_segments_by_key.get(self._segment_key(segment))
            if updated_segment is None:
                continue
            updated_segment["original_source_path"] = str(source_path)
            updated_segment["source_path"] = str(retalked_path)
            updated_segment["lip_sync_provider"] = provider
            updated_segment["lip_sync_scope"] = "talking_head_segments"
            updated_segment["source_window"] = {
                "start": 0,
                "end": self._duration_ms_for_segment(segment, fallback_path=retalked_path),
            }
            updated_segment["playback_rate"] = 1.0

            provider_task_id = raw_provider_response.get("provider_task_id")
            outputs.append(
                {
                    "group_id": group_id,
                    "clip_id": clip_id,
                    "source_path": str(source_path),
                    "retalked_path": str(retalked_path),
                    "voiceover_path": str(audio_path),
                    "timeline_window": segment.get("timeline_window"),
                    "source_window": segment.get("source_window"),
                    "provider": provider,
                    "provider_task_id": provider_task_id,
                    "scope": "talking_head_segments",
                }
            )
            node_state.node_summary.info_for_user(
                f"lip_sync completed for {group_id}/{clip_id}",
                preview_urls=[str(retalked_path)],
            )

        await self._report_progress(node_state, total, total, f"lip_sync completed {total}/{total}")
        return {
            "provider": provider,
            "enabled": True,
            "scope": "talking_head_segments",
            "segments": outputs,
            "plan_timeline": updated_plan_timeline,
        }

    def _adapter_from_inputs(self, inputs: Dict[str, Any]) -> AliyunVideoRetalkAdapter:
        provider_cfg = inputs.get("provider_keys")
        if not isinstance(provider_cfg, dict):
            provider_cfg = {}
        block = inputs.get(DEFAULT_PROVIDER)
        if isinstance(block, dict):
            provider_cfg = {**block, **provider_cfg}
        return AliyunVideoRetalkAdapter(
            api_key=str(inputs.get("api_key") or provider_cfg.get("api_key") or ""),
            base_url=str(inputs.get("base_url") or provider_cfg.get("base_url") or DEFAULT_BASE_URL),
            model=str(inputs.get("model") or provider_cfg.get("model") or DEFAULT_MODEL),
            timeout_seconds=int(
                inputs.get("timeout_seconds") or provider_cfg.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS
            ),
            poll_interval_seconds=int(
                inputs.get("poll_interval_seconds")
                or provider_cfg.get("poll_interval_seconds")
                or DEFAULT_POLL_INTERVAL_SECONDS
            ),
            ref_image_url=str(inputs.get("ref_image_url") or provider_cfg.get("ref_image_url") or ""),
            video_extension=(
                inputs.get("video_extension")
                if inputs.get("video_extension") is not None
                else provider_cfg.get("video_extension")
            ),
            query_face_threshold=(
                inputs.get("query_face_threshold") or provider_cfg.get("query_face_threshold")
            ),
        )

    @staticmethod
    def _deep_copy_jsonable(value: Any) -> Any:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))

    @staticmethod
    def _voiceover_by_group(tts: dict[str, Any]) -> dict[str, dict[str, Any]]:
        voiceovers = tts.get("voiceover") if isinstance(tts, dict) else []
        out: dict[str, dict[str, Any]] = {}
        if isinstance(voiceovers, list):
            for item in voiceovers:
                if isinstance(item, dict) and item.get("group_id"):
                    out[str(item["group_id"])] = item
        return out

    @staticmethod
    def _clip_lookup(split_shots: dict[str, Any]) -> dict[str, dict[str, Any]]:
        clips = split_shots.get("clips") if isinstance(split_shots, dict) else []
        if not isinstance(clips, list):
            return {}
        return {
            str(clip.get("clip_id")): clip
            for clip in clips
            if isinstance(clip, dict) and clip.get("clip_id")
        }

    @classmethod
    def _is_lip_sync_target(
        cls,
        segment: dict[str, Any],
        clip_lookup: dict[str, dict[str, Any]],
    ) -> bool:
        if str(segment.get("kind") or "video").lower() != "video":
            return False
        return cls._segment_has_talking_head_label(segment, clip_lookup)

    @classmethod
    def _ensure_talking_head_segment(
        cls,
        segment: dict[str, Any],
        clip_lookup: dict[str, dict[str, Any]],
    ) -> None:
        if cls._segment_has_talking_head_label(segment, clip_lookup):
            return
        clip = cls._clip_for_segment(segment, clip_lookup)
        source_ref = clip.get("source_ref") if isinstance(clip, dict) else {}
        if not isinstance(source_ref, dict):
            source_ref = {}
        details = {
            "group_id": segment.get("group_id"),
            "clip_id": segment.get("clip_id"),
            "media_id": cls._first_non_empty(
                segment.get("media_id"),
                clip.get("media_id") if isinstance(clip, dict) else None,
                source_ref.get("media_id"),
            ),
            "role": cls._first_non_empty(
                segment.get("role"),
                clip.get("role") if isinstance(clip, dict) else None,
                source_ref.get("role"),
            ),
            "scene_type": cls._first_non_empty(
                segment.get("scene_type"),
                clip.get("scene_type") if isinstance(clip, dict) else None,
                source_ref.get("scene_type"),
            ),
            "source_path": cls._first_non_empty(
                segment.get("source_path"),
                segment.get("path"),
                clip.get("source_path") if isinstance(clip, dict) else None,
                clip.get("path") if isinstance(clip, dict) else None,
            ),
        }
        raise ValueError(
            "lip_sync_non_talking_head_segment_blocked: "
            + ", ".join(
                f"{key}={value}"
                for key, value in details.items()
                if value not in (None, "")
            )
        )

    @classmethod
    def _segment_has_talking_head_label(
        cls,
        segment: dict[str, Any],
        clip_lookup: dict[str, dict[str, Any]],
    ) -> bool:
        if cls._clip_has_talking_head_label(segment):
            return True
        clip_id = str(segment.get("clip_id") or "")
        return cls._clip_has_talking_head_label(clip_lookup.get(clip_id))

    @staticmethod
    def _clip_for_segment(
        segment: dict[str, Any],
        clip_lookup: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        clip_id = str(segment.get("clip_id") or "")
        clip = clip_lookup.get(clip_id)
        return clip if isinstance(clip, dict) else {}

    @staticmethod
    def _first_non_empty(*values: Any) -> Any:
        for value in values:
            if value not in (None, ""):
                return value
        return None

    @classmethod
    def _clip_has_talking_head_label(cls, clip: Any) -> bool:
        if not isinstance(clip, dict):
            return False
        values = list(cls._iter_label_values(clip))
        source_ref = clip.get("source_ref")
        if isinstance(source_ref, dict):
            values.extend(cls._iter_label_values(source_ref))
        normalized = {
            str(value).strip().lower().replace("_", "-")
            for value in values
            if str(value).strip()
        }
        return any(token.replace("_", "-") in normalized for token in TALKING_HEAD_TOKENS)

    @classmethod
    def _iter_label_values(cls, payload: dict[str, Any]) -> Iterable[str]:
        for key in ("role", "scene_type", "sceneType", "asset_type", "assetType", "content_type"):
            value = payload.get(key)
            if isinstance(value, str):
                yield value
        for key in ("tags", "labels"):
            value = payload.get(key)
            if isinstance(value, list | tuple | set):
                for item in value:
                    yield str(item)
        metadata = payload.get("metadata")
        if isinstance(metadata, dict):
            yield from cls._iter_label_values(metadata)

    @staticmethod
    def _segment_key(segment: dict[str, Any]) -> tuple[str, str, str, str]:
        timeline = segment.get("timeline_window") if isinstance(segment.get("timeline_window"), dict) else {}
        return (
            str(segment.get("group_id") or ""),
            str(segment.get("clip_id") or ""),
            str(timeline.get("start") or ""),
            str(timeline.get("end") or ""),
        )

    @staticmethod
    def _source_path_for_segment(segment: dict[str, Any]) -> Path:
        source_path = str(segment.get("source_path") or segment.get("path") or "").strip()
        if not source_path:
            raise ValueError(f"lip_sync segment missing source_path: {segment}")
        return Path(source_path).expanduser()

    @staticmethod
    def _validate_file(path: Path, suffixes: set[str], *, max_bytes: int, kind: str) -> None:
        if path.suffix.lower() not in suffixes:
            raise ValueError(f"lip_sync {kind} format unsupported: {path.suffix}")
        if not path.exists():
            raise FileNotFoundError(f"lip_sync {kind} file not found: {path}")
        size = path.stat().st_size
        if size > max_bytes:
            raise ValueError(f"lip_sync {kind} file too large: {size} bytes")

    @staticmethod
    def _validate_duration_ms(value: Any, *, kind: str) -> None:
        try:
            duration = int(float(value))
        except Exception as exc:
            raise ValueError(f"lip_sync {kind} duration missing") from exc
        if not (MIN_DURATION_MS < duration < MAX_DURATION_MS):
            raise ValueError(
                f"lip_sync {kind} duration must be greater than 2s and less than 120s"
            )

    @classmethod
    def _duration_ms_for_segment(cls, segment: dict[str, Any], *, fallback_path: Path) -> int:
        source_window = segment.get("source_window") if isinstance(segment.get("source_window"), dict) else {}
        duration = source_window.get("duration")
        if duration is None and source_window.get("start") is not None and source_window.get("end") is not None:
            try:
                duration = int(float(source_window["end"])) - int(float(source_window["start"]))
            except Exception:
                duration = None
        if duration is not None:
            return int(float(duration))
        return cls._probe_duration_ms(fallback_path)

    @staticmethod
    def _probe_duration_ms(path: Path) -> int:
        try:
            from moviepy import VideoFileClip
        except Exception:  # pragma: no cover
            from moviepy.editor import VideoFileClip  # type: ignore
        clip = VideoFileClip(str(path), audio=False)
        try:
            return int(float(getattr(clip, "duration", 0.0) or 0.0) * MILLISECONDS_PER_SECOND)
        finally:
            try:
                clip.close()
            except Exception:
                pass

    def _prepare_video_input(
        self,
        *,
        source_path: Path,
        segment: dict[str, Any],
        output_dir: Path,
        ffmpeg: str,
    ) -> Path:
        source_window = segment.get("source_window") if isinstance(segment.get("source_window"), dict) else {}
        start_ms = source_window.get("start")
        end_ms = source_window.get("end")
        if start_ms in (None, 0, 0.0, "0") and end_ms is None:
            return source_path
        try:
            start_s = max(0.0, float(start_ms or 0) / MILLISECONDS_PER_SECOND)
            end_s = float(end_ms) / MILLISECONDS_PER_SECOND if end_ms is not None else None
        except Exception:
            return source_path
        if end_s is None or end_s <= start_s:
            return source_path
        output_path = output_dir / f"source_window{source_path.suffix.lower() or '.mp4'}"
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-ss",
            f"{start_s:.3f}",
            "-to",
            f"{end_s:.3f}",
            "-i",
            str(source_path),
            "-map",
            "0:v:0",
            "-an",
            "-dn",
            "-sn",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if completed.returncode != 0:
            raise RuntimeError(
                "lip_sync video window extraction failed: "
                + completed.stderr.decode("utf-8", errors="replace")
            )
        return output_path

    def _provider_url_for_path(self, path: Path, inputs: dict[str, Any], *, label: str) -> str:
        provider_cfg = inputs.get("provider_keys")
        if not isinstance(provider_cfg, dict):
            provider_cfg = {}
        block = inputs.get(DEFAULT_PROVIDER)
        if isinstance(block, dict):
            provider_cfg = {**block, **provider_cfg}
        override_key = f"{label}_url"
        override = inputs.get(override_key) or provider_cfg.get(override_key)
        if override:
            return str(override)
        url_mode = str(
            inputs.get("upload_url_mode") or provider_cfg.get("upload_url_mode") or "external_url"
        ).strip().lower()
        if url_mode in OSS_UPLOAD_URL_MODES:
            return self._upload_local_file_to_oss(path, inputs, provider_cfg, label=label)
        if url_mode != "external_url":
            raise LipSyncProviderConfigError(
                f"lip_sync upload_url_mode={url_mode!r} is not implemented in this worker"
            )
        raise LipSyncProviderConfigError(
            f"lip_sync requires provider-accessible {label}_url for local file {path}; "
            "configure temporary OSS/DashScope upload URL plumbing before production verification"
        )

    def _upload_local_file_to_oss(
        self,
        path: Path,
        inputs: dict[str, Any],
        provider_cfg: dict[str, Any],
        *,
        label: str,
    ) -> str:
        try:
            import oss2
        except Exception as exc:
            raise LipSyncProviderConfigError(
                "lip_sync upload_url_mode requires the oss2 package"
            ) from exc

        access_key_id = self._first_config_value(
            inputs,
            provider_cfg,
            "oss_access_key_id",
            "aliyun_oss_access_key_id",
            env=("WORKER_ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_ID"),
        )
        access_key_secret = self._first_config_value(
            inputs,
            provider_cfg,
            "oss_access_key_secret",
            "aliyun_oss_access_key_secret",
            env=("WORKER_ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIYUN_OSS_ACCESS_KEY_SECRET"),
        )
        bucket_name = self._first_config_value(
            inputs,
            provider_cfg,
            "oss_bucket",
            "aliyun_oss_bucket",
            env=("WORKER_ALIYUN_OSS_BUCKET", "ALIYUN_OSS_BUCKET"),
        )
        endpoint = self._first_config_value(
            inputs,
            provider_cfg,
            "oss_endpoint",
            "aliyun_oss_endpoint",
            env=("WORKER_ALIYUN_OSS_ENDPOINT", "ALIYUN_OSS_ENDPOINT"),
        )
        if not all((access_key_id, access_key_secret, bucket_name, endpoint)):
            raise LipSyncProviderConfigError(
                "lip_sync upload_url_mode requires Aliyun OSS access_key_id, "
                "access_key_secret, bucket, and endpoint"
            )

        prefix = self._first_config_value(
            inputs,
            provider_cfg,
            "oss_prefix",
            "upload_prefix",
            "aliyun_oss_prefix",
            env=(
                "ALIYUN_VIDEORETALK_OSS_PREFIX",
                "WORKER_ALIYUN_OSS_RESULT_PREFIX",
                "WORKER_STORAGE_RESULT_PREFIX",
                "REAL_IO_SMOKE_STORAGE_PREFIX",
            ),
            default="video-results",
        )
        expires = int(
            self._first_config_value(
                inputs,
                provider_cfg,
                "signed_url_expires_seconds",
                "oss_signed_url_expires_seconds",
                env=("ALIYUN_VIDEORETALK_SIGNED_URL_EXPIRES_SECONDS",),
                default="86400",
            )
        )
        object_key = self._oss_object_key(path, inputs, label=label, prefix=prefix)
        content_type = mimetypes.guess_type(str(path))[0]
        headers = {"Content-Type": content_type} if content_type else None

        bucket = oss2.Bucket(
            oss2.Auth(access_key_id, access_key_secret),
            endpoint,
            bucket_name,
        )
        bucket.put_object_from_file(object_key, str(path), headers=headers)
        return str(bucket.sign_url("GET", object_key, expires))

    @classmethod
    def _oss_object_key(
        cls,
        path: Path,
        inputs: dict[str, Any],
        *,
        label: str,
        prefix: str,
    ) -> str:
        session_id = cls._safe_object_key_part(inputs.get("session_id") or "session")
        artifact_id = cls._safe_object_key_part(inputs.get("artifact_id") or "artifact")
        suffix = path.suffix.lower() or (".wav" if label == "audio" else ".mp4")
        prefix = cls._safe_object_key_prefix(prefix or "video-results")
        return (
            f"{prefix}/lip-sync-inputs/{session_id}/{artifact_id}/"
            f"{uuid.uuid4().hex}_{cls._safe_object_key_part(label)}{suffix}"
        )

    @staticmethod
    def _safe_object_key_prefix(value: Any) -> str:
        cleaned = str(value or "").strip().strip("/")
        cleaned = re.sub(r"[^A-Za-z0-9._/-]+", "-", cleaned)
        return cleaned.strip("/") or "video-results"

    @staticmethod
    def _safe_object_key_part(value: Any) -> str:
        cleaned = str(value or "").strip()
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", cleaned)
        return cleaned.strip("-_.") or "item"

    @staticmethod
    def _first_config_value(
        inputs: dict[str, Any],
        provider_cfg: dict[str, Any],
        *keys: str,
        env: tuple[str, ...] = (),
        default: str = "",
    ) -> str:
        for key in keys:
            value = inputs.get(key)
            if value not in (None, ""):
                return str(value).strip()
            value = provider_cfg.get(key)
            if value not in (None, ""):
                return str(value).strip()
        for name in env:
            value = os.getenv(name)
            if value not in (None, ""):
                return str(value).strip()
        return default
