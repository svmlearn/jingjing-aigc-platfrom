from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import VideoJob


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
        }


def build_production_directive(job: VideoJob) -> ProductionDirective:
    payload = job.input_payload
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
