from collections import defaultdict
from typing import List, Any, Dict
import os
from pathlib import Path
import json
import traceback
import re


from langchain_mcp_adapters.interceptors import MCPToolCallRequest
from langgraph.types import Command
from langchain_core.messages import ToolMessage, ToolCall
from langchain_core.tools import ToolException
from mcp.types import CallToolResult

from open_storyline.nodes.node_manager import NodeManager

from open_storyline.storage.file import FileCompressor
from open_storyline.utils.logging import get_logger

logger = get_logger(__name__)


# Hosts that indicate Agent and MCP server are on the same machine (path-only, no base64). 0.0.0.0 for Docker.
_LOCAL_CONNECT_HOSTS = frozenset({"127.0.0.1", "localhost", "::1", "0.0.0.0"})
_PREVIEW_MEDIA_SUFFIXES = {".mp4", ".mov", ".webm", ".mkv", ".mp3", ".wav", ".m4a", ".aac", ".png", ".jpg", ".jpeg", ".gif", ".webp"}
_SCRIPT_NUMBERED_SECTION_RE = re.compile(
    r"(?ms)^\s*(\d{1,2})\s*\n\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*\n(.*?)(?=^\s*\d{1,2}\s*\n\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*\n|\Z)"
)
_SCRIPT_SCENE_HEADING_RE = re.compile(
    r"(?ms)^\s*场景\s*\d{1,2}\s*[（(][^）)\n]+[）)]\s*\n(.*?)(?=^\s*场景\s*\d{1,2}\s*[（(][^）)\n]+[）)]\s*\n|\Z)"
)
_SCRIPT_LABEL_STOP = (
    "台词/字幕",
    "台词",
    "旁白",
    "口播",
    "字幕",
    "画面花字",
    "素材关键词",
    "素材",
    "场景",
    "画面",
    "镜头要求",
    "镜头",
    "拍法",
    "提示",
    "时长",
    "标题",
    "CTA",
    "卖点",
)
_SCRIPT_LABEL_STOP_RE = "|".join(re.escape(label) for label in _SCRIPT_LABEL_STOP)
_DIALOGUE_RE = re.compile(
    rf"(?:台词/字幕|台词|旁白|口播)\s*[：:]\s*(.+?)(?=\n\s*(?:{_SCRIPT_LABEL_STOP_RE})\s*[：:]|\Z)",
    re.S,
)
_SUBTITLE_RE = re.compile(
    rf"(?:字幕)\s*[：:]\s*(.+?)(?=\n\s*(?:{_SCRIPT_LABEL_STOP_RE})\s*[：:]|\Z)",
    re.S,
)
_TALKING_HEAD_LABELS = {
    "talking-head",
    "talkinghead",
    "口播",
    "真人口播",
    "真人开头口播",
    "真人结尾口播",
}
_TALKING_HEAD_SCRIPT_TOKENS = (
    "真人开头口播",
    "真人结尾口播",
    "真人口播",
    "口播",
    "出镜讲解",
    "人物讲解",
)
_ASR_ORIGINAL_AUDIO_MODE = "asr_original_audio"
_ORIGINAL_VIDEO_AUDIO_SOURCE = "original_video_audio"
_ALIYUN_ASR_PROVIDER = "aliyun_paraformer"
_ALIYUN_ASR_PROVIDER_ALIASES = {"aliyun", "aliyun-paraformer", "dashscope", "dashscope-paraformer"}
_LOCAL_ASR_PROVIDER_ALIASES = {"local", "local-funasr", "funasr"}
_ASSET_METADATA_KEYS = (
    "asset_id",
    "asset_type",
    "bucket_name",
    "storage_key",
    "file_name",
    "store_file_name",
    "media_id",
    "role",
    "scene_type",
    "sceneType",
    "tags",
    "labels",
    "metadata",
)

def _extract_tool_result_text(result: dict[str, Any]) -> str:
    content = result.get("content", [])
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict):
            return str(first.get("text", "") or "")
    return ""


def _is_storyline_tool_result(tool_result: Any) -> bool:
    return isinstance(tool_result, dict) and {
        "artifact_id",
        "isError",
        "summary",
    }.issubset(tool_result.keys())


def _is_storyline_node_request(request: MCPToolCallRequest) -> bool:
    node_id = str(getattr(request, "name", "") or "")
    if node_id in {"load_media", "search_media", "read_node_history"}:
        return True
    node_manager = getattr(getattr(request.runtime, "context", None), "node_manager", None)
    id_to_tool = getattr(node_manager, "id_to_tool", None)
    return isinstance(id_to_tool, dict) and node_id in id_to_tool


def _generic_tool_command(tool_result: dict[str, Any], tool_call_id: str) -> Command:
    summary = ""
    summary_block = tool_result.get("summary")
    if isinstance(summary_block, dict):
        summary = str(summary_block.get("node_summary", "") or "")
    elif isinstance(summary_block, str):
        summary = summary_block

    if not summary:
        summary = str(tool_result.get("message", "") or tool_result.get("status", "") or "")

    if not summary and tool_result.get("artifacts"):
        summary = "Artifacts ready."

    is_error = bool(tool_result.get("isError", False) or tool_result.get("ok") is False)
    summary_payload = {
        "node_summary": summary,
        "tool_excute_result": tool_result,
    }
    preview_urls = _collect_preview_urls(tool_result)
    if preview_urls:
        summary_payload["preview_urls"] = preview_urls

    return Command(
        update={
            "messages": [
                ToolMessage(
                    content={
                        "summary": summary_payload,
                        "isError": is_error,
                    },
                    tool_call_id=tool_call_id,
                )
            ],
            "status": "done",
        },
    )


def _collect_preview_urls(tool_result: dict[str, Any]) -> list[str]:
    preview_urls: list[str] = []

    def add_candidate(value: Any) -> None:
        if not isinstance(value, str):
            return
        normalized = value.strip()
        if not normalized:
            return
        if Path(normalized).suffix.lower() not in _PREVIEW_MEDIA_SUFFIXES:
            return
        if normalized not in preview_urls:
            preview_urls.append(normalized)

    direct_preview_urls = tool_result.get("preview_urls")
    if isinstance(direct_preview_urls, list):
        for item in direct_preview_urls:
            add_candidate(item)

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for child in value.values():
                walk(child)
            return
        if isinstance(value, list):
            for child in value:
                walk(child)
            return
        add_candidate(value)

    walk(tool_result.get("artifacts", {}))
    return preview_urls


def _get_nested_dict(payload: Any, *keys: str) -> dict[str, Any]:
    cur = payload
    for key in keys:
        if not isinstance(cur, dict):
            return {}
        cur = cur.get(key)
    return cur if isinstance(cur, dict) else {}


def _get_nested_value(payload: Any, *keys: str) -> Any:
    cur = payload
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", "-")


def _normalize_scene_query(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _scene_query_tokens(value: Any) -> set[str]:
    normalized = _normalize_scene_query(value)
    if not normalized:
        return set()
    return {token for token in re.split(r"[\s,，、/|;；:：]+", normalized) if token}


def _scene_queries_match(expected: Any, actual: Any) -> bool:
    expected_norm = _normalize_scene_query(expected)
    actual_norm = _normalize_scene_query(actual)
    if not expected_norm or not actual_norm:
        return False
    if expected_norm == actual_norm:
        return True
    if expected_norm in actual_norm or actual_norm in expected_norm:
        return True
    expected_tokens = _scene_query_tokens(expected_norm)
    actual_tokens = _scene_query_tokens(actual_norm)
    return bool(expected_tokens and actual_tokens and expected_tokens & actual_tokens)


def _worker_material_context(worker_payload: Any) -> dict[str, Any]:
    if not isinstance(worker_payload, dict):
        return {}
    return (
        _get_nested_dict(worker_payload, "material_context")
        or _get_nested_dict(worker_payload, "materialContext")
        or _get_nested_dict(worker_payload, "production_directive", "material_context")
        or _get_nested_dict(worker_payload, "production_directive", "materialContext")
        or _get_nested_dict(worker_payload, "productionDirective", "material_context")
        or _get_nested_dict(worker_payload, "productionDirective", "materialContext")
    )


def _worker_scene_asset_queries(worker_payload: Any) -> list[dict[str, Any]]:
    material_context = _worker_material_context(worker_payload)
    scene_queries = material_context.get("sceneAssetQueries") or material_context.get("scene_asset_queries")
    if not isinstance(scene_queries, list):
        return []
    out: list[dict[str, Any]] = []
    for index, item in enumerate(scene_queries):
        if not isinstance(item, dict):
            continue
        query = str(
            item.get("query")
            or item.get("search_keyword")
            or item.get("searchKeyword")
            or item.get("visualRequirement")
            or item.get("visual_requirement")
            or item.get("fallbackShot")
            or item.get("fallback_shot")
            or ""
        ).strip()
        if not query:
            continue
        source_role = str(item.get("sourceRole") or item.get("source_role") or "").strip()
        if source_role == "user_talking_head":
            continue
        scene_no = item.get("sceneNo") or item.get("scene_no") or index + 1
        try:
            scene_no = int(scene_no)
        except Exception:
            scene_no = index + 1
        out.append(
            {
                "index": index,
                "scene_no": scene_no,
                "sceneNo": scene_no,
                "query": query,
                "source_role": source_role,
                "sourceRole": source_role or "merchant_broll",
            }
        )
    return out


def _worker_payload_has_locked_script(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    production_directive = (
        _get_nested_dict(worker_payload, "production_directive")
        or _get_nested_dict(worker_payload, "productionDirective")
    )
    if production_directive and (
        production_directive.get("script_locked") is True
        or production_directive.get("scriptLocked") is True
    ):
        return True
    script_text = (
        worker_payload.get("script_text")
        or worker_payload.get("scriptText")
        or production_directive.get("script_text")
        or production_directive.get("scriptText")
    )
    return isinstance(script_text, str) and bool(script_text.strip())


def _worker_locked_script_scene_count(worker_payload: Any) -> int:
    if not isinstance(worker_payload, dict):
        return 0
    production_directive = (
        _get_nested_dict(worker_payload, "production_directive")
        or _get_nested_dict(worker_payload, "productionDirective")
    )
    script_text = worker_payload.get("script_text") or worker_payload.get("scriptText")
    if not isinstance(script_text, str) or not script_text.strip():
        script_text = production_directive.get("script_text") or production_directive.get("scriptText")
    if not isinstance(script_text, str) or not script_text.strip():
        return 0
    return len(_extract_locked_script_sections(script_text))


def _worker_required_scene_count(worker_payload: Any) -> int:
    scene_count = len(_worker_scene_asset_queries(worker_payload))
    locked_script_count = (
        _worker_locked_script_scene_count(worker_payload)
        if scene_count == 0
        else 0
    )
    return max(scene_count, locked_script_count)


def _input_asset_metadata_by_basename(worker_payload: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(worker_payload, dict):
        return {}
    assets = worker_payload.get("input_assets")
    if not isinstance(assets, list):
        return {}

    out: dict[str, dict[str, Any]] = {}
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        metadata = {
            key: asset.get(key)
            for key in _ASSET_METADATA_KEYS
            if asset.get(key) not in (None, "", [], {})
        }
        if not metadata:
            continue
        for key in ("store_file_name", "file_name"):
            value = asset.get(key)
            if isinstance(value, str) and value.strip():
                out[os.path.basename(value.strip())] = metadata
    return out


def _worker_input_metadata_for_path(context: Any, path: Path) -> dict[str, Any]:
    worker_payload = getattr(context, "worker_payload", None)
    by_name = _input_asset_metadata_by_basename(worker_payload)
    return dict(by_name.get(path.name) or {})


def _clean_locked_script_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()


def _extract_dialogue_from_section(section: str) -> str:
    value = section or ""
    for pattern in (_DIALOGUE_RE, _SUBTITLE_RE):
        match = pattern.search(value)
        if match:
            dialogue = _clean_locked_script_text(match.group(1))
            if dialogue:
                return dialogue
    return ""


def _extract_locked_script_sections(script_text: str) -> list[str]:
    sections = [section for _scene_no, section in _SCRIPT_NUMBERED_SECTION_RE.findall(script_text)]
    scene_heading_sections = _SCRIPT_SCENE_HEADING_RE.findall(script_text)
    if scene_heading_sections:
        sections.extend(scene_heading_sections)
    return sections


def _split_locked_dialogue_text(text: str, max_parts: int) -> list[str]:
    if max_parts <= 1:
        return [_clean_locked_script_text(text)] if _clean_locked_script_text(text) else []

    pieces = [
        _clean_locked_script_text(part)
        for part in re.split(r"[，。！？；,!?;]+", text or "")
        if _clean_locked_script_text(part)
    ]
    if len(pieces) <= max_parts:
        return pieces or ([_clean_locked_script_text(text)] if _clean_locked_script_text(text) else [])

    head = pieces[: max_parts - 1]
    tail = _clean_locked_script_text("，".join(pieces[max_parts - 1 :]))
    return head + ([tail] if tail else [])


def _expand_dialogues_to_group_count(dialogues: list[str], target_count: int) -> list[str]:
    expanded = [_clean_locked_script_text(item) for item in dialogues if _clean_locked_script_text(item)]
    if target_count <= 0 or len(expanded) >= target_count:
        return expanded[:target_count]

    while len(expanded) < target_count:
        needed_parts = target_count - len(expanded) + 1
        best_index = -1
        best_parts: list[str] = []
        for index, text in enumerate(expanded):
            parts = _split_locked_dialogue_text(text, needed_parts)
            if len(parts) <= 1:
                continue
            if best_index < 0 or len(text) > len(expanded[best_index]):
                best_index = index
                best_parts = parts

        if best_index < 0:
            break

        expanded = expanded[:best_index] + best_parts + expanded[best_index + 1 :]

    return expanded[:target_count]


def _worker_payload_talking_head_subtitles_from_asr(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    subtitles = _get_nested_dict(worker_payload, "production_config", "subtitles")
    source = (
        subtitles.get("talking_head_source")
        or subtitles.get("talkingHeadSource")
        or subtitles.get("source")
    )
    return str(source or "").strip().lower() == _ASR_ORIGINAL_AUDIO_MODE


def _normalized_asr_provider(value: Any) -> str:
    provider = _normalize_token(value)
    if provider in _ALIYUN_ASR_PROVIDER_ALIASES:
        return _ALIYUN_ASR_PROVIDER
    return provider


def _asr_config_provider(asr_config: Any) -> str:
    if not isinstance(asr_config, dict):
        return _normalized_asr_provider(os.getenv("OPENSTORYLINE_ASR_PROVIDER"))
    return _normalized_asr_provider(
        asr_config.get("provider") or os.getenv("OPENSTORYLINE_ASR_PROVIDER")
    )


def _asr_config_api_key(asr_config: Any) -> str:
    if not isinstance(asr_config, dict):
        return str(os.getenv("ALIYUN_ASR_API_KEY") or os.getenv("DASHSCOPE_API_KEY") or "").strip()

    provider = _asr_config_provider(asr_config)
    provider_cfg = asr_config.get(provider)
    if not isinstance(provider_cfg, dict):
        provider_cfg = asr_config.get(_ALIYUN_ASR_PROVIDER)
    if not isinstance(provider_cfg, dict):
        provider_cfg = {}
    return str(
        provider_cfg.get("api_key")
        or asr_config.get("api_key")
        or os.getenv("ALIYUN_ASR_API_KEY")
        or os.getenv("DASHSCOPE_API_KEY")
        or ""
    ).strip()


def _assert_original_audio_asr_config(context: Any) -> None:
    worker_payload = getattr(context, "worker_payload", None)
    if not _worker_payload_talking_head_subtitles_from_asr(worker_payload):
        return

    asr_config = getattr(context, "asr_config", None)
    provider = _asr_config_provider(asr_config)
    if provider in _LOCAL_ASR_PROVIDER_ALIASES:
        raise ToolException(
            "talking-head original-audio subtitles require aliyun_paraformer; local FunASR fallback is disabled"
        )
    if provider != _ALIYUN_ASR_PROVIDER:
        raise ToolException(
            f"talking-head original-audio subtitles require aliyun_paraformer; got {provider or '(empty)'}"
        )
    if not _asr_config_api_key(asr_config):
        raise ToolException(
            "talking-head original-audio subtitles require ALIYUN_ASR_API_KEY or DASHSCOPE_API_KEY"
        )


def _with_required_original_audio_asr(
    require_kind: Any,
    node_id: str,
    context: Any,
) -> list[str]:
    result = list(require_kind or [])
    if node_id != "generate_script":
        return result
    worker_payload = getattr(context, "worker_payload", None)
    if _worker_payload_talking_head_subtitles_from_asr(worker_payload) and "asr" not in result:
        result.append("asr")
    return result


def _worker_payload_bgm_enabled(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    production_config = worker_payload.get("production_config")
    if not isinstance(production_config, dict):
        return True
    bgm = production_config.get("bgm")
    return not (isinstance(bgm, dict) and bgm.get("enabled") is False)


def _with_disabled_optional_kinds_removed(
    require_kind: Any,
    node_id: str,
    context: Any,
) -> list[str]:
    result = _with_required_original_audio_asr(require_kind, node_id, context)
    worker_payload = getattr(context, "worker_payload", None)
    if node_id == "render_video" and not _worker_payload_lip_sync_enabled(worker_payload):
        result = [kind for kind in result if kind != "lip_sync"]
    if node_id not in {"plan_timeline", "plan_timeline_pro"}:
        return result

    disabled_kinds: set[str] = set()
    if not _worker_payload_voiceover_enabled(worker_payload):
        disabled_kinds.add("tts")
    if not _worker_payload_bgm_enabled(worker_payload):
        disabled_kinds.add("music_rec")

    if not disabled_kinds:
        return result
    return [kind for kind in result if kind not in disabled_kinds]


def _group_ids_from_groups(groups: Any) -> list[str]:
    group_ids: list[str] = []
    if isinstance(groups, list):
        for group in groups:
            if isinstance(group, dict) and isinstance(group.get("group_id"), str):
                group_ids.append(group["group_id"])
    return group_ids


def _clip_lookup_from_split_shots(split_shots: Any) -> dict[str, dict[str, Any]]:
    clips = _get_nested_value(split_shots, "clips")
    if clips is None and isinstance(split_shots, dict):
        clips = split_shots.get("split_shots", {}).get("clips")
    if not isinstance(clips, list):
        return {}
    return {
        str(clip.get("clip_id")): clip
        for clip in clips
        if isinstance(clip, dict) and clip.get("clip_id")
    }


def _payload_asset_by_media_id(worker_payload: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(worker_payload, dict):
        return {}
    assets = worker_payload.get("input_assets")
    if not isinstance(assets, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        for key in (
            "media_id",
            "asset_id",
            "id",
            "file_name",
            "store_file_name",
            "storage_key",
            "local_path",
        ):
            value = asset.get(key)
            if isinstance(value, str) and value.strip():
                out[value.strip()] = asset
                if key == "storage_key":
                    out[Path(value).name] = asset
        metadata = asset.get("metadata")
        if isinstance(metadata, dict):
            for key in ("media_id", "asset_id", "id", "file_name", "store_file_name", "storage_key"):
                value = metadata.get(key)
                if isinstance(value, str) and value.strip():
                    out[value.strip()] = asset
                    if key == "storage_key":
                        out[Path(value).name] = asset
    return out


def _asset_values_for_talking_head(asset: Any) -> list[str]:
    if not isinstance(asset, dict):
        return []
    values: list[str] = []
    for key in ("role", "scene_type", "sceneType", "asset_type", "assetType"):
        value = asset.get(key)
        if isinstance(value, str):
            values.append(value)
    for key in ("tags", "labels"):
        value = asset.get(key)
        if isinstance(value, list | tuple):
            values.extend(str(item) for item in value)
    metadata = asset.get("metadata")
    if isinstance(metadata, dict):
        values.extend(_asset_values_for_talking_head(metadata))
    return values


def _clip_has_talking_head_label(clip: Any, payload_assets_by_media_id: dict[str, dict[str, Any]]) -> bool:
    if not isinstance(clip, dict):
        return False
    source_ref = clip.get("source_ref")
    values = _asset_values_for_talking_head(source_ref)
    for asset in _payload_assets_for_clip(clip, payload_assets_by_media_id):
        values.extend(_asset_values_for_talking_head(asset))
    normalized = {_normalize_token(value) for value in values if str(value).strip()}
    return any(_normalize_token(label) in normalized for label in _TALKING_HEAD_LABELS)


def _clip_is_project_material(clip: Any, payload_assets_by_media_id: dict[str, dict[str, Any]]) -> bool:
    if not isinstance(clip, dict):
        return False
    source_ref = clip.get("source_ref")
    values = _asset_values_for_talking_head(source_ref)
    for asset in _payload_assets_for_clip(clip, payload_assets_by_media_id):
        values.extend(_asset_values_for_talking_head(asset))
    normalized = {_normalize_token(value) for value in values if str(value).strip()}
    return bool({"project-material", "merchant-material-library"} & normalized)


def _payload_assets_for_clip(
    clip: Any,
    payload_assets_by_media_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(clip, dict):
        return []
    source_ref = clip.get("source_ref")
    if not isinstance(source_ref, dict):
        return []
    out: list[dict[str, Any]] = []
    for key in (
        "media_id",
        "asset_id",
        "id",
        "file_name",
        "store_file_name",
        "storage_key",
        "orig_path",
        "path",
    ):
        value = source_ref.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        for candidate in (value.strip(), Path(value).name):
            asset = payload_assets_by_media_id.get(candidate)
            if isinstance(asset, dict) and asset not in out:
                out.append(asset)
    return out


def _worker_payload_user_talking_head_asset_ids(worker_payload: Any) -> set[str]:
    material_context = _worker_material_context(worker_payload)
    value = material_context.get("userTalkingHeadAssetIds") or material_context.get("user_talking_head_asset_ids")
    if not isinstance(value, list | tuple | set):
        return set()
    return {str(item).strip() for item in value if str(item).strip()}


def _clip_is_member_upload_candidate(
    clip: Any,
    payload_assets_by_media_id: dict[str, dict[str, Any]],
    user_talking_head_asset_ids: set[str],
) -> bool:
    if not isinstance(clip, dict):
        return False
    source_ref = clip.get("source_ref")
    if not isinstance(source_ref, dict):
        return False
    for key in ("asset_id", "id", "media_id", "file_name", "store_file_name", "storage_key"):
        value = source_ref.get(key)
        if isinstance(value, str) and value.strip():
            candidates = {value.strip(), Path(value).name}
            if candidates & user_talking_head_asset_ids:
                return True
    for asset in _payload_assets_for_clip(clip, payload_assets_by_media_id):
        for key in ("asset_id", "id", "media_id", "file_name", "store_file_name", "storage_key"):
            value = asset.get(key)
            if isinstance(value, str) and value.strip():
                candidates = {value.strip(), Path(value).name}
                if candidates & user_talking_head_asset_ids:
                    return True
    return False


def _group_source_duration_ms(group: dict[str, Any], clip_lookup: dict[str, dict[str, Any]]) -> int:
    total = 0
    for clip_id in group.get("clip_ids") or []:
        clip = clip_lookup.get(str(clip_id))
        if not isinstance(clip, dict):
            continue
        source_ref = clip.get("source_ref") or {}
        try:
            total += int(source_ref.get("duration") or 0)
        except Exception:
            continue
    return total


def _asr_text_for_group(group: dict[str, Any], asr_infos: Any) -> str:
    if not isinstance(asr_infos, list):
        return ""
    group_clip_ids = {str(clip_id) for clip_id in (group.get("clip_ids") or [])}
    texts: list[str] = []
    for item in asr_infos:
        if not isinstance(item, dict):
            continue
        if str(item.get("clip_id") or "") not in group_clip_ids:
            continue
        text = _clean_locked_script_text(item.get("asr_text"))
        if text:
            texts.append(text)
    return _clean_locked_script_text(" ".join(texts))


def _build_custom_script_from_worker_payload(
    payload: Any,
    groups: Any,
    asr: Any = None,
    split_shots: Any = None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    production_directive = _get_nested_dict(payload, "production_directive")
    if production_directive and production_directive.get("script_locked") is not True:
        return {}

    script_text = payload.get("script_text")
    if not isinstance(script_text, str) or not script_text.strip():
        script_text = production_directive.get("script_text")
    if not isinstance(script_text, str) or not script_text.strip():
        script_text = ""
    if not script_text:
        return {}

    group_ids = _group_ids_from_groups(groups)
    if not group_ids:
        return {}

    numbered_dialogues: list[str] = []
    numbered_sections: list[str] = []
    for section in _extract_locked_script_sections(script_text):
        dialogue = _extract_dialogue_from_section(section)
        if dialogue:
            numbered_dialogues.append(dialogue)
            numbered_sections.append(section)

    extracted_from_numbered_sections = bool(numbered_dialogues)
    if not numbered_dialogues:
        for line in script_text.splitlines():
            dialogue = _extract_dialogue_from_section(line)
            if dialogue:
                numbered_dialogues.append(dialogue)
                numbered_sections.append(line)

    if not numbered_dialogues:
        return {}

    if not extracted_from_numbered_sections:
        numbered_dialogues = _expand_dialogues_to_group_count(numbered_dialogues, len(group_ids))

    use_asr_for_talking_head = _worker_payload_talking_head_subtitles_from_asr(payload)
    payload_is_talking_head = _worker_payload_is_talking_head(payload)
    asr_infos = _get_nested_value(asr, "asr_infos")
    clip_lookup = _clip_lookup_from_split_shots(split_shots)
    payload_assets_by_media_id = _payload_asset_by_media_id(payload)
    user_talking_head_asset_ids = _worker_payload_user_talking_head_asset_ids(payload)
    voiceover_enabled = _worker_payload_voiceover_enabled(payload)

    group_scripts = []
    for index, group_id in enumerate(group_ids):
        if index >= len(numbered_dialogues):
            break
        group = groups[index] if isinstance(groups, list) and index < len(groups) and isinstance(groups[index], dict) else {}
        group_clip_ids = [str(item) for item in (group.get("clip_ids") or [])]
        section_text = numbered_sections[index] if index < len(numbered_sections) else numbered_dialogues[index]
        section_requests_talking_head = any(
            token in section_text for token in _TALKING_HEAD_SCRIPT_TOKENS
        )
        has_talking_head_label = any(
            _clip_has_talking_head_label(clip_lookup.get(clip_id), payload_assets_by_media_id)
            for clip_id in group_clip_ids
        )
        has_member_upload_candidate = (
            payload_is_talking_head
            and group_clip_ids
            and any(
                _clip_is_member_upload_candidate(
                    clip_lookup.get(clip_id),
                    payload_assets_by_media_id,
                    user_talking_head_asset_ids,
                )
                or (
                    section_requests_talking_head
                    and not _clip_is_project_material(clip_lookup.get(clip_id), payload_assets_by_media_id)
                )
                for clip_id in group_clip_ids
            )
        )
        is_talking_head_group = has_talking_head_label or has_member_upload_candidate
        source_duration_ms = _group_source_duration_ms(group, clip_lookup)
        raw_text = numbered_dialogues[index]
        group_script = {
            "group_id": group_id,
            "raw_text": raw_text,
            "source_clip_ids": group_clip_ids,
            "source_duration_ms": source_duration_ms,
            "subtitle_source": "locked_script",
            "audio_source": "voiceover" if voiceover_enabled else _ORIGINAL_VIDEO_AUDIO_SOURCE,
        }
        if not voiceover_enabled:
            group_script.update(
                {
                    "skip_voiceover": True,
                    "voiceover_enabled": False,
                    "preserve_clip_duration": True,
                }
            )
        if use_asr_for_talking_head and is_talking_head_group:
            asr_text = _asr_text_for_group(group, asr_infos)
            if not asr_text:
                if not has_talking_head_label:
                    group_scripts.append(group_script)
                    continue
                raise ValueError(
                    f"talking-head group {group_id} requires ASR original-audio subtitles, but ASR text is empty"
                )
            group_script.update(
                {
                    "raw_text": asr_text,
                    "subtitle_source": _ASR_ORIGINAL_AUDIO_MODE,
                    "preserve_clip_duration": True,
                }
            )
            if has_talking_head_label:
                group_script.update(
                    {
                        "skip_voiceover": True,
                        "voiceover_enabled": False,
                        "audio_source": _ORIGINAL_VIDEO_AUDIO_SOURCE,
                    }
                )
            elif voiceover_enabled:
                group_script.update(
                    {
                        "audio_source": "voiceover",
                        "voiceover_enabled": True,
                    }
                )
            else:
                group_script.update(
                    {
                        "skip_voiceover": True,
                        "voiceover_enabled": False,
                        "audio_source": _ORIGINAL_VIDEO_AUDIO_SOURCE,
                    }
                )
        group_scripts.append(
            group_script
        )

    if not group_scripts:
        return {}
    return {"title": "", "group_scripts": group_scripts}


def _inject_locked_custom_script(args: dict[str, Any], context: Any) -> None:
    if "custom_script" in args and isinstance(args.get("custom_script"), dict) and args["custom_script"]:
        return

    worker_payload = getattr(context, "worker_payload", None)
    custom_script = _build_custom_script_from_worker_payload(
        worker_payload,
        _get_nested_dict(args, "group_clips").get("groups"),
        _get_nested_dict(args, "asr"),
        _get_nested_dict(args, "split_shots"),
    )
    if custom_script:
        args["custom_script"] = custom_script


def _iter_text_values(value: Any):
    if isinstance(value, dict):
        for child in value.values():
            yield from _iter_text_values(child)
        return
    if isinstance(value, list | tuple | set):
        for child in value:
            yield from _iter_text_values(child)
        return
    if isinstance(value, str):
        text = value.strip()
        if text:
            yield text


def _asset_has_talking_head_label(asset: Any) -> bool:
    if not isinstance(asset, dict):
        return False

    values = _asset_values_for_talking_head(asset)

    normalized = {
        _normalize_token(value)
        for value in values
        if str(value).strip()
    }
    return any(
        _normalize_token(label) in normalized
        for label in _TALKING_HEAD_LABELS
    )


def _worker_payload_is_talking_head(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False

    if _worker_payload_user_talking_head_asset_ids(worker_payload):
        return True

    material_context = _worker_material_context(worker_payload)
    scene_queries = material_context.get("sceneAssetQueries") or material_context.get("scene_asset_queries")
    if isinstance(scene_queries, list) and any(
        isinstance(item, dict)
        and str(item.get("sourceRole") or item.get("source_role") or "").strip() == "user_talking_head"
        for item in scene_queries
    ):
        return True

    input_assets = worker_payload.get("input_assets")
    if isinstance(input_assets, list) and any(
        _asset_has_talking_head_label(asset) for asset in input_assets
    ):
        return True

    text = " ".join(
        _iter_text_values(
            {
                "script_text": worker_payload.get("script_text"),
                "production_directive": worker_payload.get("production_directive"),
                "production_config": worker_payload.get("production_config"),
            }
        )
    )
    return any(token in text for token in _TALKING_HEAD_SCRIPT_TOKENS)


def _worker_payload_voiceover_enabled(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    production_config = worker_payload.get("production_config")
    if not isinstance(production_config, dict):
        return True
    voiceover = production_config.get("voiceover")
    return not (isinstance(voiceover, dict) and voiceover.get("enabled") is False)


def _worker_payload_lip_sync_enabled(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    production_config = worker_payload.get("production_config")
    if not isinstance(production_config, dict):
        return False
    lip_sync = production_config.get("lip_sync") or production_config.get("lipSync")
    return isinstance(lip_sync, dict) and lip_sync.get("enabled") is True


def _search_media_paths_from_payload(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    paths = payload.get("search_media")
    if not isinstance(paths, list):
        return []
    out: list[str] = []
    for item in paths:
        value: Any = item
        if isinstance(item, dict):
            value = item.get("path")
        if isinstance(value, str) and value.strip():
            out.append(value.strip())
    return out


def _search_media_payload_keyword(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("search_keyword", "searchKeyword"):
        query = _normalize_scene_query(payload.get(key))
        if query:
            return query
    scene_search = payload.get("scene_search") or payload.get("sceneSearch")
    if isinstance(scene_search, dict):
        for key in ("search_keyword", "searchKeyword", "query"):
            query = _normalize_scene_query(scene_search.get(key))
            if query:
                return query
    worker_scene_search = payload.get("_worker_scene_search")
    if isinstance(worker_scene_search, dict):
        for key in ("normalized_query", "query"):
            query = _normalize_scene_query(worker_scene_search.get(key))
            if query:
                return query
    return ""


def _iter_search_media_metas(store: Any, *, session_id: str) -> list[Any]:
    get_metas = getattr(store, "get_metas", None)
    if callable(get_metas):
        metas = get_metas(node_id="search_media", session_id=session_id)
        if isinstance(metas, list):
            return sorted(
                [meta for meta in metas if meta],
                key=lambda meta: getattr(meta, "created_at", 0),
            )
    latest = store.get_latest_meta(node_id="search_media", session_id=session_id)
    return [latest] if latest else []


def _load_search_media_payloads(store: Any, *, session_id: str) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for meta in _iter_search_media_metas(store, session_id=session_id):
        try:
            _, data = store.load_result(meta.artifact_id)
        except Exception:
            continue
        if isinstance(data, dict) and isinstance(data.get("payload"), dict):
            payloads.append(data["payload"])
    return payloads


def _missing_worker_scene_searches(
    worker_payload: Any,
    search_payloads: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not _worker_payload_has_locked_script(worker_payload):
        return []
    scene_queries = _worker_scene_asset_queries(worker_payload)
    if not scene_queries:
        return []
    searched_queries = {
        query for payload in search_payloads
        if (query := _search_media_payload_keyword(payload))
    }
    return [
        scene for scene in scene_queries
        if not any(
            _scene_queries_match(scene.get("query"), searched_query)
            for searched_query in searched_queries
        )
    ]


def _worker_scene_search_attempts(
    worker_payload: Any,
    search_payloads: list[dict[str, Any]],
) -> dict[int, int]:
    attempts: dict[int, int] = {}
    if not _worker_payload_has_locked_script(worker_payload):
        return attempts
    scene_queries = _worker_scene_asset_queries(worker_payload)
    if not scene_queries:
        return attempts
    for payload in search_payloads:
        searched_query = _search_media_payload_keyword(payload)
        if not searched_query:
            continue
        for scene in scene_queries:
            if _scene_queries_match(scene.get("query"), searched_query):
                scene_no = int(scene.get("scene_no") or scene.get("sceneNo") or scene.get("index") or 0)
                if scene_no > 0:
                    attempts[scene_no] = attempts.get(scene_no, 0) + 1
                break
    return attempts


def _worker_scene_search_candidate_count(
    scene: dict[str, Any],
    search_payloads: list[dict[str, Any]],
) -> int:
    total = 0
    for payload in search_payloads:
        searched_query = _search_media_payload_keyword(payload)
        if searched_query and _scene_queries_match(scene.get("query"), searched_query):
            total += len(_search_media_paths_from_payload(payload))
    return total


def _worker_scene_for_search_query(worker_payload: Any, query: Any) -> dict[str, Any] | None:
    for scene in _worker_scene_asset_queries(worker_payload):
        if _scene_queries_match(scene.get("query"), query):
            return scene
    return None


def _sanitize_worker_private_search_media_args(args: dict[str, Any]) -> None:
    for key in (
        "orientation",
        "min_video_duration",
        "max_video_duration",
        "minVideoDuration",
        "maxVideoDuration",
    ):
        args.pop(key, None)
    args["video_number"] = 10
    args["photo_number"] = 0


def _enforce_worker_scene_search_attempt_limit(
    context: Any,
    store: Any,
    *,
    session_id: str,
    query: Any,
    max_attempts: int = 2,
) -> None:
    worker_payload = getattr(context, "worker_payload", None)
    if not isinstance(worker_payload, dict):
        return
    scene = _worker_scene_for_search_query(worker_payload, query)
    if not scene:
        return
    search_payloads = _load_search_media_payloads(store, session_id=session_id)
    attempts = _worker_scene_search_attempts(worker_payload, search_payloads)
    scene_no = int(scene.get("scene_no") or scene.get("sceneNo") or 0)
    current_attempts = attempts.get(scene_no, 0)
    if current_attempts >= max_attempts:
        candidate_count = _worker_scene_search_candidate_count(scene, search_payloads)
        raise ToolException(
            "scene_material_insufficient: scene search exceeded retry limit; "
            f"sceneNo={scene_no}, query={scene.get('query')}, "
            f"candidate_count={candidate_count}, "
            f"search_attempts={current_attempts}, max_attempts={max_attempts}"
        )


def _ensure_worker_scene_search_coverage(
    context: Any,
    store: Any,
    *,
    session_id: str,
) -> None:
    worker_payload = getattr(context, "worker_payload", None)
    missing = _missing_worker_scene_searches(
        worker_payload,
        _load_search_media_payloads(store, session_id=session_id),
    )
    if not missing:
        return
    first = missing[0]
    details = ", ".join(
        f"sceneNo={item.get('sceneNo')} query={item.get('query')}"
        for item in missing
    )
    raise ToolException(
        "scene_search_required: call tool search_media with args "
        f'{{"search_keyword": "{first.get("query")}"}} before continuing; '
        f"missing={details}"
    )


def _ensure_worker_required_group_count(*params: Any) -> None:
    if len(params) == 2:
        node_id = "generate_script"
        args, context = params
    elif len(params) == 3:
        node_id, args, context = params
    else:
        return
    if node_id != "generate_script" or not isinstance(args, dict):
        return
    worker_payload = getattr(context, "worker_payload", None)
    if not _worker_payload_has_locked_script(worker_payload):
        return
    scene_queries = _worker_scene_asset_queries(worker_payload)
    required_scene_count = _worker_required_scene_count(worker_payload)
    if required_scene_count <= 0:
        return
    groups = _get_nested_dict(args, "group_clips").get("groups")
    group_count = len(groups) if isinstance(groups, list) else 0
    if group_count >= required_scene_count:
        return
    missing = scene_queries[group_count:] if scene_queries else []
    details = ", ".join(
        f"sceneNo={item.get('sceneNo')} query={item.get('query')}"
        for item in missing
    )
    details_suffix = f"; missing={details}" if details else ""
    raise ToolException(
        "scene_material_insufficient: group_clips produced fewer groups than required scenes; "
        f"required_scene_count={required_scene_count}, group_count={group_count}{details_suffix}"
    )


def _annotate_worker_scene_search_result(
    tool_result: dict[str, Any],
    request: MCPToolCallRequest,
) -> None:
    if request.name != "search_media":
        return
    client_ctx = request.runtime.context
    worker_payload = getattr(client_ctx, "worker_payload", None)
    if not isinstance(worker_payload, dict):
        return
    args = getattr(request, "args", {}) or {}
    query = ""
    if isinstance(args, dict):
        query = str(args.get("search_keyword") or args.get("query") or "").strip()
    payload = tool_result.get("tool_excute_result")
    if not isinstance(payload, dict):
        return
    paths = _search_media_paths_from_payload(payload)
    scene_index = None
    scene_no = None
    normalized_query = _normalize_scene_query(query)
    for scene_query in _worker_scene_asset_queries(worker_payload):
        if _normalize_scene_query(scene_query["query"]) == normalized_query:
            scene_index = scene_query["index"]
            scene_no = scene_query["scene_no"]
            break
    payload["_worker_scene_search"] = {
        "scene_index": scene_index,
        "scene_no": scene_no,
        "query": query,
        "normalized_query": normalized_query,
        "result_count": len(paths),
        "media_paths": paths,
    }


def _worker_payload_preserves_talking_head_original_audio(worker_payload: Any) -> bool:
    if not isinstance(worker_payload, dict):
        return False
    production_config = worker_payload.get("production_config")
    if not isinstance(production_config, dict):
        return False
    render = production_config.get("render")
    if not isinstance(render, dict):
        return False
    return bool(
        render.get("preserve_talking_head_original_audio")
        or render.get("preserveTalkingHeadOriginalAudio")
    )


def _force_mute_source_audio_for_talking_head(args: dict[str, Any], context: Any) -> None:
    worker_payload = getattr(context, "worker_payload", None)
    if not _worker_payload_voiceover_enabled(worker_payload):
        return
    if not _worker_payload_is_talking_head(worker_payload):
        return
    if _worker_payload_preserves_talking_head_original_audio(worker_payload):
        args["include_video_audio"] = True
        args["video_volume_scale"] = args.get("video_volume_scale", 1)
        args["audio_policy"] = "preserve_talking_head_original_audio_with_voiceover"
        return

    args["include_video_audio"] = False
    args["video_volume_scale"] = 0
    args["audio_policy"] = "mute_source_for_talking_head_voiceover"


def _ensure_lip_sync_render_input(args: dict[str, Any], context: Any) -> None:
    worker_payload = getattr(context, "worker_payload", None)
    if not _worker_payload_lip_sync_enabled(worker_payload):
        return
    lip_sync = args.get("lip_sync")
    if not isinstance(lip_sync, dict):
        raise ToolException(
            "render_video requires lip_sync output when production_config.lip_sync.enabled is true"
        )
    if not lip_sync.get("plan_timeline") and not lip_sync.get("tracks"):
        raise ToolException(
            "render_video requires retalked lip_sync.plan_timeline before rendering"
        )


def _reject_worker_filter_clips_fallback(node_id: str, args: Any, context: Any) -> None:
    if node_id != "filter_clips":
        return
    worker_payload = getattr(context, "worker_payload", None)
    if not isinstance(worker_payload, dict):
        return
    mode = "auto"
    if isinstance(args, dict):
        mode = str(args.get("mode", "auto") or "auto").strip().lower()
    if mode == "auto":
        return
    raise ToolException(
        "Worker video-edit jobs must not run filter_clips in skip/default mode; "
        "model clip filtering must complete successfully or fail the job."
    )


def should_inline_media_as_base64(server_cfg=None) -> bool:
    """
    Whether to inline media as base64 in MCP requests.
    - inline_media "always" -> True (base64); "never" -> False (path-only); "auto" -> by connect_host.
    - In "auto": connect_host in 127.0.0.1/localhost/::1/0.0.0.0 -> False (path-only), else True (base64).
    """
    if server_cfg is None:
        return False
    try:
        mcp = getattr(server_cfg, "local_mcp_server", None)
        if mcp is None:
            return False
        mode = getattr(mcp, "inline_media", "auto")
        if mode == "always":
            return True
        if mode == "never":
            return False
        # auto
        host = (getattr(mcp, "connect_host", None) or "").strip().lower()
        if not host:
            return False
        return host not in _LOCAL_CONNECT_HOSTS
    except Exception:
        return False


def compress_payload_to_base64(payload: Dict[str, List[Any]], server_cfg=None):
    """Convert path-only items to base64 when in remote MCP mode. No-op for local mode."""
    if not isinstance(payload, dict):
        return payload
    if not should_inline_media_as_base64(server_cfg):
        return payload
    for key, value in payload.items():
        if isinstance(value, list) and all([isinstance(item, dict) for item in value]):
            for item in value:
                if 'path' in item.keys():
                    path = item['path']
                    compress_data = FileCompressor.compress_and_encode(path)
                    item.update({
                        "path": path,
                        "base64": compress_data.base64,
                        "md5": compress_data.md5
                    })
        elif isinstance(value, dict):
            compress_payload_to_base64(value, server_cfg)

class ToolInterceptor:

    @staticmethod
    async def inject_media_content_before(
        request: MCPToolCallRequest,
        handler,
    ):
        try:
            tool_call_type = request.args.get('tool_call_type', 'auto')
            # for default tool call
            if tool_call_type!= 'auto':
                request.args = request.args.get('args', {})

            runtime = request.runtime
            context = runtime.context
            store = runtime.store
            session_id = context.session_id
            node_id = request.name
            lang = context.lang
            artifact_id = store.generate_artifact_id(node_id)
            meta_collector: NodeManager = context.node_manager
            input_data = defaultdict(list)

            client_cfg = getattr(context, "cfg", None)
            inline_base64 = should_inline_media_as_base64(client_cfg)

            def load_collected_data(collected_node, input_data, store):
                """Load collected node data"""
                for collect_kind, artifact_meta in collected_node.items():
                    _, prior_node_output = store.load_result(artifact_meta.artifact_id)
                    compress_payload_to_base64(prior_node_output['payload'], client_cfg)
                    input_data[collect_kind] = prior_node_output['payload']

            if node_id == 'load_media':
                _ensure_worker_scene_search_coverage(
                    context,
                    store,
                    session_id=session_id,
                )
                input_data['inputs'] = []
                seen_paths: set = set()
                media_dir = Path(context.media_dir)
                try:
                    project_media_root = Path(client_cfg.project.media_dir).resolve()
                except Exception:
                    project_media_root = None
                for file_name in os.listdir(media_dir):
                    path = media_dir / file_name
                    if path.is_dir():
                        continue
                    if inline_base64:
                        rel_path = str(path.relative_to(os.getcwd()))
                        compress_data = FileCompressor.compress_and_encode(path)
                        input_data['inputs'].append({
                            "path": rel_path,
                            "base64": compress_data.base64,
                            "md5": compress_data.md5,
                        })
                    else:
                        # Path-only (local):
                        # - Prefer a path relative to project.media_dir (server contract) when possible.
                        # - Otherwise, fall back to absolute path (e.g. FastAPI session subdir is outside project.media_dir).
                        abs_path = path.resolve()
                        rel_or_abs: str
                        if project_media_root is not None:
                            try:
                                rel_or_abs = str(abs_path.relative_to(project_media_root))
                            except ValueError:
                                rel_or_abs = str(abs_path)
                        else:
                            rel_or_abs = str(abs_path)

                        if rel_or_abs not in seen_paths:
                            seen_paths.add(rel_or_abs)
                            asset_metadata = _worker_input_metadata_for_path(context, abs_path)
                            input_data['inputs'].append({
                                "path": rel_or_abs,
                                "orig_path": rel_or_abs,
                                "orig_md5": None,
                                **asset_metadata,
                            })
                # Path-only mode: include all auto-searched media from .storyline/.server_cache so they are readable
                if not inline_base64:
                    for search_payload in _load_search_media_payloads(
                        store,
                        session_id=session_id,
                    ):
                        paths = search_payload.get('search_media') or []
                        for p in paths:
                            # search_media returns a list of {"path": "..."} dicts (and may
                            # also return list[str] in older versions); support both.
                            if isinstance(p, dict):
                                p = p.get("path")
                            if not p or not isinstance(p, str):
                                continue
                            norm = str(Path(p).resolve()) if not os.path.isabs(p) else p
                            if norm in seen_paths:
                                continue
                            seen_paths.add(norm)
                            input_data['inputs'].append({
                                "path": p,
                                "orig_path": p,
                                "orig_md5": None,
                            })
            elif node_id in list(meta_collector.id_to_tool.keys()):
                if node_id != "search_media":
                    _ensure_worker_scene_search_coverage(
                        context,
                        store,
                        session_id=session_id,
                    )
                # 1. Determine execution mode and dependency requirements
                _reject_worker_filter_clips_fallback(node_id, request.args, context)
                is_skip_mode = request.args.get('mode', 'auto') != 'auto'
                require_kind = (
                    meta_collector.id_to_default_require_prior_kind[node_id]
                    if is_skip_mode
                    else meta_collector.id_to_require_prior_kind[node_id]
                )
                require_kind = _with_disabled_optional_kinds_removed(require_kind, node_id, context)

                # 2. Check if node is executable
                collect_result = meta_collector.check_excutable(session_id, store, require_kind)
                load_collected_data(collect_result['collected_node'], input_data, store)

                # 3. Handle missing dependencies
                if not collect_result['excutable']:
                    missing_kinds = collect_result['missing_kind']
                    node_ids_missing = [
                        meta_collector.kind_to_node_ids[kind][0]
                        for kind in missing_kinds
                    ]

                    logger.info(
                        f"`{node_id}` require kind missing `{missing_kinds}`, "
                        f"need to execute prerequisite nodes: {node_ids_missing}"
                    )

                    # 4. Recursively execute missing predecessor nodes
                    async def execute_missing_dependencies(
                        missing_kinds: List[str],
                        for_node_id: str,
                        depth: int = 0
                    ):
                        """
                        Recursively execute missing dependency nodes

                        Args:
                            missing_kinds: List of missing dependency types
                            for_node_id: ID of the node currently resolving dependencies
                            depth: Recursion depth (used for log indentation)
                        """

                        if not missing_kinds:
                            return

                        indent = "  " * depth
                        logger.info(f"{indent}├─ Resolving dependencies for `{for_node_id}`: {missing_kinds}")

                        for kind in missing_kinds:
                            success = False
                            candidates = meta_collector.kind_to_node_ids[kind]

                            for miss_id in candidates:
                                try:
                                    await execute_node_with_default_mode(
                                        miss_id,
                                        for_node_id=for_node_id,
                                        depth=depth
                                    )
                                    logger.info(
                                        f"{indent}│  ✓ `{miss_id}` executed successfully for kind `{kind}`"
                                    )
                                    success = True
                                    break
                                except ToolException as e:
                                    logger.warning(
                                        f"{indent}│  ✗ `{miss_id}` failed: {str(e)}"
                                    )
                                    continue

                            if not success:
                                raise ToolException(
                                    f"Cannot satisfy dependency `{kind}` required by `{for_node_id}`. "
                                    f"All candidates failed: {candidates}"
                                )

                    async def execute_node_with_default_mode(
                        miss_id: str,
                        for_node_id: str,
                        depth: int = 0
                    ):
                        """
                        Execute specified node in default mode

                        Args:
                            miss_id: ID of the node to execute
                            for_node_id: ID of the parent node requesting this execution
                            depth: Recursion depth
                        """
                        indent = "  " * depth
                        logger.info(
                            f"{indent}├─ [Default Mode] Executing `{miss_id}` "
                            f"(required by `{for_node_id}`)"
                        )

                        _reject_worker_filter_clips_fallback(
                            miss_id,
                            {"mode": "default"},
                            context,
                        )

                        # Prepare tool invocation arguments
                        tool = meta_collector.get_tool(miss_id)
                        tool_call_input = {
                            'artifact_id': store.generate_artifact_id(miss_id),
                            'mode': 'default'
                        }

                        # Verify dependencies for this node
                        default_require = _with_disabled_optional_kinds_removed(
                            meta_collector.id_to_default_require_prior_kind[miss_id],
                            miss_id,
                            context,
                        )
                        default_collect_result = meta_collector.check_excutable(
                            session_id, store, default_require
                        )
                        default_collect_result = meta_collector.check_excutable(session_id, store, default_require)

                        # Recursively process dependencies
                        if default_collect_result['excutable']:
                            load_collected_data(
                                default_collect_result['collected_node'],
                                tool_call_input,
                                store
                            )
                            if miss_id == "generate_script":
                                _inject_locked_custom_script(tool_call_input, context)
                            _ensure_worker_required_group_count(
                                miss_id,
                                tool_call_input,
                                context,
                            )
                            logger.debug(f"{indent}│  Dependencies satisfied for `{miss_id}`")
                        else:
                            logger.info(
                                f"{indent}│  `{miss_id}` has missing dependencies: "
                                f"{default_collect_result['missing_kind']}"
                            )
                            await execute_missing_dependencies(
                                default_collect_result['missing_kind'],
                                for_node_id=miss_id,  # Pass miss node_id here
                                depth=depth + 1  # Increment recursion depth
                            )

                        # Invoke the tool
                        try:
                            output = await tool.arun(
                                ToolCall(
                                    args=tool_call_input,
                                    tool_call_type='default',
                                    runtime=runtime
                                )
                            )
                            logger.info(f"{indent}└─ ✓ `{miss_id}` completed successfully")
                            return output
                        except Exception as e:
                            logger.error(f"{indent}└─ ✗ `{miss_id}` execution failed: {str(e)}")
                            raise ToolException(f"Failed to execute `{miss_id}`: {str(e)}")

                    # Start executing missing dependencies
                    await execute_missing_dependencies(missing_kinds, for_node_id=node_id)

                    # Collect dependencies again
                    collect_result = meta_collector.check_excutable(session_id, store, require_kind)
                    load_collected_data(collect_result['collected_node'], input_data, store)
                if node_id == "generate_script":
                    draft_args = {}
                    draft_args.update(request.args)
                    draft_args.update(input_data)
                    _inject_locked_custom_script(draft_args, context)
                    if "custom_script" in draft_args:
                        request.args["custom_script"] = draft_args["custom_script"]
            else:
                input_data['artifacts_dir'] = store.artifacts_dir

            new_req_args = {
                'artifact_id': artifact_id,
                'lang': lang,
            }
            new_req_args.update(request.args)
            new_req_args.update(input_data)
            _ensure_worker_required_group_count(node_id, new_req_args, context)
            if node_id == "render_video":
                _ensure_lip_sync_render_input(new_req_args, context)
                _force_mute_source_audio_for_talking_head(new_req_args, context)

            modified_request = request.override(
                args=new_req_args
            )
            return await handler(modified_request)
        except Exception as e:
            logger.error("[ToolInterceptor]"+ "".join(traceback.format_exception(e)))
            raise

    @staticmethod
    async def save_media_content_after(
        request: MCPToolCallRequest,
        handler,
    ):
        result = ""
        """End agent run when task is marked complete."""
        try:
            tool_call_result: CallToolResult = await handler(request)
            client_ctx = request.runtime.context

            result = tool_call_result.model_dump()
            raw_text = _extract_tool_result_text(result)
            try:
                tool_result = json.loads(raw_text)
            except Exception:
                if _is_storyline_node_request(request):
                    raise ValueError("Unexpected storyline tool result payload")
                tool_result = {"message": raw_text, "raw_text": raw_text}
            node_id = request.name
            tool_call_id = request.runtime.tool_call_id

            if not _is_storyline_tool_result(tool_result):
                if _is_storyline_node_request(request):
                    raise ValueError("Unexpected storyline tool result shape")
                return _generic_tool_command(tool_result, tool_call_id)

            _annotate_worker_scene_search_result(tool_result, request)

            artifact_id = tool_result['artifact_id']
            session_id = client_ctx.session_id

            store = request.runtime.store

            if not tool_result['isError']:
                if node_id == 'search_media':
                    store.save_result(
                        session_id,
                        node_id,
                        tool_result,
                        Path(client_ctx.media_dir),
                    )
                else:
                    store.save_result(
                        session_id,
                        node_id,
                        tool_result,
                    )
            if node_id == 'read_node_history':
                tool_excute_result = tool_result['tool_excute_result']
            else:
                tool_excute_result = {}

            return Command(
                update={
                    "messages": [
                        ToolMessage(content={
                            'summary': {
                                'node_summary': tool_result['summary'],
                                'tool_excute_result': tool_excute_result
                            },
                            'isError': tool_result['isError']
                        }, tool_call_id=tool_call_id)
                    ],
                    "status": "done"
                },
            )
        except Exception as e:
            logger.error("[ToolInterceptor]"+ "".join(traceback.format_exception(e)))
            logger.error(f"Tool Call result: {result}")
            raise

    @staticmethod
    async def _inject_provider_config(
        request,
        handler,
        *,
        tool_name_keyword: str,
        context_attr: str,
        default_provider: str | None = None,
    ):
        try:
            tool_name = str(getattr(request, "name", "") or "")
            args = getattr(request, "args", None)

            if tool_name_keyword in tool_name and isinstance(args, dict):
                runtime = getattr(request, "runtime", None)
                ctx = getattr(runtime, "context", None) if runtime else None
                provider_cfg_all = getattr(ctx, context_attr, None) if ctx else None
                if isinstance(provider_cfg_all, dict):
                    provider = str(provider_cfg_all.get("provider") or "").strip().lower()
                    if not provider:
                        if default_provider:
                            args.setdefault("provider", default_provider)
                    else:
                        args.setdefault("provider", provider)

                        provider_cfg = provider_cfg_all.get(provider)
                        if isinstance(provider_cfg, dict):
                            provider_keys = args.setdefault("provider_keys", {})
                            if not isinstance(provider_keys, dict):
                                provider_keys = {}
                                args["provider_keys"] = provider_keys
                            for key, value in provider_cfg.items():
                                if value is None:
                                    continue
                                normalized = value.strip() if isinstance(value, str) else value
                                args.setdefault(key, normalized)
                                provider_keys.setdefault(key, normalized)
                        fallback_provider = str(
                            provider_cfg_all.get("fallback_provider") or ""
                        ).strip().lower()
                        fallback_cfg = provider_cfg_all.get(fallback_provider)
                        if fallback_provider and isinstance(fallback_cfg, dict):
                            args.setdefault("fallback_provider", fallback_provider)
                            args.setdefault(fallback_provider, fallback_cfg)
        except Exception as e:
            logger.warning(f"Failed to inject provider config ({context_attr}): {e}")

        return await handler(request)


    @staticmethod
    async def inject_tts_config(request: MCPToolCallRequest, handler):
        """
        Interceptor: Injects runtime.context.tts_config parameters into request.args before invoking voiceover/TTS tools.
        - tts_config: {"provider": "bytedance", "bytedance": {...}, "azure": {...}, ...}
        """
        return await ToolInterceptor._inject_provider_config(
            request,
            handler,
            tool_name_keyword="voiceover",
            context_attr="tts_config",
            default_provider=None,
        )

    @staticmethod
    async def inject_ai_transition_config(request: MCPToolCallRequest, handler):
        """
        Interceptor: Injects runtime.context.ai_transition_config parameters into request.args
        before invoking AI transition tools.
        - ai_transition_config: {"provider": "dashscope", "dashscope": {...}, ...}
        """
        return await ToolInterceptor._inject_provider_config(
            request,
            handler,
            tool_name_keyword="generate_ai_transition",
            context_attr="ai_transition_config",
        )

    @staticmethod
    async def inject_asr_config(request: MCPToolCallRequest, handler):
        """
        Interceptor: Injects runtime.context.asr_config parameters into request.args
        before invoking the ASR node.
        - asr_config: {"provider": "aliyun_paraformer", "aliyun_paraformer": {...}}
        """
        runtime = getattr(request, "runtime", None)
        ctx = getattr(runtime, "context", None) if runtime else None
        if ctx is not None:
            _assert_original_audio_asr_config(ctx)

        return await ToolInterceptor._inject_provider_config(
            request,
            handler,
            tool_name_keyword="local_asr",
            context_attr="asr_config",
        )

    @staticmethod
    async def inject_lip_sync_config(request: MCPToolCallRequest, handler):
        """
        Interceptor: Injects runtime.context.lip_sync_config parameters into lip_sync.
        - lip_sync_config: {"provider": "aliyun_videoretalk", "aliyun_videoretalk": {...}}
        """
        return await ToolInterceptor._inject_provider_config(
            request,
            handler,
            tool_name_keyword="lip_sync",
            context_attr="lip_sync_config",
        )

    @staticmethod
    async def inject_pexels_api_key(request: MCPToolCallRequest, handler):
        """
        Interceptor: Injects runtime.context Pexels config into request.args before invoking media search tools.
        - Worker jobs must provide both a merchant-scoped private base URL and API key.
        - Non-worker interactive runs keep the original config/env fallback behavior.
        """
        try:
            tool_name = str(getattr(request, "name", "") or "")
            args = getattr(request, "args", None)

            if isinstance(args, dict) and "search_media" in tool_name:
                runtime = getattr(request, "runtime", None)
                ctx = getattr(runtime, "context", None) if runtime else None
                key = getattr(ctx, "pexels_api_key", None) if ctx else None
                key = str(key or "").strip()
                base_url = getattr(ctx, "pexels_base_url", None) if ctx else None
                base_url = str(base_url or "").strip()
                worker_payload = getattr(ctx, "worker_payload", None) if ctx else None
                if isinstance(worker_payload, dict):
                    merchant_id = str(worker_payload.get("merchant_id") or "").strip()
                    expected_suffix = f"/merchants/{merchant_id}" if merchant_id else ""
                    if not key or not base_url:
                        raise ToolException(
                            "worker search_media requires PRIVATE_PEXELS_BASE_URL and PRIVATE_PEXELS_API_KEY; "
                            "official Pexels fallback is disabled"
                        )
                    if not merchant_id or not base_url.rstrip("/").endswith(expected_suffix):
                        raise ToolException(
                            "worker search_media requires a merchant-scoped private Pexels base URL; "
                            "cross-merchant or official Pexels search is disabled"
                        )
                    _sanitize_worker_private_search_media_args(args)
                    store = getattr(runtime, "store", None) if runtime else None
                    session_id = getattr(ctx, "session_id", "") if ctx else ""
                    if store is not None and session_id:
                        query = args.get("search_keyword") or args.get("query")
                        _enforce_worker_scene_search_attempt_limit(
                            ctx,
                            store,
                            session_id=session_id,
                            query=query,
                        )

                if key:
                    args["pexels_api_key"] = key
                if base_url:
                    args["pexels_base_url"] = base_url

        except ToolException:
            raise
        except Exception as e:
            logger.warning(f"Failed to inject pexels API key: {e}")
        return await handler(request)
