from typing import Any, Dict
import re

from open_storyline.nodes.core_nodes.base_node import BaseNode, NodeMeta
from open_storyline.nodes.node_state import NodeState
from open_storyline.nodes.node_schema import GenerateScriptInput
from src.open_storyline.utils.prompts import get_prompt
from open_storyline.utils.parse_json import parse_json_dict
from open_storyline.utils.register import NODE_REGISTRY

@NODE_REGISTRY.register()
class GenerateScriptNode(BaseNode):
    meta = NodeMeta(
        name="generate_script",
        description="Generate video script/copy that can be used to synthesize voice-over or be directly applied as video subtitles"\
            "Support lyrical, humorous, and casual styles, and consider using the `subtitle_imitation_skill` for special styles.",
        node_id="generate_script",
        node_kind="generate_script",
        require_prior_kind=['split_shots','group_clips','understand_clips'],
        default_require_prior_kind=['split_shots','group_clips'],
        next_available_node=['generate_voiceover'],
    )

    input_schema = GenerateScriptInput

    async def default_process(
        self,
        node_state: NodeState,
        inputs: Dict[str, Any],
    ) -> Any:
        return {
            "group_scripts": [],
            "title": "",
        }

    async def process(self, node_state: NodeState, inputs: Dict[str, Any]) -> Any:
        clip_info = inputs["split_shots"]["clips"]
        clip_captions = inputs["understand_clips"]["clip_captions"]
        overall = inputs["understand_clips"]["overall"]
        groups = inputs["group_clips"]["groups"]
        user_request = inputs["user_request"]
        llm = node_state.llm

        duration_lookup = _build_duration_lookup(clip_info)
        caption_lookup = _build_caption_lookup(clip_captions)

        group_ids: list[str] = [g.get("group_id","") for g in (groups or []) if g.get("group_id")]
        group_ids_set = set(group_ids)

        if not group_ids:
            node_state.node_summary.info_for_user("no available group, cannot generate script")
            return {"group_scripts": [], 'title': ""}

        locked_script = _extract_locked_script_request(user_request)
        if locked_script:
            node_state.node_summary.info_for_user("Using locked script without LLM regeneration")
            return _build_locked_script_result(locked_script, groups)

        custom_script = inputs.get("custom_script", {})
        if len(custom_script) > 0:
            try:
                custom_script = _normalize_custom_script_payload(custom_script, groups)
                group_scripts = []
                subtitle_index = 1

                validate_subtitle_format(custom_script)
                edit_group_scripts = custom_script['group_scripts']
                # fill subtitle_units
                for i in range(len(edit_group_scripts)):
                    raw_text = edit_group_scripts[i]['raw_text']
                    units, subtitle_index = _make_subtitle_units(
                        raw_text=raw_text,
                        subtitle_start_index=subtitle_index,
                    )
                    group_scripts.append({
                        "group_id": edit_group_scripts[i]['group_id'],
                        "raw_text": raw_text,
                        "subtitle_units": units
                    })

                custom_script = {"group_scripts": group_scripts, "title": custom_script.get('title', '')}
                return custom_script
            except Exception as e:
                node_state.node_summary.info_for_llm(f"generate script failed: {type(e).__name__}: {e}")
                node_state.node_summary.info_for_user("custom_script format is invalid, fallback to auto generation.")

        groups_block = _build_groups_block_for_script(groups, duration_lookup, caption_lookup)

        system_prompt = get_prompt("generate_script.system", lang=node_state.lang)
        if not user_request or user_request == "":
            user_request = "No requirements"
        user_prompt = get_prompt("generate_script.user", lang=node_state.lang, user_request=user_request, overall=overall, groups=groups_block)

        await self._report_progress(
            node_state,
            0,
            1,
            f"generating script for {len(group_ids)} group(s)",
        )
        raw = await llm.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            top_p=0.9,
            max_tokens=4096,
            model_preferences=None,
            metadata=self._model_sampling_metadata("llm", minimum_seconds=180.0),
        )
        group_text_map: dict[str, str] = {}
        script_title = ""
        try:
            obj = parse_json_dict(raw)
            group_text_map = _extract_group_text_map(obj, group_ids)
            if isinstance(obj, dict):
                script_title = str(obj.get("title", "") or "")
        except Exception as e:
            node_state.node_summary.info_for_llm(f"generate script failed: {type(e).__name__}: {e}")
            group_text_map = {}

        group_scripts: list[dict[str, Any]] = []
        subtitle_index = 1

        for g in groups or []:
            gid = g.get("group_id", "")
            if not gid or gid not in group_ids_set:
                continue

            duration_sec = 0.0
            for cid in (g.get("clip_ids") or []):
                duration_sec += float(duration_lookup.get(cid, 0.0))
            budget = _estimate_script_budget(duration_sec)

            raw_text = (group_text_map.get(gid) or "").strip()
            if not raw_text:
                raise ValueError(f"LLM did not generate any content, please retry")

            max_chars = budget.get("max_chars", 60)
            if len(raw_text.split()) > int(max_chars * 2.0):
                raw_text = raw_text[:max_chars].rstrip()
                node_state.node_summary.info_for_user("The generated script was too long and has been truncated.")

            units, subtitle_index = _make_subtitle_units(
                raw_text=raw_text,
                subtitle_start_index=subtitle_index,
            )

            group_scripts.append(
                {
                    "group_id": gid,
                    "raw_text": raw_text,
                    "subtitle_units": units,
                }
            )

        await self._report_progress(
            node_state,
            1,
            1,
            f"generated script for {len(group_scripts)} group(s)",
        )
        return {
            "group_scripts": group_scripts,
            "title": script_title,
        }

def _build_duration_lookup(clip_info: list[dict[str, Any]]) -> dict[str, float]:
    """
    clip_id -> duration_sec
    """
    default_duration = 2.0 # HACK: default image second for estimate group durations
    out: dict[str, float] = {}
    for item in clip_info or []:
        cid = item.get("clip_id")
        if not cid:
            continue
        src = item.get("source_ref") or {}
        dur = src.get("duration", 0) / 1000.0
        if dur == 0.0:
            dur = default_duration
        out[cid] = dur
    return out

def _build_caption_lookup(clip_captions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """
    clip_id -> caption_obj
    """

    out: dict[str, dict[str, Any]] = {}
    for item in clip_captions:
        if not isinstance(item, dict):
            continue
        cid = item.get("clip_id")
        if cid:
            out[cid] = item
    return out

def _estimate_script_budget(duration_sec: float) -> dict[str, Any]:
    """
    Estimate word/character count budget based on total duration
    """
    if duration_sec is None:
        duration_sec = 0.0
    duration_sec = max(0.0, float(duration_sec))

    min_chars = int(round(duration_sec * 3))
    max_chars = int(round(duration_sec * 5))

    # 防止极短组变成 0
    min_chars = max(min_chars, 8)
    max_chars = max(max_chars, min_chars + 6)

    return {
        "duration_sec": duration_sec,
        "min_chars": min_chars,
        "max_chars": max_chars,
    }


def _build_groups_block_for_script(
    groups: list[dict[str, Any]],
    duration_lookup: dict[str, float],
    caption_lookup: dict[str, dict[str, Any]],
    *,
    max_caption_len: int = 120,
) -> str:
    """
    Combine groups, clip captions, and duration budget into a prompt
    for LLM to generate script for each group.
    """

    blocks: list[str] = []

    for g in groups or []:
        gid = g.get("group_id", "")
        clip_ids = g.get("clip_ids") or []
        if not gid or not isinstance(clip_ids, list) or not clip_ids:
            continue

        group_summary = (g.get("summary") or "").strip()

        # Duration per group
        duration_sec = 0.0
        for cid in clip_ids:
            duration_sec += float(duration_lookup.get(cid, 0.0))
        budget = _estimate_script_budget(duration_sec)

        lines: list[str] = []
        lines.append(f"[group_id={gid}]")
        if group_summary:
            lines.append(f"summary: {group_summary}")
        lines.append(f"duration_sec: {budget['duration_sec']:.2f}")
        lines.append(f"script_chars_budget: {budget['min_chars']}~{budget['max_chars']}")

        lines.append("clips:")
        for cid in clip_ids:
            cap_obj = caption_lookup.get(cid, {})
            cap_text = cap_obj.get("caption", "")
            sem = cap_obj.get("semantic") or {}
            kw = sem.get("keywords") or []
            mood = sem.get("mood") or []
            kw_s = "、".join([x for x in kw if isinstance(x, str)])[:40]
            mood_s = "、".join([x for x in mood if isinstance(x, str)])[:30]

            dur = duration_lookup.get(cid, 0.0)

            lines.append(f"- {cid} ({dur:.2f}s): {cap_text}")
            if kw_s or mood_s:
                lines.append(f"  tags_hint: keywords={kw_s} | mood={mood_s}")

        blocks.append("\n".join(lines))

    return "\n\n".join(blocks).strip()

def _extract_group_text_map(obj: Any, group_ids: list[str]) -> dict[str, str]:
    """
    Extract {group_id: raw_text} mapping from LLM JSON output.
    Compatible with several common output formats:
    1) {"scripts":[{"group_id":"group_0001","raw_text":"..."}, ...]}
    2) {"group_scripts":[{"group_id":"...","raw_text":"..."}, ...]}
    3) {"group_0001":"...", "group_0002":"..."}
    4) [{"group_id":"...","raw_text":"..."}]
    """
    gid_set = set(group_ids)
    out: dict[str, str] = {}

    def _add(gid: Any, text: Any):
        if isinstance(gid, str) and gid in gid_set and isinstance(text, str) and text.strip():
            out[gid] = text.strip()

    if isinstance(obj, dict):
        # List type
        for key in ("scripts", "group_scripts", "results"):
            v = obj.get(key)
            if isinstance(v, list):
                for item in v:
                    if isinstance(item, dict):
                        gid = item.get("group_id")
                        text = item.get("raw_text") or item.get("text") or item.get("script")
                        _add(gid, text)

        # Mapping type: {"group_0001":"..."}
        for gid in group_ids:
            if gid in obj and isinstance(obj[gid], str):
                _add(gid, obj[gid])

        return out

    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                gid = item.get("group_id")
                text = item.get("raw_text") or item.get("text") or item.get("script")
                _add(gid, text)
        return out

    raise ValueError("Unable to recognize LLM output structure")


_LOCKED_SCRIPT_MARKER = "Use the locked script:"


def _extract_locked_script_request(user_request: Any) -> str:
    if not isinstance(user_request, str):
        return ""
    marker_index = user_request.find(_LOCKED_SCRIPT_MARKER)
    if marker_index < 0:
        return ""
    return user_request[marker_index + len(_LOCKED_SCRIPT_MARKER):].strip()


def _build_locked_script_result(
    locked_script: str,
    groups: list[dict[str, Any]],
) -> dict[str, Any]:
    group_ids = [group.get("group_id", "") for group in groups or [] if group.get("group_id")]
    if not group_ids or not locked_script.strip():
        return {"group_scripts": [], "title": ""}

    chunks = _split_locked_script_for_groups(locked_script, len(group_ids))
    group_scripts: list[dict[str, Any]] = []
    subtitle_index = 1

    for index, group_id in enumerate(group_ids):
        raw_text = chunks[index] if index < len(chunks) else locked_script
        raw_text = raw_text.strip() or locked_script.strip()
        units, subtitle_index = _make_subtitle_units(
            raw_text=raw_text,
            subtitle_start_index=subtitle_index,
        )
        group_scripts.append(
            {
                "group_id": group_id,
                "raw_text": raw_text,
                "subtitle_units": units,
            }
        )

    return {
        "group_scripts": group_scripts,
        "title": _locked_script_title(locked_script),
    }


def _split_locked_script_for_groups(locked_script: str, group_count: int) -> list[str]:
    if group_count <= 1:
        return [locked_script.strip()]

    scene_blocks = [
        block.strip()
        for block in re.split(r"(?=Scene\s+\d+\s*\|)", locked_script)
        if block.strip()
    ]
    blocks = scene_blocks or [
        block.strip()
        for block in re.split(r"\n\s*\n+", locked_script)
        if block.strip()
    ]
    if len(blocks) < group_count:
        return [locked_script.strip() for _ in range(group_count)]

    chunks = ["" for _ in range(group_count)]
    for index, block in enumerate(blocks):
        target_index = min(index, group_count - 1)
        chunks[target_index] = "\n\n".join(
            part for part in (chunks[target_index], block) if part
        )
    return chunks


def _locked_script_title(locked_script: str) -> str:
    first_line = next(
        (line.strip() for line in locked_script.splitlines() if line.strip()),
        "",
    )
    return first_line[:80]


def _normalize_custom_script_payload(
    custom_script: dict[str, Any],
    groups: list[dict[str, Any]],
) -> dict[str, Any]:
    if not isinstance(custom_script, dict) or "group_scripts" in custom_script:
        return custom_script

    subtitle_units = custom_script.get("subtitle_units")
    if not isinstance(subtitle_units, list) or not subtitle_units:
        return custom_script

    raw_text = _subtitle_units_to_raw_text(subtitle_units)
    if not raw_text:
        return custom_script

    return {
        "title": str(custom_script.get("title") or ""),
        "group_scripts": _group_scripts_from_raw_text(raw_text, groups),
    }


def _subtitle_units_to_raw_text(subtitle_units: list[Any]) -> str:
    parts: list[str] = []
    for unit in subtitle_units:
        if not isinstance(unit, dict):
            continue
        text = unit.get("text") or unit.get("subtitle")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    return "，".join(parts)


def _group_scripts_from_raw_text(
    raw_text: str,
    groups: list[dict[str, Any]],
) -> list[dict[str, str]]:
    group_ids = [group.get("group_id", "") for group in groups or [] if group.get("group_id")]
    if not group_ids:
        return []
    chunks = _split_locked_script_for_groups(raw_text, len(group_ids))
    return [
        {
            "group_id": group_id,
            "raw_text": (chunks[index] if index < len(chunks) else raw_text).strip() or raw_text,
        }
        for index, group_id in enumerate(group_ids)
    ]


_SPLIT_RE = re.compile(r"[，,。.！!?？]+")


def _split_by_comma(raw_text: str) -> list[str]:
    """
    Comma splitting: Supports Chinese/English commas and Chinese period. Remove empty segments.
    """
    if not isinstance(raw_text, str):
        return []
    s = raw_text.strip().replace("\n", "，")
    parts = [p.strip() for p in _SPLIT_RE.split(s) if p and p.strip()]
    return parts


def _make_subtitle_units(
    raw_text: str,
    subtitle_start_index: int,
) -> tuple[list[dict[str, Any]], int]:
    """
    Generate subtitle_units for a certain group, return (units, next_global_index)
    unit_id increments globally: subtitle_0001, subtitle_0002 ...
    """
    parts = _split_by_comma(raw_text)
    if not parts and raw_text.strip():
        parts = [raw_text.strip()]

    units: list[dict[str, Any]] = []
    cur = subtitle_start_index
    for idx_in_group, text in enumerate(parts):
        units.append(
            {
                "unit_id": f"subtitle_{cur:04d}",
                "index_in_group": idx_in_group,
                "text": text,
            }
        )
        cur += 1
    return units, cur

def validate_subtitle_format(data: dict[str, Any]):
    if "group_scripts" not in data:
        raise ValueError("input missing field 'group_scripts'")

    if "title" not in data:
        raise ValueError("input missing field 'title'")
    for group in data["group_scripts"]:
        if "group_id" not in group:
            raise ValueError("group missing field 'group_id'")
        if "raw_text" not in group:
            raise ValueError("group missing field 'raw_text'")
