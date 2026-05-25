import os
import asyncio
import base64
import time
import uuid
import binascii
import json
import librosa
from pathlib import Path
from typing import Any, Dict, Optional, Callable, Union

import requests

from open_storyline.nodes.core_nodes.base_node import BaseNode, NodeMeta
from open_storyline.nodes.node_schema import GenerateVoiceoverInput
from open_storyline.nodes.node_state import NodeState
from open_storyline.utils.logging import get_logger
from open_storyline.utils.pixelle_tts_adapter import PixelleTTSAdapter
from open_storyline.utils.parse_json import parse_json_dict
from open_storyline.utils.prompts import get_prompt
from open_storyline.utils.register import NODE_REGISTRY

logger = get_logger(__name__)


def _should_skip_voiceover_for_group(group: Any) -> bool:
    if not isinstance(group, dict):
        return False
    if group.get("skip_voiceover") is True:
        return True
    if group.get("voiceover_enabled") is False:
        return True
    return str(group.get("audio_source") or "").strip().lower() == "original_video_audio"


@NODE_REGISTRY.register()
class GenerateVoiceoverNode(BaseNode):
    meta = NodeMeta(
        name="generate_voiceover",
        description="Generate voice-over based on the script",
        node_id="generate_voiceover",
        node_kind="tts",
        require_prior_kind=["group_clips", "generate_script"],
        default_require_prior_kind=["group_clips", "generate_script"],
    )

    input_schema = GenerateVoiceoverInput

    # provider -> handler method name
    _PROVIDER_HANDLERS: Dict[str, str] = {
        "bytedance": "_tts_bytedance_sync",
        "bytedance_bigtts": "_tts_bytedance_bigtts_sync",
        "minimax": "_tts_minimax_sync",
        "runninghub": "_tts_runninghub_sync",
        "pixelle_runninghub": "_tts_runninghub_sync",
        "302": "_tts_302_sync",
        "pixelle_clone": "_tts_pixelle_clone_sync",
        "aliyun_cosyvoice": "_tts_aliyun_cosyvoice_sync",
        "aliyun_cosyvoice_clone": "_tts_aliyun_cosyvoice_clone_sync",
    }

    _DEFAULT_PROVIDER = "bytedance"
    _PREFERRED_PROVIDER = "aliyun_cosyvoice"
    _PROVIDER_REQUIRED_KEYS: Dict[str, tuple[str, ...]] = {
        "302": ("api_key",),
        "bytedance": ("uid", "appid", "access_token"),
        "bytedance_bigtts": ("appid", "access_key", "resource_id", "speaker"),
        "minimax": ("api_key",),
        "runninghub": ("api_key",),
        "pixelle_runninghub": ("api_key",),
        "pixelle_clone": ("base_url", "api_key", "ref_audio"),
        "aliyun_cosyvoice": ("api_key",),
        "aliyun_cosyvoice_clone": ("api_key",),
    }
    _PROVIDER_OPTIONAL_KEYS: Dict[str, tuple[str, ...]] = {
        "302": ("base_url",),
        "bytedance": ("base_url", "cluster"),
        "bytedance_bigtts": ("base_url", "uid", "label"),
        "minimax": ("base_url",),
        "runninghub": ("base_url", "voice", "workflow_id", "runninghub_tts_edge_workflow_id", "timeout_seconds", "speed"),
        "pixelle_runninghub": ("base_url", "voice", "workflow_id", "runninghub_tts_edge_workflow_id", "timeout_seconds", "speed"),
        "pixelle_clone": ("external_voice_id", "workflow_id", "runninghub_tts_clone_workflow_id", "timeout_seconds"),
        "aliyun_cosyvoice": ("ws_url", "model", "voice", "format", "sample_rate", "timeout_seconds", "speed"),
        "aliyun_cosyvoice_clone": ("customization_url", "ws_url", "model", "voice_id", "ref_audio_url", "ref_audio", "format", "sample_rate", "timeout_seconds", "speed"),
    }
    _PROVIDER_SUCCESS_CODES = {None, 0, 200, 3000, 20000000}

    MILLISECONDS_PER_SECOND = 1000.0
    _SAFE_MARGIN = 10
    _ORIGINAL_AUDIO_SOURCE = "original_video_audio"

    async def default_process(self, node_state: NodeState, inputs: Dict[str, Any]) -> Any:
        node_state.node_summary.info_for_user("Voiceover not generated")
        return {"voiceover": []}

    async def process(self, node_state: NodeState, inputs: Dict[str, Any], **params) -> Any:
        # 1) Get script
        group_scripts = (inputs.get("generate_script") or {}).get("group_scripts") or []
        if not isinstance(group_scripts, list) or not group_scripts:
            node_state.node_summary.info_for_user("No script found for voiceover generation (group_scripts is empty)")
            return {"voiceover": []}

        # 2) Provider selection
        default_provider = self._get_default_provider_name()
        provider_name = (inputs.get("provider") or "").strip()
        if not provider_name:
            node_state.node_summary.info_for_user("未找到可生成配音的tts提供商，使用默认")
            provider_name = default_provider

        handler = self._get_provider_handler(provider_name)
        node_state.node_summary.info_for_user(f"TTS 服务：{provider_name}")

        # 3) Prepare output directory
        artifact_id = node_state.artifact_id
        session_id = node_state.session_id
        if not artifact_id or not session_id:
            raise ValueError("缺失 artifact_id / session_id，无法生成配音输出目录")

        output_dir = self.server_cache_dir / str(session_id) / str(artifact_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        # 4) Deduce which key fields this provider needs from config, and get values from inputs
        #    If user/config keys are incomplete, fallback to 302 and use 302 key from environment variables
        try:
            provider_cfg = self._get_runtime_provider_cfg(provider_name, inputs)
            secrets = self._resolve_provider_secrets(provider_name, provider_cfg, inputs, node_state)
        except ValueError as e:
            if provider_name == default_provider or self._is_clone_provider(provider_name):
                raise
            node_state.node_summary.info_for_user(
                f"Key/config for provider={provider_name} is incomplete, automatically falling back to {default_provider}: {e}"
            )
            provider_name = default_provider
            handler = self._get_provider_handler(provider_name)
            provider_cfg = self._get_runtime_provider_cfg(provider_name, inputs)
            secrets = self._resolve_provider_secrets(provider_name, provider_cfg, inputs, node_state)
            node_state.node_summary.info_for_user(f"TTS service fallback to: {provider_name}")

        # 5) Generate parameter dict from provider parameter schema + user_request via LLM
        provider_param_schema = self._load_provider_param_schema(provider_name)
        user_request = inputs.get("user_request", "")
        await self._report_progress(
            node_state,
            0,
            max(len(group_scripts) + 1, 1),
            f"inferring TTS parameters for provider={provider_name}",
        )
        tts_params = await self._infer_tts_params_with_llm(
            node_state=node_state,
            provider_name=provider_name,
            user_request=user_request,
            provider_param_schema=provider_param_schema,
        )

        if tts_params:
            node_state.node_summary.info_for_user(f"TTS parameters (LLM parsed): {json.dumps(tts_params, ensure_ascii=False)}")
        else:
            node_state.node_summary.info_for_user("TTS parameters: No valid parameters parsed from user_request, using default/server default values")

        # 6) Generate segment by segment
        ts_ms = int(time.time() * 1000)
        voiceover: list[dict[str, Any]] = []
        skipped_voiceover: list[dict[str, Any]] = []

        for i, group in enumerate(group_scripts, start=1):
            await self._report_progress(
                node_state,
                i,
                len(group_scripts) + 1,
                f"generating voiceover {i}/{len(group_scripts)}",
            )
            group_id = (group or {}).get("group_id", "")
            raw_text = (group or {}).get("raw_text", "")

            if not group_id:
                raise ValueError(f"Missing group_id: {group}")
            if _should_skip_voiceover_for_group(group):
                skipped_voiceover.append(
                    {
                        "group_id": group_id,
                        "reason": "original_video_audio",
                        "audio_source": (group or {}).get("audio_source"),
                        "subtitle_source": (group or {}).get("subtitle_source"),
                    }
                )
                node_state.node_summary.info_for_user(
                    f"Skipped voiceover for {group_id}: original video audio is preserved"
                )
                continue
            if not isinstance(raw_text, str) or not raw_text.strip():
                raise ValueError(f"raw_text is empty for group_id={group_id}, cannot generate speech.")

            voiceover_id = f"voiceover_{i:04d}"
            wav_path = output_dir / f"{voiceover_id}_{ts_ms}.wav"

            used_provider = provider_name
            try:
                await asyncio.to_thread(
                    handler,
                    text=raw_text,
                    wav_path=wav_path,
                    secrets=secrets,
                    tts_params=tts_params,
                    provider_cfg=provider_cfg,
                )
            except Exception as exc:
                fallback_provider = str(inputs.get("fallback_provider") or "").strip()
                if not self._can_fallback_provider(
                    provider_name,
                    fallback_provider,
                    inputs,
                ):
                    raise
                node_state.node_summary.info_for_user(
                    f"TTS provider={provider_name} failed, falling back to {fallback_provider}: {exc}"
                )
                fallback_handler = self._get_provider_handler(fallback_provider)
                fallback_cfg = self._get_runtime_provider_cfg(
                    fallback_provider,
                    inputs,
                )
                fallback_secrets = self._resolve_provider_secrets(
                    fallback_provider,
                    fallback_cfg,
                    inputs,
                    node_state,
                )
                await asyncio.to_thread(
                    fallback_handler,
                    text=raw_text,
                    wav_path=wav_path,
                    secrets=fallback_secrets,
                    tts_params=tts_params,
                    provider_cfg=fallback_cfg,
                )
                used_provider = fallback_provider

            duration = self._wav_duration_ms(wav_path)
            voiceover.append(
                {
                    "voiceover_id": voiceover_id,
                    "group_id": group_id,
                    "path": str(wav_path),
                    "duration": duration,
                    "duration_ms": duration,
                    "provider": used_provider,
                    "clone": self._is_clone_provider(used_provider),
                }
            )

            node_state.node_summary.info_for_user(
                f"Successfully generated {voiceover_id}",
                preview_urls=[str(wav_path)],
            )


        await self._report_progress(
            node_state,
            len(group_scripts) + 1,
            len(group_scripts) + 1,
            f"generated {len(voiceover)} voiceover segment(s)",
        )
        node_state.node_summary.info_for_user(f"Generated {len(voiceover)} voiceover segments in total")
        return {"voiceover": voiceover, "skipped_voiceover": skipped_voiceover}

    # ---------------------------------------------------------------------
    # Provider dispatch / config helpers
    # ---------------------------------------------------------------------

    def _get_default_provider_name(self) -> str:
        if self._provider_config_complete(self._PREFERRED_PROVIDER):
            return self._PREFERRED_PROVIDER
        return self._DEFAULT_PROVIDER

    def _provider_config_complete(self, provider_name: str) -> bool:
        providers = getattr(self.server_cfg.generate_voiceover, "providers", None) or {}
        cfg = providers.get(provider_name)
        if not isinstance(cfg, dict):
            return False

        required_keys = self._PROVIDER_REQUIRED_KEYS.get(provider_name)
        if not required_keys:
            required_keys = tuple(
                str(key).strip()
                for key in cfg.keys()
                if str(key).strip() and str(key).strip().lower() not in {"base_url", "label", "name", "display_name"}
            )

        for key in required_keys:
            value = cfg.get(key)
            if provider_name == self._PREFERRED_PROVIDER and key == "uid":
                continue
            if value in (None, ""):
                return False
        return True

    def _get_provider_handler(self, provider_name: str) -> Callable[..., None]:
        if provider_name is None or provider_name == "":
            provider_name = self._get_default_provider_name()
        method_name = self._PROVIDER_HANDLERS.get(provider_name)
        if not method_name:
            raise ValueError(f"Unsupported TTS provider: {provider_name}, currently supported: {list(self._PROVIDER_HANDLERS.keys())}")
        handler = getattr(self, method_name, None)
        if not callable(handler):
            raise ValueError(f"Handler for provider={provider_name} not implemented: {method_name}")
        return handler

    def _get_provider_cfg(self, provider_name: str) -> Dict[str, Any]:
        providers = getattr(self.server_cfg.generate_voiceover, "providers", None) or {}
        cfg = providers.get(provider_name)
        if not isinstance(cfg, dict):
            raise ValueError(f"provider={provider_name} not configured in server_cfg.generate_voiceover.providers")
        return cfg

    def _get_runtime_provider_cfg(self, provider_name: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
        cfg: Dict[str, Any] = {}
        try:
            cfg.update(self._get_provider_cfg(provider_name))
        except ValueError:
            pass
        runtime_cfg = inputs.get(provider_name)
        if isinstance(runtime_cfg, dict):
            cfg.update(runtime_cfg)
        provider_keys = inputs.get("provider_keys")
        if isinstance(provider_keys, dict) and provider_name == str(inputs.get("provider") or "").strip():
            cfg.update(provider_keys)
        if not cfg:
            raise ValueError(f"provider={provider_name} not configured")
        return cfg

    def _is_clone_provider(self, provider_name: str) -> bool:
        return "clone" in str(provider_name or "").strip().lower()

    def _can_fallback_provider(
        self,
        provider_name: str,
        fallback_provider: str,
        inputs: Dict[str, Any],
    ) -> bool:
        if self._is_clone_provider(provider_name):
            return False
        if provider_name != "minimax":
            return False
        if fallback_provider not in {"runninghub", "pixelle_runninghub"}:
            return False
        if not isinstance(inputs.get(fallback_provider), dict):
            return False
        return True

    def _resolve_provider_secrets(self, provider_name: str, provider_cfg: Dict[str, Any], inputs: Dict[str, Any], node_state: NodeState) -> Dict[str, Any]:
        """
        - Each field uses inputs[field] first, otherwise falls back to cfg[field]
        - base_url can be omitted: default value will be provided based on provider
        """
        secrets: Dict[str, Any] = {}
        required_keys = list(self._PROVIDER_REQUIRED_KEYS.get(provider_name) or [])
        optional_keys = list(self._PROVIDER_OPTIONAL_KEYS.get(provider_name) or [])
        if not required_keys:
            required_keys = [
                str(key).strip()
                for key in provider_cfg.keys()
                if str(key).strip() and str(key).strip().lower() not in {"base_url", "label", "name", "display_name"}
            ]
        all_keys = list(dict.fromkeys(required_keys + optional_keys))
        provider_keys = inputs.get("provider_keys") or {}
        if not isinstance(provider_keys, dict):
            provider_keys = {}

        for key in all_keys:
            value = inputs.get(key)
            if value in (None, ""):
                value = provider_keys.get(key)

            if value in (None, ""):
                value = provider_cfg.get(key)

            if (value in (None, "")) and key == "base_url":
                value = self._default_base_url(provider_name)

            if (value in (None, "")) and provider_name == self._PREFERRED_PROVIDER and key == "uid":
                value = node_state.session_id

            if value in (None, ""):
                env_v = self._resolve_env_secret(provider_name, key)
                if env_v not in (None, ""):
                    value = env_v

            if value in (None, "") and key in required_keys:
                node_state.node_summary.info_for_llm("The user has not entered the voice-over service API key, please remind the user to enter the TTS API key in the sidebar of the webpage.")
                raise ValueError(
                    f"provider={provider_name} missing required field: {key}. "
                    f"Please configure in sidebar or config.toml."
                )

            if value not in (None, ""):
                secrets[key] = value

        return secrets

    def _default_base_url(self, provider_name: str) -> str:
        if provider_name == "bytedance":
            return "https://openspeech.bytedance.com"
        if provider_name == "bytedance_bigtts":
            return "https://openspeech.bytedance.com"
        if provider_name == "minimax":
            return "https://api.minimax.io"
        if provider_name in {"runninghub", "pixelle_runninghub", "pixelle_clone"}:
            return "https://www.runninghub.cn"
        if provider_name == "302":
            return "https://api.302.ai"
        if provider_name in {"aliyun_cosyvoice", "aliyun_cosyvoice_clone"}:
            return "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
        return ""

    # ---------------------------------------------------------------------
    # LLM param inference
    # ---------------------------------------------------------------------
    def _load_provider_param_schema(self, provider_name: str) -> Dict[str, Any]:

        path = self.server_cfg.generate_voiceover.tts_provider_params_path
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(
                f"Failed to load TTS provider param schema from {path}: {type(e).__name__}: {e}"
            )
            return {}

        providers = (data or {}).get("providers") or {}
        if not isinstance(providers, dict):
            logger.warning(f"Invalid TTS provider schema format in {path}: 'providers' should be a dict")
            return {}
        schema = providers.get(provider_name) or {}
        if not isinstance(schema, dict):
            logger.warning(
                f"Invalid TTS param schema for provider={provider_name} in {path}: expected dict, got {type(schema).__name__}"
            )
            return {}
        return schema

    async def _infer_tts_params_with_llm(
        self,
        node_state: NodeState,
        provider_name: str,
        user_request: Any,
        provider_param_schema: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Pass user_request + provider parameter definition to LLM, let it return JSON dict.
        """
        if not provider_param_schema:
            return {}

        system_prompt = get_prompt("generate_voiceover.system", lang=node_state.lang)

        schema_text = json.dumps(provider_param_schema, ensure_ascii=False, indent=2)

        user_prompt = get_prompt("generate_voiceover.user", lang=node_state.lang, provider_name=provider_name, user_request=str(user_request), schema_text=schema_text)
        raw = await node_state.llm.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            top_p=0.9,
            max_tokens=4096,
            model_preferences=None,
            metadata=self._model_sampling_metadata("llm", minimum_seconds=180.0),
        )
        if not raw:
            return {}

        try:
            parsed = parse_json_dict(raw)
        except Exception:
            return {}
        if not isinstance(parsed, dict):
            return {}

        try:
            return self._sanitize_params_by_schema(parsed, provider_param_schema)
        except Exception:
            return {}

    # ---------------------------------------------------------------------
    # validation helpers
    # ---------------------------------------------------------------------

    def _resolve_302_env_secret(self, key: str) -> Optional[str]:
        """
        Read 302 key/config from environment variables
        """
        key = str(key).strip()
        if not key:
            return None

        key_upper = key.upper()
        prefixe = ("TTS_302_")

        return os.getenv(f"{prefixe}{key_upper}")

    def _resolve_minimax_env_secret(self, key: str) -> Optional[str]:
        """
        从环境变量读取 minimax 的密钥/配置
        """
        key = str(key).strip()
        if not key:
            return None

        key_upper = key.upper()
        prefixe = ("TTS_MINIMAX_")

        return os.getenv(f"{prefixe}{key_upper}")

    def _resolve_env_secret(self, provider_name: str, key: str) -> Optional[str]:
        if provider_name == "302":
            return self._resolve_302_env_secret(key)
        if provider_name == "minimax":
            return self._resolve_minimax_env_secret(key)
        if provider_name in {"runninghub", "pixelle_runninghub"}:
            return (
                os.getenv(f"TTS_RUNNINGHUB_{str(key).strip().upper()}")
                or os.getenv(f"RUNNINGHUB_{str(key).strip().upper()}")
            )
        if provider_name == "pixelle_clone":
            return (
                os.getenv(f"TTS_PIXELLE_CLONE_{str(key).strip().upper()}")
                or (
                    os.getenv(f"TTS_RUNNINGHUB_{str(key).strip().upper()}")
                    if str(key).strip().lower() in {"base_url", "api_key"}
                    else None
                )
                or (
                    os.getenv(f"RUNNINGHUB_TTS_CLONE_WORKFLOW_ID")
                    if str(key).strip().lower() in {"workflow_id", "runninghub_tts_clone_workflow_id"}
                    else None
                )
                or (
                    os.getenv(f"RUNNINGHUB_{str(key).strip().upper()}")
                    if str(key).strip().lower() in {"base_url", "api_key"}
                    else None
                )
            )
        if provider_name in {"aliyun_cosyvoice", "aliyun_cosyvoice_clone"}:
            key_upper = str(key).strip().upper()
            prefix = (
                "ALIYUN_COSYVOICE_CLONE_"
                if provider_name == "aliyun_cosyvoice_clone"
                else "ALIYUN_COSYVOICE_TTS_"
            )
            return (
                os.getenv(f"{prefix}{key_upper}")
                or os.getenv(f"ALIYUN_COSYVOICE_{key_upper}")
                or (os.getenv("DASHSCOPE_API_KEY") if key_upper == "API_KEY" else None)
            )
        return None

    def _sanitize_params_by_schema(self, params: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
        """
        - Only keep fields that exist in schema
        - Type coercion
        - value validation (string enum / numeric range / discrete numeric enum)
        """
        out: Dict[str, Any] = {}

        for key, val in params.items():
            if key not in schema:
                continue

            rule = schema.get(key) or {}
            if not isinstance(rule, dict):
                continue

            typ = (rule.get("type") or "").lower().strip()
            normalized = self._normalize_value(val, typ)
            if normalized is None:
                continue

            # 1) Continuous: range: [min, max]
            value_range = rule.get("range")
            if (
                typ in ("int", "float")
                and isinstance(value_range, list)
                and len(value_range) == 2
                and all(isinstance(x, (int, float)) for x in value_range)
            ):
                range_min, range_max = float(value_range[0]), float(value_range[1])
                value = float(normalized)

                if value < range_min:
                    value = range_min
                elif value > range_max:
                    value = range_max

                normalized = int(value) if typ == "int" else float(round(value, 1))

            # Backward compatibility:
            # for legacy schema where numeric range was encoded as enum=[min,max]
            elif (
                typ in ("int", "float")
                and "enum" in rule
                and isinstance(rule.get("enum"), list)
                and len(rule["enum"]) == 2
                and all(isinstance(x, (int, float)) for x in rule["enum"])
            ):
                range_min, range_max = float(rule["enum"][0]), float(rule["enum"][1])
                value = float(normalized)

                if value < range_min:
                    value = range_min
                elif value > range_max:
                    value = range_max

                normalized = int(value) if typ == "int" else float(round(value, 1))

            # 2) Discrete: enum: [...]
            elif "enum" in rule:
                enum = rule.get("enum")
                if isinstance(enum, list) and enum:
                    if normalized not in enum:
                        normalized = enum[0]
                else:
                    continue

            # 3) Invalid range definition for numeric fields: drop this field
            elif "range" in rule and typ in ("int", "float"):
                continue

            # 4) No range/enum: keep normalized as-is (type-coerced only)
            out[key] = normalized

        return out

    def _normalize_value(self, val: Any, typ: str) -> Any:
        if val is None:
            return None

        try:
            if typ in ("str", "string"):
                return str(val)

            if typ in ("int", "integer"):
                if isinstance(val, bool):
                    return int(val)
                if isinstance(val, (int, float)):
                    return int(val)
                if isinstance(val, str):
                    val = val.strip()
                    if not val:
                        return None
                    return int(float(val))
                return int(val)

            if typ in ("float",):
                if isinstance(val, bool):
                    return float(int(val))
                if isinstance(val, (int, float)):
                    return float(val)
                if isinstance(val, str):
                    val = val.strip()
                    if not val:
                        return None
                    return float(val)
                return float(val)

            if typ in ("bool", "boolean"):
                if isinstance(val, bool):
                    return val
                if isinstance(val, (int, float)):
                    return bool(val)
                if isinstance(val, str):
                    lowered = val.strip().lower()
                    if lowered in {"true", "1", "yes", "y", "on"}:
                        return True
                    if lowered in {"false", "0", "no", "n", "off"}:
                        return False
                    return None
                return bool(val)
        except (TypeError, ValueError):
            return None

        return val

    def _wav_duration_ms(self, wav_path: Union[str, Path]) -> int:
        p = str(wav_path)

        duration_s = librosa.get_duration(path=p)
        return int(round(duration_s * self.MILLISECONDS_PER_SECOND))

    # ---------------------------------------------------------------------
    # Provider implementations (each provider has its own dedicated method)
    # ---------------------------------------------------------------------

    def _preview_b64(self, b64: str, keep: int = 80) -> str:
        if not isinstance(b64, str):
            return f"<non-str data type={type(b64).__name__}>"
        if len(b64) <= keep * 2:
            return b64
        return f"{b64[:keep]}...<len={len(b64)}>...{b64[-keep:]}"

    def _tts_bytedance_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:

        base_url = secrets.get("base_url") or "https://openspeech.bytedance.com"
        api_url = base_url.rstrip("/") + "/api/v1/tts" if not base_url.endswith("/api/v1/tts") else base_url

        access_token = secrets.get("access_token")
        appid = secrets.get("appid")
        uid = secrets.get("uid")
        cluster = secrets.get("cluster") or "volcano_tts"

        headers = {"Authorization": f"Bearer; {access_token}"}

        audio_cfg = {
            "voice_type": tts_params.get("voice_type", "BV001_streaming"),
            "encoding": tts_params.get("encoding", "wav"),
            "rate": int(tts_params.get("rate", 24000)) if "rate" in tts_params else 24000,
            "speed_ratio": float(tts_params.get("speed_ratio", 1.0)),
            "volume_ratio": float(tts_params.get("volume_ratio", 1.0)),
            "pitch_ratio": float(tts_params.get("pitch_ratio", 1.0)),
        }
        # 可选字段
        for k in ("emotion", "language"):
            if k in tts_params:
                audio_cfg[k] = tts_params[k]

        request_cfg = {
            "reqid": str(uuid.uuid4()),
            "text": text,
            "text_type": tts_params.get("text_type", "plain"),
            "operation": "query",
        }

        body = {
            "app": {"appid": appid, "token": access_token, "cluster": cluster},
            "user": {"uid": uid},
            "audio": audio_cfg,
            "request": request_cfg,
        }

        resp = requests.post(api_url, headers=headers, json=body, timeout=60)
        try:
            resp_json = resp.json()
        except Exception:
            resp_json = None

        if not resp.ok:
            if isinstance(resp_json, dict):
                raise RuntimeError(
                    f"bytedance tts failed: http={resp.status_code}, "
                    f"code={resp_json.get('code')}, "
                    f"message={resp_json.get('message')}, "
                    f"resp={resp_json}"
                )
            raise RuntimeError(
                f"bytedance tts failed: http={resp.status_code}, resp={resp.text}"
            )

        if isinstance(resp_json, dict):
            code = resp_json.get("code")
            message = resp_json.get("message")
            resp_preview = dict(resp_json)
            b64 = resp_json.get("data")
            if isinstance(b64, str) and len(b64) > 200:
                resp_preview["data"] = self._preview_b64(b64)
            if code not in (3000, 0, None):
                raise RuntimeError(f"bytedance tts failed: code={code}, message={message}, resp={resp_preview}")
            if message not in (None, "Success") and code is None:
                raise RuntimeError(f"bytedance tts failed: message={message}, resp={resp_json}")

            b64 = resp_json.get("data")
            if not b64:
                raise RuntimeError(f"bytedance tts failed: no data in resp={resp_json}")

            audio_bytes = base64.b64decode(b64)
            wav_path.write_bytes(audio_bytes)
            return

        raise RuntimeError(f"bytedance tts failed: invalid resp: {resp.text}")

    def _extract_first_value(self, payload: Any, candidate_keys: tuple[str, ...]) -> Any:
        target_keys = {str(key).strip().lower() for key in candidate_keys if str(key).strip()}
        if not target_keys:
            return None

        if isinstance(payload, dict):
            for key, value in payload.items():
                if str(key).strip().lower() in target_keys and value not in (None, "", [], {}):
                    return value
            for value in payload.values():
                found = self._extract_first_value(value, candidate_keys)
                if found not in (None, "", [], {}):
                    return found
        elif isinstance(payload, list):
            for item in payload:
                found = self._extract_first_value(item, candidate_keys)
                if found not in (None, "", [], {}):
                    return found
        return None

    def _safe_json(self, resp: requests.Response) -> Any:
        try:
            return resp.json()
        except Exception:
            return None

    def _normalize_task_status(self, value: Any) -> Optional[int]:
        if value in (None, ""):
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            lowered = value.strip().lower()
            if not lowered:
                return None
            if lowered in {"success", "succeeded", "done", "completed"}:
                return 2
            if lowered in {"failed", "error"}:
                return 3
            try:
                return int(float(lowered))
            except ValueError:
                return None
        return None

    def _format_bytedance_bigtts_error(
        self,
        stage: str,
        *,
        http_status: int,
        resp_json: Any,
        task_status: Any = None,
        fallback_text: Optional[str] = None,
    ) -> str:
        code = self._extract_first_value(resp_json, ("code", "status_code"))
        message = self._extract_first_value(resp_json, ("message", "msg", "error", "error_msg", "status_msg"))
        return (
            f"bytedance_bigtts {stage} failed: http={http_status}, "
            f"code={code}, task_status={task_status}, message={message}, "
            f"resp={resp_json if resp_json is not None else fallback_text}"
        )

    def _tts_bytedance_bigtts_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        base_url = secrets.get("base_url") or "https://openspeech.bytedance.com"
        submit_url = base_url.rstrip("/") + "/api/v3/tts/submit" if not base_url.endswith("/api/v3/tts/submit") else base_url
        query_url = base_url.rstrip("/") + "/api/v3/tts/query"

        appid = str(secrets.get("appid") or "").strip()
        access_key = str(secrets.get("access_key") or "").strip()
        resource_id = str(secrets.get("resource_id") or "").strip()
        speaker = str(tts_params.get("speaker") or secrets.get("speaker") or provider_cfg.get("speaker") or "").strip()
        uid = str(secrets.get("uid") or provider_cfg.get("uid") or "openstoryline").strip() or "openstoryline"
        req_id = str(tts_params.get("reqId") or tts_params.get("req_id") or f"{int(time.time() * 1000)}{uuid.uuid4().int % 1000000:06d}")

        audio_params: Dict[str, Any] = {
            "format": tts_params.get("format", "wav"),
            "sample_rate": int(tts_params.get("sample_rate", 24000)),
            "speech_rate": float(tts_params.get("speech_rate", 1.0)),
            "loudness_rate": float(tts_params.get("loudness_rate", 1.0)),
            "enable_timestamp": bool(tts_params.get("enable_timestamp", False)),
        }
        for key in ("emotion", "emotion_scale"):
            if key in tts_params:
                audio_params[key] = tts_params[key]

        submit_headers = {
            "Content-Type": "application/json",
            "X-Api-App-Id": appid,
            "X-Api-Access-Key": access_key,
            "X-Api-Resource-Id": resource_id,
            "X-Api-Request-Id": str(uuid.uuid4()),
        }
        submit_body = {
            "user": {"uid": uid},
            "reqId": req_id,
            "unique_id": tts_params.get("unique_id") or wav_path.stem,
            "req_params": {
                "text": text,
                "speaker": speaker,
                "audio_params": audio_params,
            },
        }

        submit_resp = requests.post(submit_url, headers=submit_headers, json=submit_body, timeout=120)
        submit_json = self._safe_json(submit_resp)
        submit_code = self._extract_first_value(submit_json, ("code", "status_code"))
        task_id = self._extract_first_value(submit_json, ("task_id", "taskid"))
        if not submit_resp.ok or (submit_code not in self._PROVIDER_SUCCESS_CODES and not task_id):
            raise RuntimeError(
                self._format_bytedance_bigtts_error(
                    "submit",
                    http_status=submit_resp.status_code,
                    resp_json=submit_json,
                    fallback_text=submit_resp.text,
                )
            )
        if not task_id:
            raise RuntimeError(
                self._format_bytedance_bigtts_error(
                    "submit",
                    http_status=submit_resp.status_code,
                    resp_json=submit_json,
                    fallback_text="missing task_id",
                )
            )

        poll_timeout_s = float(tts_params.get("poll_timeout_s", 180))
        poll_interval_s = float(tts_params.get("poll_interval_s", 2))
        deadline = time.time() + max(poll_timeout_s, 10.0)
        last_query_json: Any = None

        while time.time() < deadline:
            query_headers = dict(submit_headers)
            query_headers["X-Api-Request-Id"] = str(uuid.uuid4())
            query_resp = requests.post(query_url, headers=query_headers, json={"task_id": task_id}, timeout=60)
            query_json = self._safe_json(query_resp)
            last_query_json = query_json
            query_code = self._extract_first_value(query_json, ("code", "status_code"))
            task_status = self._normalize_task_status(self._extract_first_value(query_json, ("task_status", "taskstatus", "status")))

            if not query_resp.ok or (query_code not in self._PROVIDER_SUCCESS_CODES and task_status != 2):
                raise RuntimeError(
                    self._format_bytedance_bigtts_error(
                        "query",
                        http_status=query_resp.status_code,
                        resp_json=query_json,
                        task_status=task_status,
                        fallback_text=query_resp.text,
                    )
                )

            if task_status == 2:
                audio_url = self._extract_first_value(query_json, ("audio_url", "audiourl", "url"))
                if not audio_url:
                    raise RuntimeError(
                        self._format_bytedance_bigtts_error(
                            "query",
                            http_status=query_resp.status_code,
                            resp_json=query_json,
                            task_status=task_status,
                            fallback_text="missing audio_url",
                        )
                    )
                audio_resp = requests.get(str(audio_url), timeout=120)
                if not audio_resp.ok:
                    raise RuntimeError(f"bytedance_bigtts download failed: http={audio_resp.status_code}, url={audio_url}, resp={audio_resp.text}")
                wav_path.write_bytes(audio_resp.content)
                return

            if task_status == 3:
                raise RuntimeError(
                    self._format_bytedance_bigtts_error(
                        "query",
                        http_status=query_resp.status_code,
                        resp_json=query_json,
                        task_status=task_status,
                        fallback_text="task failed",
                    )
                )

            time.sleep(max(poll_interval_s, 0.5))

        raise RuntimeError(
            f"bytedance_bigtts query timed out after {poll_timeout_s:.1f}s, "
            f"task_id={task_id}, last_resp={last_query_json}"
        )

    def _tts_minimax_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:

        base_url = secrets.get("base_url") or "https://api.minimax.io"
        api_url = base_url.rstrip("/") + "/v1/t2a_v2" if not base_url.endswith("/v1/t2a_v2") else base_url

        api_key = secrets.get("api_key") or secrets.get("token") or secrets.get("access_token")
        if not api_key:
            for k, v in secrets.items():
                if k != "base_url" and isinstance(v, str) and v.strip():
                    api_key = v.strip()
                    break
        if not api_key:
            raise ValueError("minimax missing api_key/token/access_token")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        body = {
            "model": tts_params.get("model", "speech-2.8-hd"),
            "text": text,
            "stream": False,
            "language_boost": tts_params.get("language_boost", "auto"),
            "output_format": tts_params.get("output_format", "hex"),
            "voice_setting": {
                "voice_id": tts_params.get("voice_id", "English_expressive_narrator"),
                "speed": float(tts_params.get("speed", 1.0)),
                "vol": float(tts_params.get("vol", 1.0)),
                "pitch": int(tts_params.get("pitch", 0)),
            },
            "audio_setting": {
                "sample_rate": int(tts_params.get("sample_rate", 24000)),
                "bitrate": int(tts_params.get("bitrate", 128000)),
                "format": tts_params.get("format", "wav"),
            },
        }

        resp = requests.post(api_url, headers=headers, json=body, timeout=120)
        resp.raise_for_status()

        resp_json = resp.json()
        base_resp = (resp_json or {}).get("base_resp") or {}
        if base_resp.get("status_code") not in (0, None):
            raise RuntimeError(f"minimax tts failed: {resp_json}")

        data = (resp_json or {}).get("data") or {}
        audio_field = data.get("audio")
        if not audio_field:
            raise RuntimeError(f"minimax tts failed: no data.audio: {resp_json}")

        # output_format = hex or url
        if isinstance(audio_field, str) and audio_field.startswith("http"):
            audio_resp = requests.get(audio_field, timeout=120)
            audio_resp.raise_for_status()
            audio_bytes = audio_resp.content
            wav_path.write_bytes(audio_bytes)
            return

        try:
            audio_bytes = binascii.unhexlify(audio_field)
        except Exception as e:
            raise RuntimeError(f"minimax hex decode failed: {e}, audio_field[:64]={str(audio_field)[:64]}")

        wav_path.write_bytes(audio_bytes)

    def _tts_302_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        base_url = (secrets.get("base_url") or "https://api.302.ai").rstrip("/")
        api_url = base_url + "/302/audio/speech"

        api_key = secrets.get("api_key") or secrets.get("token") or secrets.get("access_token")
        if not api_key:
            for k, v in secrets.items():
                if k != "base_url" and isinstance(v, str) and v.strip():
                    api_key = v.strip()
                    break
        if not api_key:
            raise ValueError("302 missing api_key/token/access_token")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "audio/wav",
            "Content-Type": "application/json",
        }

        body = {
            "model": tts_params.get("model", "speech-02-hd"),
            "input": text,
            "voice": tts_params.get("voice", "alloy"),
            "emotion": tts_params.get("emotion", "neutral"),
            "response_format": tts_params.get("response_format", "wav"),
        }

        resp = requests.post(api_url, headers=headers, json=body, timeout=120)
        if not resp.ok:
            raise RuntimeError(f"302 tts http {resp.status_code}: {resp.text}")
        wav_path.write_bytes(resp.content)

    def _tts_runninghub_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        base_url = str(secrets.get("base_url") or "https://www.runninghub.cn").strip().rstrip("/")
        api_key = str(secrets.get("api_key") or "").strip()
        if not api_key:
            raise ValueError("runninghub missing api_key")

        workflow_id = (
            tts_params.get("workflow_id")
            or tts_params.get("runninghub_tts_edge_workflow_id")
            or secrets.get("workflow_id")
            or secrets.get("runninghub_tts_edge_workflow_id")
            or provider_cfg.get("workflow_id")
            or provider_cfg.get("runninghub_tts_edge_workflow_id")
        )
        fallback_cfg: Dict[str, Any] = {
            "enabled": True,
            "try_edge_tts": False,
            "fallback_to_runninghub": True,
            "runninghub_api_key": api_key,
            "runninghub_base_url": base_url,
            "voice": (
                tts_params.get("voice")
                or tts_params.get("voice_id")
                or secrets.get("voice")
                or secrets.get("voice_id")
                or provider_cfg.get("voice")
                or provider_cfg.get("voice_id")
                or "zh-CN-YunjianNeural"
            ),
            "speed": tts_params.get("speed", provider_cfg.get("speed", 1.2)),
            "timeout_seconds": (
                tts_params.get("timeout_seconds")
                or secrets.get("timeout_seconds")
                or provider_cfg.get("timeout_seconds")
                or 300
            ),
        }
        if workflow_id:
            fallback_cfg["runninghub_tts_edge_workflow_id"] = str(workflow_id)

        adapter = PixelleTTSAdapter(fallback_cfg=fallback_cfg, clone_cfg={})
        asyncio.run(adapter.synthesize_runninghub_fallback(text=text, output_path=wav_path))

    def _tts_pixelle_clone_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        ref_audio = str(secrets.get("ref_audio") or "").strip()
        if not ref_audio:
            raise ValueError("pixelle_clone requires ref_audio")

        base_url = str(secrets.get("base_url") or "").strip().rstrip("/")
        api_key = str(secrets.get("api_key") or "").strip()
        if not base_url:
            raise ValueError("pixelle_clone missing base_url")
        if not api_key:
            raise ValueError("pixelle_clone missing api_key")

        workflow_id = (
            tts_params.get("workflow_id")
            or tts_params.get("runninghub_tts_clone_workflow_id")
            or secrets.get("workflow_id")
            or secrets.get("runninghub_tts_clone_workflow_id")
            or provider_cfg.get("workflow_id")
            or provider_cfg.get("runninghub_tts_clone_workflow_id")
            or "1983718528991862786"
        )
        timeout_seconds = (
            tts_params.get("timeout_seconds")
            or secrets.get("timeout_seconds")
            or provider_cfg.get("timeout_seconds")
            or 300
        )
        adapter = PixelleTTSAdapter(
            fallback_cfg={},
            clone_cfg={
                "runninghub_api_key": api_key,
                "runninghub_base_url": base_url,
                "runninghub_tts_clone_workflow_id": str(workflow_id),
                "timeout_seconds": timeout_seconds,
            },
        )
        asyncio.run(
            adapter.synthesize_clone(
                text=text,
                ref_audio=ref_audio,
                output_path=wav_path,
            )
        )

    def _tts_aliyun_cosyvoice_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        api_key = str(secrets.get("api_key") or "").strip()
        if not api_key:
            raise ValueError("aliyun_cosyvoice missing api_key")
        self._dashscope_cosyvoice_tts(
            text=text,
            wav_path=wav_path,
            api_key=api_key,
            ws_url=str(
                secrets.get("ws_url")
                or provider_cfg.get("ws_url")
                or "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
            ),
            model=str(
                tts_params.get("model")
                or secrets.get("model")
                or provider_cfg.get("model")
                or "cosyvoice-v3-flash"
            ),
            voice=str(
                tts_params.get("voice")
                or secrets.get("voice")
                or provider_cfg.get("voice")
                or "longanyang"
            ),
            sample_rate=int(
                tts_params.get("sample_rate")
                or secrets.get("sample_rate")
                or provider_cfg.get("sample_rate")
                or 24000
            ),
            audio_format=str(
                tts_params.get("format")
                or secrets.get("format")
                or provider_cfg.get("format")
                or "wav"
            ),
            timeout_seconds=float(
                tts_params.get("timeout_seconds")
                or secrets.get("timeout_seconds")
                or provider_cfg.get("timeout_seconds")
                or 120
            ),
        )

    def _tts_aliyun_cosyvoice_clone_sync(
        self,
        *,
        text: str,
        wav_path: Path,
        secrets: Dict[str, Any],
        tts_params: Dict[str, Any],
        provider_cfg: Dict[str, Any],
    ) -> None:
        api_key = str(secrets.get("api_key") or "").strip()
        if not api_key:
            raise ValueError("aliyun_cosyvoice_clone missing api_key")
        model = str(
            tts_params.get("model")
            or secrets.get("model")
            or provider_cfg.get("model")
            or "cosyvoice-v3.5-plus"
        )
        voice_id = str(
            tts_params.get("voice_id")
            or secrets.get("voice_id")
            or provider_cfg.get("voice_id")
            or secrets.get("external_voice_id")
            or provider_cfg.get("external_voice_id")
            or ""
        ).strip()
        if not voice_id:
            ref_audio_url = str(
                secrets.get("ref_audio_url") or provider_cfg.get("ref_audio_url") or ""
            ).strip()
            if not ref_audio_url:
                raise ValueError("aliyun_cosyvoice_clone requires voice_id or ref_audio_url")
            voice_id = self._create_aliyun_cosyvoice_voice_id(
                api_key=api_key,
                customization_url=str(
                    secrets.get("customization_url")
                    or provider_cfg.get("customization_url")
                    or "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
                ),
                model=model,
                ref_audio_url=ref_audio_url,
            )
        self._dashscope_cosyvoice_tts(
            text=text,
            wav_path=wav_path,
            api_key=api_key,
            ws_url=str(
                secrets.get("ws_url")
                or provider_cfg.get("ws_url")
                or "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
            ),
            model=model,
            voice=voice_id,
            sample_rate=int(
                tts_params.get("sample_rate")
                or secrets.get("sample_rate")
                or provider_cfg.get("sample_rate")
                or 24000
            ),
            audio_format=str(
                tts_params.get("format")
                or secrets.get("format")
                or provider_cfg.get("format")
                or "wav"
            ),
            timeout_seconds=float(
                tts_params.get("timeout_seconds")
                or secrets.get("timeout_seconds")
                or provider_cfg.get("timeout_seconds")
                or 120
            ),
        )

    def _create_aliyun_cosyvoice_voice_id(
        self,
        *,
        api_key: str,
        customization_url: str,
        model: str,
        ref_audio_url: str,
    ) -> str:
        resp = requests.post(
            customization_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "voice-enrollment",
                "input": {
                    "action": "create_voice",
                    "target_model": model,
                    "prefix": "jingjing",
                    "url": ref_audio_url,
                },
            },
            timeout=120,
        )
        if not resp.ok:
            raise RuntimeError(f"aliyun_cosyvoice_clone customization http {resp.status_code}: {resp.text}")
        resp_json = self._safe_json(resp)
        voice_id = self._extract_first_value(
            resp_json,
            ("voice_id", "voiceId", "custom_voice_id", "customVoiceId"),
        )
        if not voice_id:
            raise RuntimeError(f"aliyun_cosyvoice_clone customization returned no voice_id: {resp_json}")
        return str(voice_id).strip()

    def _dashscope_cosyvoice_tts(
        self,
        *,
        text: str,
        wav_path: Path,
        api_key: str,
        ws_url: str,
        model: str,
        voice: str,
        sample_rate: int,
        audio_format: str,
        timeout_seconds: float,
    ) -> None:
        try:
            import dashscope
            from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer
        except Exception:
            AudioFormat = None
            dashscope = None
            SpeechSynthesizer = None

        if SpeechSynthesizer is not None:
            dashscope.api_key = api_key
            dashscope.base_websocket_api_url = ws_url
            kwargs = {
                "model": model,
                "voice": voice,
            }
            audio_format_value = self._dashscope_audio_format(audio_format, AudioFormat)
            if audio_format_value is not None:
                kwargs["format"] = audio_format_value
            try:
                synthesizer = SpeechSynthesizer(**kwargs)
            except TypeError:
                kwargs.pop("format", None)
                synthesizer = SpeechSynthesizer(**kwargs)
            audio = synthesizer.call(text)
            if not audio:
                raise RuntimeError("aliyun_cosyvoice tts returned no audio bytes")
            wav_path.write_bytes(audio)
            return

        try:
            import websocket
        except Exception as exc:
            raise RuntimeError("dashscope or websocket-client is required for aliyun_cosyvoice") from exc

        task_id = str(uuid.uuid4())
        audio_chunks: list[bytes] = []
        ws = websocket.create_connection(
            ws_url,
            timeout=timeout_seconds,
            header=[
                f"Authorization: Bearer {api_key}",
                "X-DashScope-DataInspection: enable",
            ],
        )
        try:
            for payload in (
                {
                    "header": {
                        "action": "run-task",
                        "task_id": task_id,
                        "streaming": "duplex",
                    },
                    "payload": {
                        "task_group": "audio",
                        "task": "tts",
                        "function": "SpeechSynthesizer",
                        "model": model,
                        "parameters": {
                            "text_type": "PlainText",
                            "voice": voice,
                            "format": audio_format,
                            "sample_rate": sample_rate,
                        },
                        "input": {},
                    },
                },
                {
                    "header": {
                        "action": "continue-task",
                        "task_id": task_id,
                        "streaming": "duplex",
                    },
                    "payload": {"input": {"text": text}},
                },
                {
                    "header": {
                        "action": "finish-task",
                        "task_id": task_id,
                        "streaming": "duplex",
                    },
                    "payload": {"input": {}},
                },
            ):
                ws.send(json.dumps(payload, ensure_ascii=False))
                deadline = time.monotonic() + timeout_seconds
                while time.monotonic() < deadline:
                    message = ws.recv()
                    if isinstance(message, bytes):
                        audio_chunks.append(message)
                        continue
                    if not message:
                        continue
                    event = json.loads(message)
                    event_name = str((event.get("header") or {}).get("event") or "").lower()
                    if event_name in {"task-started", "result-generated", "task-finished"}:
                        audio = self._extract_first_value(
                            event,
                            ("audio", "data", "audio_data", "audioData"),
                        )
                        if isinstance(audio, str) and audio:
                            try:
                                audio_chunks.append(base64.b64decode(audio))
                            except Exception:
                                pass
                    if event_name == "task-started" and payload["header"]["action"] == "run-task":
                        break
                    if event_name == "result-generated" and payload["header"]["action"] == "continue-task":
                        break
                    if event_name == "task-finished" and payload["header"]["action"] == "finish-task":
                        break
                    if event_name == "task-failed":
                        raise RuntimeError(f"aliyun_cosyvoice tts failed: {event}")
                else:
                    raise RuntimeError("aliyun_cosyvoice websocket timed out")
        finally:
            ws.close()

        if not audio_chunks:
            raise RuntimeError("aliyun_cosyvoice websocket returned no audio")
        wav_path.write_bytes(b"".join(audio_chunks))

    def _dashscope_audio_format(self, audio_format: str, audio_format_cls: Any) -> Any:
        if audio_format_cls is None:
            return None
        normalized = str(audio_format or "").strip().lower()
        if not normalized:
            return None
        format_members = {
            name.lower(): value
            for name, value in getattr(audio_format_cls, "__members__", {}).items()
        }
        if normalized in format_members:
            return format_members[normalized]
        aliases = {
            "wav": ("wav_22050hz_mono_16bits", "wav"),
            "wave": ("wav_22050hz_mono_16bits", "wav"),
            "mp3": ("mp3_22050hz_mono_128kbps", "mp3"),
            "pcm": ("pcm_22050hz_mono_16bits", "pcm"),
        }
        for member_name in aliases.get(normalized, ()):
            if member_name in format_members:
                return format_members[member_name]
        return None
