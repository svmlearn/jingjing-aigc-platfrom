from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import VideoJob


ALLOWED_DESIRED_OUTPUTS = frozenset({"final_video", "cover", "subtitles"})
ALLOWED_VOICEOVER_PROVIDERS = frozenset({"bytedance_bigtts", "minimax", "302", "pixelle_clone"})
ALLOWED_VOICEOVER_MODES = frozenset({"system", "voice_profile"})
ALLOWED_SUBTITLE_STYLES = frozenset({"platform_default", "bold_caption"})
ALLOWED_TALKING_HEAD_SUBTITLE_SOURCES = frozenset(
    {"script", "script_audio_alignment", "asr_original_audio"}
)
ALLOWED_LIP_SYNC_PROVIDERS = frozenset({"aliyun_videoretalk"})
ALLOWED_BGM_FILTER_KEYS = frozenset({"mood", "scene", "genre", "lang", "id"})


class DirectiveValidationError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        failure_code: str,
        failure_status: str = "failed_manual",
    ) -> None:
        super().__init__(message)
        self.failure_code = failure_code
        self.failure_status = failure_status


@dataclass(frozen=True)
class ProductionDirective:
    job_id: str
    execution_mode: str
    script_text: str
    script_locked: bool
    target_platform: str
    aspect_ratio: str
    desired_outputs: tuple[str, ...]
    locked_fields: tuple[str, ...]
    source: str
    material_context: dict[str, Any]
    production_config: dict[str, Any]

    def to_payload(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "execution_mode": self.execution_mode,
            "script_text": self.script_text,
            "script_locked": self.script_locked,
            "target_platform": self.target_platform,
            "aspect_ratio": self.aspect_ratio,
            "desired_outputs": list(self.desired_outputs),
            "locked_fields": list(self.locked_fields),
            "source": self.source,
            "material_context": self.material_context,
            "production_config": self.production_config,
        }


def build_production_directive(job: VideoJob) -> ProductionDirective:
    payload = job.input_payload
    if not isinstance(payload, dict):
        raise DirectiveValidationError(
            "video job input_payload must be an object",
            failure_code="invalid_input_payload",
        )
    raw_directive = _dict_value(payload, "productionDirective", "production_directive")
    raw_script = _dict_value(payload, "script")

    script_text = _string_value(raw_script, "text", "scriptText", "script_text")
    if not script_text:
        raise DirectiveValidationError(
            "video job requires locked script text in input_payload.script.text",
            failure_code="missing_script_text",
        )

    script_locked = _bool_value(raw_script, "locked", "scriptLocked", "script_locked", default=True)
    if not script_locked:
        raise DirectiveValidationError(
            "video job script must be locked before worker execution",
            failure_code="script_not_locked",
        )

    desired_outputs = _tuple_value(
        raw_directive,
        "desiredOutputs",
        "desired_outputs",
        default=("final_video", "cover", "subtitles"),
        default_on_invalid=False,
    )
    if "final_video" not in desired_outputs:
        raise DirectiveValidationError(
            "video job desired_outputs must include final_video",
            failure_code="missing_final_video_output",
        )
    unsupported_outputs = sorted(set(desired_outputs) - ALLOWED_DESIRED_OUTPUTS)
    if unsupported_outputs:
        raise DirectiveValidationError(
            "video job desired_outputs contains unsupported outputs: "
            + ", ".join(unsupported_outputs),
            failure_code="unsupported_desired_outputs",
        )

    locked_fields = _tuple_value(
        raw_directive,
        "lockedFields",
        "locked_fields",
        default=("script", "cta", "target_user", "claims"),
    )

    return ProductionDirective(
        job_id=job.id,
        execution_mode=_string_value(payload, "executionMode", "execution_mode")
        or _string_value(raw_directive, "executionMode", "execution_mode")
        or "staging_worker",
        script_text=script_text,
        script_locked=script_locked,
        target_platform=_string_value(raw_directive, "targetPlatform", "target_platform")
        or "douyin",
        aspect_ratio=_string_value(raw_directive, "aspectRatio", "aspect_ratio") or "9:16",
        desired_outputs=desired_outputs,
        locked_fields=locked_fields,
        source=str(payload.get("source") or "video_edit_job"),
        material_context=_dict_value(payload, "materialContext", "material_context"),
        production_config=_normalize_production_config(
            _dict_value(payload, "productionConfig", "production_config")
        ),
    )


def _normalize_production_config(payload: dict[str, Any]) -> dict[str, Any]:
    voiceover = _dict_value(payload, "voiceover")
    bgm = _dict_value(payload, "bgm")
    subtitles = _dict_value(payload, "subtitles")
    lip_sync = _dict_value(payload, "lipSync", "lip_sync")
    render = _dict_value(payload, "render")

    mode = _string_value(voiceover, "mode") or "system"
    if mode not in ALLOWED_VOICEOVER_MODES:
        _raise_invalid_production_config("unsupported voiceover mode")
    provider = _string_value(voiceover, "provider") or (
        "pixelle_clone" if mode == "voice_profile" else "bytedance_bigtts"
    )
    if provider not in ALLOWED_VOICEOVER_PROVIDERS:
        _raise_invalid_production_config("unsupported voiceover provider")
    if mode == "voice_profile" and provider != "pixelle_clone":
        _raise_invalid_production_config("voice_profile voiceover must use pixelle_clone provider")

    subtitle_style = _string_value(subtitles, "style") or "platform_default"
    if subtitle_style not in ALLOWED_SUBTITLE_STYLES:
        _raise_invalid_production_config("unsupported subtitle style")
    talking_head_source = (
        _string_value(subtitles, "talkingHeadSource", "talking_head_source")
        or "script"
    )
    if talking_head_source not in ALLOWED_TALKING_HEAD_SUBTITLE_SOURCES:
        _raise_invalid_production_config("unsupported talking head subtitle source")

    lip_sync_provider = _string_value(lip_sync, "provider") or "aliyun_videoretalk"
    if lip_sync_provider not in ALLOWED_LIP_SYNC_PROVIDERS:
        _raise_invalid_production_config("unsupported lip sync provider")
    lip_sync_subtitle_source = (
        _string_value(lip_sync, "subtitleSource", "subtitle_source")
        or talking_head_source
    )
    if lip_sync_subtitle_source not in ALLOWED_TALKING_HEAD_SUBTITLE_SOURCES:
        _raise_invalid_production_config("unsupported lip sync subtitle source")

    aspect_ratio = _string_value(render, "aspectRatio", "aspect_ratio") or "9:16"
    if aspect_ratio != "9:16":
        _raise_invalid_production_config("unsupported render aspect ratio")

    normalized_voiceover: dict[str, Any] = {
        "enabled": _optional_bool_value(voiceover, "enabled", default=True),
        "mode": mode,
        "provider": provider,
        "volume": _optional_number_value(
            voiceover,
            "volume",
            default=2,
            min_value=0,
            max_value=3,
        ),
    }
    voice_style = _string_value(voiceover, "voiceStyle", "voice_style")
    if voice_style:
        normalized_voiceover["voice_style"] = voice_style
    speaker = _string_value(voiceover, "speaker")
    if speaker and mode == "system":
        normalized_voiceover["speaker"] = speaker
    if mode == "voice_profile":
        voice_profile_id = _string_value(voiceover, "voiceProfileId", "voice_profile_id")
        ref_audio_asset_id = _string_value(voiceover, "refAudioAssetId", "ref_audio_asset_id")
        if not voice_profile_id or not ref_audio_asset_id:
            _raise_invalid_production_config(
                "voice_profile voiceover requires voiceProfileId and refAudioAssetId"
            )
        normalized_voiceover["clone_enabled"] = True
        normalized_voiceover["voice_profile_id"] = voice_profile_id
        normalized_voiceover["ref_audio_asset_id"] = ref_audio_asset_id
        ref_audio_asset = _dict_value(voiceover, "refAudioAsset", "ref_audio_asset")
        if ref_audio_asset:
            normalized_voiceover["ref_audio_asset"] = ref_audio_asset
        voice_profile = _dict_value(voiceover, "voiceProfile", "voice_profile")
        if voice_profile:
            normalized_voiceover["voice_profile"] = voice_profile
    speed = _optional_number_value(
        voiceover,
        "speed",
        default=None,
        min_value=0.5,
        max_value=2,
    )
    if speed is not None:
        normalized_voiceover["speed"] = speed

    normalized_render: dict[str, Any] = {
        "aspect_ratio": aspect_ratio,
        "include_original_audio": _optional_bool_value(
            render,
            "includeOriginalAudio",
            "include_original_audio",
            default=False,
        ),
    }
    preserve_talking_head_original_audio = _optional_bool_value(
        render,
        "preserveTalkingHeadOriginalAudio",
        "preserve_talking_head_original_audio",
        default=False,
    )
    if preserve_talking_head_original_audio:
        normalized_render["preserve_talking_head_original_audio"] = True
        normalized_render["include_video_audio"] = True
        normalized_render["video_volume_scale"] = _optional_number_value(
            render,
            "videoVolumeScale",
            "video_volume_scale",
            default=1,
            min_value=0,
            max_value=3,
        )
        audio_policy = _string_value(render, "audioPolicy", "audio_policy")
        normalized_render["audio_policy"] = (
            audio_policy or "preserve_talking_head_original_audio_with_voiceover"
        )
    return {
        "voiceover": normalized_voiceover,
        "bgm": {
            "enabled": _optional_bool_value(bgm, "enabled", default=True),
            "user_request": _string_value(bgm, "userRequest", "user_request"),
            "include": _normalize_bgm_filter(_dict_value(bgm, "include"), "include"),
            "exclude": _normalize_bgm_filter(_dict_value(bgm, "exclude"), "exclude"),
            "volume": _optional_number_value(
                bgm,
                "volume",
                default=0.25,
                min_value=0,
                max_value=3,
            ),
        },
        "subtitles": {
            "enabled": _optional_bool_value(subtitles, "enabled", default=True),
            "style": subtitle_style,
            "talking_head_source": talking_head_source,
        },
        "lip_sync": {
            "enabled": _optional_bool_value(
                lip_sync,
                "enabled",
                default=talking_head_source == "script_audio_alignment",
            ),
            "provider": lip_sync_provider,
            "scope": "talking_head_segments",
            "subtitle_source": lip_sync_subtitle_source,
            "require_voice_profile": _optional_bool_value(
                lip_sync,
                "requireVoiceProfile",
                "require_voice_profile",
                default=True,
            ),
        },
        "render": normalized_render,
    }


def _normalize_bgm_filter(payload: dict[str, Any], field_name: str) -> dict[str, Any]:
    for key in payload:
        if key not in ALLOWED_BGM_FILTER_KEYS:
            _raise_invalid_production_config(
                f"unsupported bgm {field_name} filter: {key}"
            )
    return dict(payload)


def _optional_bool_value(
    payload: dict[str, Any],
    *keys: str,
    default: bool,
) -> bool:
    for key in keys:
        if key not in payload:
            continue
        value = payload[key]
        if not isinstance(value, bool):
            _raise_invalid_production_config(f"{key} must be boolean")
        return value
    return default


def _optional_number_value(
    payload: dict[str, Any],
    *keys: str,
    default: float | int | None,
    min_value: float,
    max_value: float,
    integer: bool = False,
) -> float | int | None:
    for key in keys:
        if key not in payload:
            continue
        value = payload[key]
        if isinstance(value, bool) or not isinstance(value, int | float):
            _raise_invalid_production_config(f"{key} must be numeric")
        if value < min_value or value > max_value:
            _raise_invalid_production_config(f"{key} is out of range")
        if integer and int(value) != value:
            _raise_invalid_production_config(f"{key} must be an integer")
        return int(value) if integer else value
    return default


def _raise_invalid_production_config(message: str) -> None:
    raise DirectiveValidationError(
        message,
        failure_code="invalid_production_config",
    )


def _dict_value(payload: dict[str, Any], *keys: str) -> dict[str, Any]:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _string_value(payload: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _bool_value(
    payload: dict[str, Any],
    *keys: str,
    default: bool,
) -> bool:
    for key in keys:
        if key not in payload:
            continue
        value = payload[key]
        return value if isinstance(value, bool) else False
    return default


def _tuple_value(
    payload: dict[str, Any],
    *keys: str,
    default: tuple[str, ...],
    default_on_invalid: bool = True,
) -> tuple[str, ...]:
    for key in keys:
        if key not in payload:
            continue
        value = payload[key]
        if not isinstance(value, list | tuple):
            return default if default_on_invalid else ()
        cleaned = tuple(str(item) for item in value if str(item).strip())
        if cleaned:
            return cleaned
        return default if default_on_invalid else ()
    return default
