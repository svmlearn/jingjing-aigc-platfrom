from http import HTTPStatus
from typing import Any, Dict, Iterable, List, Optional
import os
import subprocess
import tempfile

from open_storyline.nodes.core_nodes.base_node import BaseNode, NodeMeta
from open_storyline.nodes.node_state import NodeState
from open_storyline.nodes.node_schema import LocalASRInput
from open_storyline.utils.register import NODE_REGISTRY

LOCAL_ASR_PROVIDERS = {"local", "local_funasr", "funasr"}
ALIYUN_ASR_PROVIDERS = {"aliyun", "aliyun_paraformer", "dashscope", "dashscope_paraformer"}
ALIYUN_RECOGNITION_MODEL_ALIASES = {
    "paraformer-v2": "paraformer-realtime-v2",
}


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _first_present(source: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def _append_asr_text(parts: List[str], text: str) -> None:
    text = text.strip()
    if not text:
        return
    if (
        parts
        and parts[-1]
        and parts[-1][-1].isascii()
        and parts[-1][-1].isalnum()
        and text[0].isascii()
        and text[0].isalnum()
    ):
        parts.append(" ")
    parts.append(text)


def _normalise_dashscope_sentences(sentences: Any) -> Dict[str, Any]:
    if isinstance(sentences, dict):
        sentence_items: Iterable[Dict[str, Any]] = [sentences]
    elif isinstance(sentences, list):
        sentence_items = [item for item in sentences if isinstance(item, dict)]
    else:
        sentence_items = []

    text_parts: List[str] = []
    timestamps: List[List[int]] = []
    sentence_info: List[Dict[str, Any]] = []

    for sentence in sentence_items:
        sentence_text = str(sentence.get("text") or "").strip()
        begin_time = _coerce_int(
            _first_present(sentence, "begin_time", "beginTime", "start_time", "start"),
        )
        end_time = _coerce_int(
            _first_present(sentence, "end_time", "endTime", "stop_time", "end"),
            begin_time,
        )

        words = sentence.get("words")
        word_timestamps: List[List[int]] = []
        if isinstance(words, list):
            for word in words:
                if not isinstance(word, dict):
                    continue
                word_begin = _first_present(word, "begin_time", "beginTime", "start_time", "start")
                word_end = _first_present(word, "end_time", "endTime", "stop_time", "end")
                if word_begin is None or word_end is None:
                    continue
                timestamp = [_coerce_int(word_begin), _coerce_int(word_end)]
                word_timestamps.append(timestamp)
                timestamps.append(timestamp)

        if not word_timestamps and end_time > begin_time:
            word_timestamps.append([begin_time, end_time])
            timestamps.append([begin_time, end_time])

        if sentence_text:
            _append_asr_text(text_parts, sentence_text)

        sentence_info.append(
            {
                "text": sentence_text,
                "start": begin_time,
                "end": end_time,
                "timestamp": word_timestamps,
                "words": words if isinstance(words, list) else [],
                "source": "aliyun_paraformer",
            }
        )

    return {
        "text": "".join(text_parts),
        "timestamp": timestamps,
        "sentence_info": sentence_info,
        "provider": "aliyun_paraformer",
    }


@NODE_REGISTRY.register()
class LocalASRNode(BaseNode):

    meta = NodeMeta(
        name="local_asr",
        description="Perform ASR on video clips locally using funasr",
        node_id="local_asr",
        node_kind="asr",
        require_prior_kind=['split_shots'],
        default_require_prior_kind=['split_shots'],
        next_available_node=['group_clips'],
    )

    input_schema = LocalASRInput

    def _provider(self, inputs: Dict[str, Any] | None = None) -> str:
        inputs = inputs or {}
        cfg = getattr(self.server_cfg, "asr", None)
        provider = (
            inputs.get("provider")
            or os.getenv("OPENSTORYLINE_ASR_PROVIDER")
            or getattr(cfg, "provider", None)
            or "local_funasr"
        )
        return str(provider).strip().lower()

    def _aliyun_asr_config(self, inputs: Dict[str, Any] | None = None) -> Dict[str, Any]:
        inputs = inputs or {}
        provider_keys = inputs.get("provider_keys")
        if not isinstance(provider_keys, dict):
            provider_keys = {}
        return {**provider_keys, **{k: v for k, v in inputs.items() if v not in (None, "", [], {})}}

    def _aliyun_asr_model(self, inputs: Dict[str, Any] | None = None) -> str:
        runtime_cfg = self._aliyun_asr_config(inputs)
        cfg = getattr(self.server_cfg, "asr", None)
        model = (
            runtime_cfg.get("model")
            or os.getenv("ALIYUN_ASR_MODEL")
            or getattr(cfg, "model", None)
            or "paraformer-realtime-v2"
        )
        model = str(model).strip()
        return ALIYUN_RECOGNITION_MODEL_ALIASES.get(model, model)

    def _aliyun_asr_api_key(self, inputs: Dict[str, Any] | None = None) -> str:
        runtime_cfg = self._aliyun_asr_config(inputs)
        cfg = getattr(self.server_cfg, "asr", None)
        return str(
            runtime_cfg.get("api_key")
            or os.getenv("ALIYUN_ASR_API_KEY")
            or getattr(cfg, "api_key", None)
            or os.getenv("DASHSCOPE_API_KEY")
            or ""
        ).strip()

    def _aliyun_asr_language_hints(self, inputs: Dict[str, Any] | None = None) -> Optional[List[str]]:
        runtime_cfg = self._aliyun_asr_config(inputs)
        cfg = getattr(self.server_cfg, "asr", None)
        hints = runtime_cfg.get("language_hints") or getattr(cfg, "language_hints", None)
        if hints is None:
            raw = os.getenv("ALIYUN_ASR_LANGUAGE_HINTS", "")
            hints = [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(hints, str):
            hints = [item.strip() for item in hints.split(",") if item.strip()]
        return list(hints) if hints else None

    def _transcribe_with_aliyun(self, audio_wav: str, inputs: Dict[str, Any] | None = None) -> Dict[str, Any]:
        runtime_cfg = self._aliyun_asr_config(inputs)
        api_key = self._aliyun_asr_api_key(inputs)
        if not api_key:
            raise RuntimeError("ALIYUN_ASR_API_KEY or DASHSCOPE_API_KEY is required for aliyun ASR")

        try:
            from dashscope.audio.asr import Recognition
        except ImportError as exc:
            raise RuntimeError("dashscope package is required for aliyun ASR") from exc

        cfg = getattr(self.server_cfg, "asr", None)
        kwargs: Dict[str, Any] = {
            "api_key": api_key,
            "callback": None,
            "format": str(runtime_cfg.get("format") or getattr(cfg, "format", None) or "wav"),
            "sample_rate": int(runtime_cfg.get("sample_rate") or getattr(cfg, "sample_rate", None) or 16000),
        }
        workspace = (
            runtime_cfg.get("workspace")
            or os.getenv("ALIYUN_ASR_WORKSPACE")
            or getattr(cfg, "workspace", None)
        )
        if workspace:
            kwargs["workspace"] = str(workspace)
        language_hints = self._aliyun_asr_language_hints(inputs)
        if language_hints:
            kwargs["language_hints"] = language_hints

        recognition = Recognition(
            model=self._aliyun_asr_model(inputs),
            **kwargs,
        )
        result = recognition.call(audio_wav)
        if result.status_code != HTTPStatus.OK:
            raise RuntimeError(
                "Aliyun ASR failed: "
                f"status={result.status_code}, code={getattr(result, 'code', '')}, "
                f"message={getattr(result, 'message', '')}"
            )

        normalized = _normalise_dashscope_sentences(result.get_sentence())
        normalized["request_id"] = result.get_request_id()
        normalized["model"] = self._aliyun_asr_model(inputs)
        return normalized

    def _load_asr_model(self):

        if hasattr(self, "asr_model"):
            return self.asr_model
        else:
            from funasr import AutoModel

            self.asr_model = AutoModel(
                model="paraformer-zh",
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                vad_kwargs={"max_single_segment_time": 30000},
            )
            return self.asr_model

    def extract_audio_wav(self, video_path: str, tmpdir: str):
        # 1. Determine if there is an audio track
        probe_cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=index",
            "-of", "csv=p=0",
            video_path
        ]

        result = subprocess.run(probe_cmd, capture_output=True, text=True)

        if not result.stdout.strip():
            return None

        out_wav = os.path.join(tmpdir, "audio.wav")

        # 3. Extract audio
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-i", video_path,
            "-af", "afftdn,agate=threshold=-40dB:ratio=10:attack=20:release=100",
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            out_wav
        ]

        subprocess.run(ffmpeg_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        return out_wav

    async def default_process(
        self,
        node_state,
        inputs: Dict[str, Any],
    ) -> Any:
        return await self.process(node_state, inputs)

    async def process(self, node_state: NodeState, inputs: Dict[str, Any]) -> Any:

        clips = inputs["split_shots"].get('clips', [])
        provider = self._provider(inputs)
        if provider in LOCAL_ASR_PROVIDERS:
            asr_model = self._load_asr_model()
        elif provider in ALIYUN_ASR_PROVIDERS:
            asr_model = None
        else:
            raise ValueError(f"Unsupported ASR provider: {provider}")

        asr_infos = []
        for index, clip in enumerate(clips):
            video_path = clip["path"]
            kind = clip["kind"]
            source_ref = clip.get("source_ref", {})
            fps = clip.get("fps", 30)

            # only process video clips, for other kinds of clips, directly return empty asr text
            if kind != "video":
                asr_infos.append({
                    "clip_id": clip["clip_id"],
                    "path": video_path,
                    "kind": kind,
                    "source_ref": source_ref,
                    "fps": fps,
                    "asr_res": {},
                })
                continue

            with tempfile.TemporaryDirectory() as tmpdir:

                # extract audio wav from video clip, if no audio track, directly return empty asr text
                audio_wav = self.extract_audio_wav(video_path, tmpdir)
                if audio_wav is None:
                    asr_infos.append({
                        "clip_id": clip["clip_id"],
                        "path": video_path,
                        "kind": kind,
                        "source_ref": source_ref,
                        "fps": fps,
                        "asr_res": {},
                    })
                    node_state.node_summary.info_for_llm(f"Clip {clip['clip_id']} has no audio track, skipped for asr.")
                    continue

                # perform asr and get asr text, here we directly use the audio wav path as input for asr model,
                # since funasr can support audio file input and will handle the audio loading and feature extraction internally,
                # which can avoid the potential audio loading and feature extraction issues in different environments
                await self._report_progress(
                    node_state,
                    index,
                    len(clips),
                    f"transcribing clip {clip['clip_id']} with {provider}",
                )
                if provider in ALIYUN_ASR_PROVIDERS:
                    asr_res = self._transcribe_with_aliyun(audio_wav, inputs)
                else:
                    res = asr_model.generate(
                        input=audio_wav,
                        sentence_timestamp=True
                    )
                    asr_res = res[0] if res else {}
                asr_infos.append({
                    "clip_id": clip["clip_id"],
                    "path": video_path,
                    "kind": kind,
                    "source_ref": source_ref,
                    "fps": fps,
                    "asr_res": asr_res,
                })

        return {
            "asr_infos": asr_infos,
        }

    def _combine_tool_outputs(self, node_state, outputs):

        asr_infos = outputs.get("asr_infos", [])
        regularized_asr_infos = []

        for asr_info in asr_infos:
            clip_id = asr_info["clip_id"]
            kind = asr_info["kind"]
            asr_res = asr_info.get("asr_res", {})

            regularized_asr_infos.append({
                "clip_id": clip_id,
                "kind": kind,
                "path": asr_info["path"],
                "asr_text": asr_res.get("text", "") if asr_res else "",
                "asr_timestamps": asr_res.get("timestamp", []) if asr_res else [],
                "asr_sentence_info": asr_res.get("sentence_info", []) if asr_res else [],
                "source_ref": asr_info.get("source_ref", {}),
                "fps": asr_info.get("fps", 30),
            })
        return {
            "asr_infos": regularized_asr_infos,
        }
