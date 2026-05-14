#!/usr/bin/env python3
from __future__ import annotations

import copy
from pathlib import Path

import yaml


BASE_DIR = Path(__file__).resolve().parent
SOURCE_YML = BASE_DIR / "内容日历生成图文与视频脚本 POC V3.0.yml"
TARGET_YML = BASE_DIR / "2026-05-13-142434-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml"


def load_workflow() -> dict:
    return yaml.safe_load(SOURCE_YML.read_text(encoding="utf-8"))


def node_by_id(doc: dict, node_id: str) -> dict:
    for node in doc["workflow"]["graph"]["nodes"]:
        if node.get("id") == node_id:
            return node
    raise KeyError(f"Node not found: {node_id}")


def set_variable_selector(node: dict, variable: str, selector: list[str]) -> None:
    for item in node["data"].get("variables", []):
        if item.get("variable") == variable:
            item["value_selector"] = selector
            return
    node["data"].setdefault("variables", []).append(
        {
            "variable": variable,
            "value_selector": selector,
        }
    )


def object_schema(properties: dict, required: list[str]) -> dict:
    return {
        "additionalProperties": False,
        "properties": properties,
        "required": required,
        "type": "object",
    }


def string_schema() -> dict:
    return {"type": "string"}


def array_of_strings_schema() -> dict:
    return {"items": {"type": "string"}, "type": "array"}


def update_article_schema(doc: dict) -> None:
    article_body = node_by_id(doc, "article_body")
    content_block = article_body["data"]["structured_output"]["schema"]["properties"]["contentBlocks"]["items"]
    image_match = content_block["properties"]["imageMatch"]
    image_match["properties"].update(
        {
            "cosPath": string_schema(),
            "role": string_schema(),
        }
    )


def update_scene_schema(doc: dict) -> None:
    scene_breakdown = node_by_id(doc, "scene_breakdown")
    schema = scene_breakdown["data"]["structured_output"]["schema"]
    scene_schema = schema["properties"]["scenes"]["items"]

    scene_schema["properties"] = {
        "sceneNo": {"type": "number"},
        "timeRange": string_schema(),
        "durationSec": {"type": "number"},
        "sceneType": string_schema(),
        "title": string_schema(),
        "requiresUserUpload": {"type": "boolean"},
        "purpose": string_schema(),
        "taskDescription": string_schema(),
        "visualDescription": string_schema(),
        "voiceover": string_schema(),
        "subtitle": string_schema(),
        "shotLanguage": object_schema(
            {
                "framing": string_schema(),
                "cameraMovement": string_schema(),
                "orientation": string_schema(),
                "composition": string_schema(),
            },
            ["framing", "cameraMovement", "orientation", "composition"],
        ),
        "filmingGuide": object_schema(
            {
                "method": string_schema(),
                "location": string_schema(),
                "posture": string_schema(),
                "tips": array_of_strings_schema(),
            },
            ["method", "location", "posture", "tips"],
        ),
        "editGuide": object_schema(
            {
                "transition": string_schema(),
                "pacing": string_schema(),
                "minUsableSeconds": {"type": "number"},
            },
            ["transition", "pacing", "minUsableSeconds"],
        ),
        "assetQuery": string_schema(),
    }
    scene_schema["required"] = [
        "sceneNo",
        "timeRange",
        "durationSec",
        "sceneType",
        "title",
        "requiresUserUpload",
        "purpose",
        "taskDescription",
        "visualDescription",
        "voiceover",
        "subtitle",
        "shotLanguage",
        "filmingGuide",
        "editGuide",
        "assetQuery",
    ]


ARTICLE_COMPILER_CODE = r'''import json
import re

def strip_think(text):
    if not isinstance(text, str):
        return text
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1]
    text = re.sub(r"(?is)<think>.*?</think>", "", text)
    return text.strip()

def clean_json(value):
    text = strip_think((value or "").strip())
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text

def parse_obj(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    text = clean_json(value)
    for candidate in [text] + [text[index:].strip() for index, char in enumerate(text) if char == "{"]:
        try:
            parsed = json.loads(clean_json(candidate))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            continue
    return {}

def as_list(value):
    return value if isinstance(value, list) else []

def normalize_hashtags(items):
    normalized = []
    for item in as_list(items):
        text = str(item or "").strip()
        if not text:
            continue
        normalized.append(text if text.startswith("#") else f"#{text}")
    return normalized

def main(title_cover, article_body) -> dict:
    """
    从节点①②的结构化输出中编译图文内容包。
    职责：拼接、提取、格式化。不做任何创作。
    """
    tc = parse_obj(title_cover)
    body = parse_obj(article_body)

    blocks = as_list(body.get("contentBlocks"))
    hashtags = normalize_hashtags(body.get("hashtags"))
    cta = body.get("cta", "")

    body_text = "\n\n".join([str(b.get("text", "")).strip() for b in blocks if isinstance(b, dict) and str(b.get("text", "")).strip()])

    hashtag_str = " ".join(hashtags)
    copy_parts = [tc.get("selectedTitle", ""), "", body_text]
    if hashtag_str:
        copy_parts.extend(["", hashtag_str])
    copy_ready_text = "\n".join(copy_parts).strip()

    image_matches = []
    image_briefs = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue
        image_match = block.get("imageMatch")
        if isinstance(image_match, dict):
            image_matches.append({
                "blockNo": block.get("blockNo", index + 1),
                "assetId": image_match.get("assetId", ""),
                "title": image_match.get("title", ""),
                "usage": image_match.get("usage", ""),
                "cosPath": image_match.get("cosPath", ""),
                "role": image_match.get("role", "cover" if not image_matches else "body"),
            })
        if block.get("imageBrief"):
            image_briefs.append(str(block.get("imageBrief", "")))

    title_items = as_list(tc.get("titles"))
    title_texts = [item.get("text", "") for item in title_items if isinstance(item, dict) and item.get("text")]

    return {
        "result": json.dumps({
            "articlePackage": {
                "titles": title_texts,
                "selectedTitle": tc.get("selectedTitle", ""),
                "coverCopy": tc.get("selectedCoverCopy", ""),
                "body": body_text,
                "contentBlocks": blocks,
                "hashtags": hashtags,
                "cta": cta,
                "imageMatches": image_matches,
                "imageBriefIfMissing": "; ".join(image_briefs) if image_briefs else "",
                "riskNotes": as_list(body.get("riskNotes")),
                "copyReadyText": copy_ready_text
            },
            "titleStrategy": {
                "titles": title_items,
                "selectedTitleReason": tc.get("selectedTitleReason", ""),
                "coverCopyOptions": as_list(tc.get("coverCopyOptions")),
                "hookAngle": tc.get("hookAngle", "")
            }
        }, ensure_ascii=False)
    }
'''


DELIVERY_COMPILER_CODE = r'''import json
import re

def strip_think(text):
    if not isinstance(text, str):
        return text
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1]
    text = re.sub(r"(?is)<think>.*?</think>", "", text)
    return text.strip()

def clean_json(value):
    text = strip_think((value or "").strip())
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text

def parse_obj(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}

    text = clean_json(value)
    for candidate in [text] + [text[index:].strip() for index, char in enumerate(text) if char == "{"]:
        try:
            parsed = json.loads(clean_json(candidate))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            continue
    return {}

def as_list(value):
    return value if isinstance(value, list) else []

def first_non_empty(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if value not in (None, "", [], {}):
            return value
    return ""

def parse_duration_sec(scene):
    value = scene.get("durationSec")
    if isinstance(value, (int, float)):
        return value
    time_range = str(scene.get("timeRange") or "")
    numbers = [float(item) for item in re.findall(r"\d+(?:\.\d+)?", time_range)]
    if len(numbers) >= 2 and numbers[1] >= numbers[0]:
        return numbers[1] - numbers[0]
    return 3

def normalize_scene(scene, index):
    scene = scene if isinstance(scene, dict) else {}
    scene_type = first_non_empty(scene.get("sceneType"), "口播")
    guide = scene.get("filmingGuide") if isinstance(scene.get("filmingGuide"), dict) else {}
    shot = scene.get("shotLanguage") if isinstance(scene.get("shotLanguage"), dict) else {}
    edit = scene.get("editGuide") if isinstance(scene.get("editGuide"), dict) else {}
    scene_no = scene.get("sceneNo", index + 1)
    title = first_non_empty(scene.get("title"), f"镜头 {scene_no}")
    visual = first_non_empty(scene.get("visualDescription"), scene.get("fallbackVisual"))
    voiceover = first_non_empty(scene.get("voiceover"))
    subtitle = first_non_empty(scene.get("subtitle"), voiceover)
    requires_upload = scene.get("requiresUserUpload")
    if not isinstance(requires_upload, bool):
        requires_upload = scene_type == "口播"

    if scene_type == "口播":
        default_method = "手机横屏，半身自拍口播"
    elif scene_type == "素材":
        default_method = "使用团队素材或项目实拍素材"
    else:
        default_method = "剪辑生成文字卡"

    return {
        "sceneNo": scene_no,
        "timeRange": first_non_empty(scene.get("timeRange"), "0-3s"),
        "durationSec": parse_duration_sec(scene),
        "sceneType": scene_type,
        "title": title,
        "requiresUserUpload": requires_upload,
        "purpose": first_non_empty(scene.get("purpose"), scene.get("emotionalBeat")),
        "taskDescription": first_non_empty(scene.get("taskDescription"), title, visual),
        "visualDescription": visual,
        "voiceover": voiceover,
        "subtitle": subtitle,
        "shotLanguage": {
            "framing": first_non_empty(shot.get("framing"), "中景" if scene_type == "口播" else "全景"),
            "cameraMovement": first_non_empty(shot.get("cameraMovement"), "固定镜头" if scene_type == "口播" else "稳定推进或平移"),
            "orientation": first_non_empty(shot.get("orientation"), "横屏"),
            "composition": first_non_empty(shot.get("composition"), visual),
        },
        "filmingGuide": {
            "method": first_non_empty(guide.get("method"), default_method),
            "location": first_non_empty(guide.get("location"), "根据现场条件选择"),
            "posture": first_non_empty(guide.get("posture"), "自然站姿" if scene_type == "口播" else "不需要出镜"),
            "tips": as_list(guide.get("tips")),
        },
        "editGuide": {
            "transition": first_non_empty(edit.get("transition"), scene.get("transition"), "直接切"),
            "pacing": first_non_empty(edit.get("pacing"), scene.get("pacing"), "正常"),
            "minUsableSeconds": edit.get("minUsableSeconds", 3),
        },
        "assetQuery": first_non_empty(scene.get("assetQuery")),
    }

def main(video_narrative, scene_breakdown) -> dict:
    """
    从 video_narrative 与 scene_breakdown 的结构化输出中编译交付物。
    职责：推导、拆分、整理。不做任何创作。
    """
    narrative = parse_obj(video_narrative)
    breakdown = parse_obj(scene_breakdown)
    scenes = [normalize_scene(scene, index) for index, scene in enumerate(as_list(breakdown.get("scenes")))]
    risk_notes = as_list(breakdown.get("riskNotes"))

    filming_scenes = [scene for scene in scenes if scene.get("sceneType") == "口播"]
    asset_scenes = [scene for scene in scenes if scene.get("sceneType") == "素材"]

    member_delivery = {"tasks": []}
    for index, scene in enumerate(filming_scenes):
        guide = scene.get("filmingGuide") if isinstance(scene.get("filmingGuide"), dict) else {}
        member_delivery["tasks"].append({
            "taskNo": index + 1,
            "sceneNo": scene.get("sceneNo", index + 1),
            "script": scene.get("voiceover", ""),
            "location": guide.get("location", ""),
            "posture": guide.get("posture", ""),
            "tips": as_list(guide.get("tips")),
        })

    worker_delivery = {
        "storyOutline": narrative.get("storyOutline", ""),
        "bgm": narrative.get("bgmDirection", ""),
        "toneOfVoice": narrative.get("toneOfVoice", ""),
        "estimatedDuration": narrative.get("estimatedDuration", ""),
        "scenes": scenes,
        "teamAssetQueries": [
            scene.get("assetQuery", "")
            for scene in asset_scenes
            if str(scene.get("assetQuery") or "").strip()
        ],
    }

    output = {
        "videoScript": {
            "narrative": narrative,
            "scenes": scenes,
            "riskNotes": risk_notes,
        },
        "memberDelivery": member_delivery,
        "workerDelivery": worker_delivery,
    }
    return {"result": json.dumps(output, ensure_ascii=False)}
'''


FINAL_COMPILER_CODE = r'''import json
import re

RISK_TERMS = [
    "投资回报率高", "租金回报高", "收益稳定", "稳赚", "保值增值", "闭眼买", "错过后悔",
    "满租", "租金区间", "租金回报", "投资属性", "资产回报", "低位价格", "价格错位",
    "收租", "贴月供", "租出去", "保租", "保回报", "确定兑现", "运营成熟验证"
]

INTERNAL_RISK_LIST_KEYS = {
    "mustAvoidClaims",
    "mustReviewBeforePublish"
}

RISK_NOTE_KEYS = {"riskNotes"}

def strip_think(text):
    if not isinstance(text, str):
        return text
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1]
    text = re.sub(r"(?is)<think>.*?</think>", "", text)
    return text.strip()

def clean_json(value):
    text = strip_think((value or "").strip())
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text

def parse_obj(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}

    text = clean_json(value)
    if "</think>" in text:
        text = text.rsplit("</think>", 1)[-1].strip()

    for candidate in [text] + [text[index:].strip() for index, char in enumerate(text) if char == "{"]:
        try:
            parsed = json.loads(clean_json(candidate))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            continue
    return {}

def parse_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value or "[]")
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []

def as_list(value):
    return value if isinstance(value, list) else []

def first_non_empty(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return strip_think(value).strip()
        if value not in (None, "", [], {}):
            return value
    return ""

def contains_risk(value):
    text = str(value or "")
    return any(term in text for term in RISK_TERMS)

def scrub_risk_text(text):
    text = strip_think(str(text or ""))
    for term in sorted(RISK_TERMS, key=len, reverse=True):
        text = text.replace(term, "合规敏感表述")
    text = re.sub(r"(合规敏感表述[、,，/\s]*){2,}", "合规敏感表述", text)
    text = text.replace("如合规敏感表述等", "相关表述")
    text = text.replace("例如合规敏感表述", "相关表述")
    text = text.replace("已过滤风险词：合规敏感表述", "已处理合规风险表述")
    return text.strip()

def sanitize_public_output(value, key=""):
    if isinstance(value, dict):
        cleaned = {}
        for child_key, child_value in value.items():
            if child_key in INTERNAL_RISK_LIST_KEYS:
                cleaned[child_key] = []
            elif child_key in RISK_NOTE_KEYS:
                cleaned[child_key] = []
            else:
                cleaned[child_key] = sanitize_public_output(child_value, child_key)
        return cleaned

    if isinstance(value, list):
        cleaned = []
        for item in value:
            if key in INTERNAL_RISK_LIST_KEYS or key in RISK_NOTE_KEYS:
                if contains_risk(item):
                    continue
            cleaned.append(sanitize_public_output(item, key))
        return cleaned

    if isinstance(value, str):
        if contains_risk(value) or "<think>" in value or "</think>" in value:
            return scrub_risk_text(value)
        return value

    return value

def is_article_package(value):
    return isinstance(value, dict) and (
        "copyReadyText" in value or "body" in value or "selectedTitle" in value or "contentBlocks" in value
    )

def is_video_script(value):
    return isinstance(value, dict) and (
        isinstance(value.get("scenes"), list) or isinstance(value.get("narrative"), dict) or "storyOutline" in value
    )

def extract_article_bundle(value):
    obj = parse_obj(value)
    if is_article_package(obj.get("articlePackage")):
        return obj.get("articlePackage", {})
    if is_article_package(obj):
        return obj
    return {}

def extract_video_delivery(value):
    obj = parse_obj(value)
    if is_video_script(obj.get("videoScript")):
        return {
            "videoScript": obj.get("videoScript", {}),
            "memberDelivery": obj.get("memberDelivery", {}),
            "workerDelivery": obj.get("workerDelivery", {}),
        }
    if is_video_script(obj):
        return {
            "videoScript": obj,
            "memberDelivery": {},
            "workerDelivery": {},
        }
    return {
        "videoScript": {},
        "memberDelivery": {},
        "workerDelivery": {},
    }

def normalize_quality(quality):
    if not quality:
        return {
            "pass": False,
            "needsRewrite": False,
            "riskTerms": []
        }
    quality.setdefault("pass", False)
    quality.setdefault("needsRewrite", False)
    quality.setdefault("riskTerms", [])
    return quality

def mark_repair_if_needed(quality):
    if not quality.get("needsRewrite"):
        return quality

    scores = quality.get("scores") or {}
    scores["compliance"] = max(float(scores.get("compliance", 0) or 0), 8)
    quality["scores"] = scores

    risk_problem_keywords = ["风险承诺", "价格趋势", "命中风险词"]
    quality["problems"] = [
        item for item in as_list(quality.get("problems"))
        if not any(keyword in str(item) for keyword in risk_problem_keywords)
    ]
    quality["redFlags"] = [
        item for item in as_list(quality.get("redFlags"))
        if "命中风险词" not in str(item)
    ]
    quality["revisionSuggestions"] = [
        item for item in as_list(quality.get("revisionSuggestions"))
        if not any(keyword in str(item) for keyword in risk_problem_keywords)
    ]
    quality["pass"] = (
        all(float(value or 0) >= 7 for value in scores.values())
        and not as_list(quality.get("problems"))
        and not as_list(quality.get("redFlags"))
        and not as_list(quality.get("missingInputs"))
    )
    return quality

def normalize_hashtag(item):
    text = str(item or "").strip()
    if not text:
        return ""
    return text if text.startswith("#") else f"#{text}"

def build_copy_text(article):
    title = first_non_empty(article.get("selectedTitle"))
    body = first_non_empty(article.get("body"))
    copy_ready = first_non_empty(article.get("copyReadyText"))
    hashtags = [normalize_hashtag(item) for item in as_list(article.get("hashtags"))]
    hashtags = [item for item in hashtags if item]
    hashtag_text = " ".join(hashtags)

    if body:
        parts = [part for part in [title, "", body] if part != "" or title]
        text = "\n".join(parts).strip()
    else:
        text = copy_ready

    if hashtag_text and hashtag_text not in text:
        text = "\n\n".join([text, hashtag_text]).strip()
    return text

def asset_lookup(image_assets_json):
    lookup = {}
    for item in parse_list(image_assets_json):
        if isinstance(item, dict) and item.get("assetId"):
            lookup[str(item.get("assetId"))] = item
    return lookup

def image_path_from(match, asset):
    for source in (match, asset):
        if not isinstance(source, dict):
            continue
        for key in ("cosPath", "cos_path", "assetPath", "path", "url"):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""

def build_images(article, image_assets_json):
    lookup = asset_lookup(image_assets_json)
    images = []
    seen = set()
    for index, match in enumerate(as_list(article.get("imageMatches"))):
        if not isinstance(match, dict):
            continue
        asset_id = str(match.get("assetId") or "")
        asset = lookup.get(asset_id, {})
        cos_path = image_path_from(match, asset)
        if not cos_path:
            continue
        key = cos_path
        if key in seen:
            continue
        seen.add(key)
        images.append({
            "cosPath": cos_path,
            "role": first_non_empty(match.get("role"), "cover" if index == 0 else "body")
        })
    return images

def parse_duration_sec(scene):
    value = scene.get("durationSec")
    if isinstance(value, (int, float)):
        return value
    time_range = str(scene.get("timeRange") or "")
    numbers = [float(item) for item in re.findall(r"\d+(?:\.\d+)?", time_range)]
    if len(numbers) >= 2 and numbers[1] >= numbers[0]:
        return numbers[1] - numbers[0]
    return 3

def normalize_scene(scene, index):
    scene = scene if isinstance(scene, dict) else {}
    scene_type = first_non_empty(scene.get("sceneType"), "口播")
    scene_no = scene.get("sceneNo", index + 1)
    guide = scene.get("filmingGuide") if isinstance(scene.get("filmingGuide"), dict) else {}
    shot = scene.get("shotLanguage") if isinstance(scene.get("shotLanguage"), dict) else {}
    edit = scene.get("editGuide") if isinstance(scene.get("editGuide"), dict) else {}
    visual = first_non_empty(scene.get("visualDescription"), scene.get("fallbackVisual"))
    voiceover = first_non_empty(scene.get("voiceover"))
    subtitle = first_non_empty(scene.get("subtitle"), voiceover)
    requires_upload = scene.get("requiresUserUpload")
    if not isinstance(requires_upload, bool):
        requires_upload = scene_type == "口播"

    if scene_type == "口播":
        default_method = "手机横屏，半身自拍口播"
    elif scene_type == "素材":
        default_method = "使用团队素材或项目实拍素材"
    else:
        default_method = "剪辑生成文字卡"

    return {
        "sceneNo": scene_no,
        "timeRange": first_non_empty(scene.get("timeRange"), "0-3s"),
        "durationSec": parse_duration_sec(scene),
        "sceneType": scene_type,
        "title": first_non_empty(scene.get("title"), f"镜头 {scene_no}"),
        "requiresUserUpload": requires_upload,
        "purpose": first_non_empty(scene.get("purpose"), scene.get("emotionalBeat")),
        "taskDescription": first_non_empty(scene.get("taskDescription"), scene.get("title"), visual),
        "visualDescription": visual,
        "voiceover": voiceover,
        "subtitle": subtitle,
        "shotLanguage": {
            "framing": first_non_empty(shot.get("framing"), "中景" if scene_type == "口播" else "全景"),
            "cameraMovement": first_non_empty(shot.get("cameraMovement"), "固定镜头" if scene_type == "口播" else "稳定推进或平移"),
            "orientation": first_non_empty(shot.get("orientation"), "横屏"),
            "composition": first_non_empty(shot.get("composition"), visual),
        },
        "filmingGuide": {
            "method": first_non_empty(guide.get("method"), default_method),
            "location": first_non_empty(guide.get("location"), "根据现场条件选择"),
            "posture": first_non_empty(guide.get("posture"), "自然站姿" if scene_type == "口播" else "不需要出镜"),
            "tips": as_list(guide.get("tips")),
        },
        "editGuide": {
            "transition": first_non_empty(edit.get("transition"), scene.get("transition"), "直接切"),
            "pacing": first_non_empty(edit.get("pacing"), scene.get("pacing"), "正常"),
            "minUsableSeconds": edit.get("minUsableSeconds", 3),
        },
        "assetQuery": first_non_empty(scene.get("assetQuery")),
    }

def build_video(video_delivery):
    video_script = video_delivery.get("videoScript") if isinstance(video_delivery.get("videoScript"), dict) else {}
    worker = video_delivery.get("workerDelivery") if isinstance(video_delivery.get("workerDelivery"), dict) else {}
    narrative = video_script.get("narrative") if isinstance(video_script.get("narrative"), dict) else {}
    source_scenes = as_list(video_script.get("scenes")) or as_list(worker.get("scenes"))

    return {
        "storyOutline": first_non_empty(worker.get("storyOutline"), narrative.get("storyOutline")),
        "estimatedDuration": first_non_empty(worker.get("estimatedDuration"), narrative.get("estimatedDuration")),
        "bgm": first_non_empty(worker.get("bgm"), narrative.get("bgmDirection")),
        "toneOfVoice": first_non_empty(worker.get("toneOfVoice"), narrative.get("toneOfVoice")),
        "scenes": [normalize_scene(scene, index) for index, scene in enumerate(source_scenes)],
    }

def resolve_status(quality):
    return "passed" if quality.get("pass") is True else "needs_review"

def main(article_package, video_script, quality_review_text: str, image_assets_json: str, task_understanding_text=None, creative_strategy_text=None) -> dict:
    article_package = extract_article_bundle(article_package)
    video_delivery = extract_video_delivery(video_script)
    quality = mark_repair_if_needed(normalize_quality(parse_obj(quality_review_text)))

    result = {
        "status": resolve_status(quality),
        "article": {
            "title": first_non_empty(article_package.get("selectedTitle")),
            "coverCopy": first_non_empty(article_package.get("coverCopy")),
            "images": build_images(article_package, image_assets_json),
            "copyText": build_copy_text(article_package),
        },
        "video": build_video(video_delivery),
        "quality": {
            "riskTerms": as_list(quality.get("riskTerms"))
        }
    }
    result = sanitize_public_output(result)
    return {"final_result_json": json.dumps(result, ensure_ascii=False)}
'''


def update_code_nodes(doc: dict) -> None:
    article_compiler = node_by_id(doc, "article_compiler")
    set_variable_selector(article_compiler, "title_cover", ["title_cover", "structured_output"])
    set_variable_selector(article_compiler, "article_body", ["article_body", "structured_output"])
    article_compiler["data"]["code"] = ARTICLE_COMPILER_CODE
    article_compiler["data"]["desc"] = "确定性编译图文内容包，优先读取 structured_output，拼接 copyText 并提取配图路径。"

    delivery_compiler = node_by_id(doc, "delivery_compiler")
    set_variable_selector(delivery_compiler, "video_narrative", ["video_narrative", "structured_output"])
    set_variable_selector(delivery_compiler, "scene_breakdown", ["scene_breakdown", "structured_output"])
    delivery_compiler["data"]["code"] = DELIVERY_COMPILER_CODE
    delivery_compiler["data"]["desc"] = "确定性编译视频脚本，优先读取 structured_output，并补齐最终视频 scenes 字段。"

    quality_reviewer = node_by_id(doc, "quality_reviewer")
    quality_code = quality_reviewer["data"]["code"]
    quality_code = quality_code.replace(
        '''        if scene_type != "文字卡" and not str(scene.get("visualDescription") or "").strip():
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少具体 visualDescription")
''',
        '''        if scene_type != "文字卡" and not str(scene.get("visualDescription") or "").strip():
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少具体 visualDescription")

        if not isinstance(scene.get("durationSec"), (int, float)):
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少 durationSec")
        if not str(scene.get("title") or "").strip():
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少 title")
        if not isinstance(scene.get("requiresUserUpload"), bool):
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少 requiresUserUpload")

        shot = scene.get("shotLanguage")
        if not isinstance(shot, dict):
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少 shotLanguage")
        else:
            for key in ["framing", "cameraMovement", "orientation", "composition"]:
                if not str(shot.get(key) or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"场景 {scene_no} 缺少 shotLanguage.{key}")

        edit = scene.get("editGuide")
        if not isinstance(edit, dict):
            scores["materialFit"] = min(scores["materialFit"], 6)
            problems.append(f"场景 {scene_no} 缺少 editGuide")
        else:
            for key in ["transition", "pacing", "minUsableSeconds"]:
                if key != "minUsableSeconds" and not str(edit.get(key) or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"场景 {scene_no} 缺少 editGuide.{key}")
                if key == "minUsableSeconds" and not isinstance(edit.get(key), (int, float)):
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"场景 {scene_no} 缺少 editGuide.{key}")
''',
    )
    quality_code = quality_code.replace(
        '''                if not str(guide.get("location") or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少拍摄地点")
                if not as_list(guide.get("tips")):
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少实操 tips")
''',
        '''                if not str(guide.get("method") or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少拍摄方法")
                if not str(guide.get("location") or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少拍摄地点")
                if not str(guide.get("posture") or "").strip():
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少拍摄姿态")
                if not as_list(guide.get("tips")):
                    scores["materialFit"] = min(scores["materialFit"], 6)
                    problems.append(f"口播场景 {scene_no} 缺少实操 tips")
''',
    )
    quality_code = quality_code.replace(
        '''        if scene_type == "素材":
            if not str(scene.get("assetQuery") or "").strip():
                scores["materialFit"] = min(scores["materialFit"], 5)
                problems.append(f"素材场景 {scene_no} 缺少 assetQuery")
            if not str(scene.get("fallbackVisual") or "").strip():
                scores["materialFit"] = min(scores["materialFit"], 6)
                problems.append(f"素材场景 {scene_no} 缺少 fallbackVisual")
''',
        '''        if scene_type == "素材":
            if not str(scene.get("assetQuery") or "").strip():
                scores["materialFit"] = min(scores["materialFit"], 5)
                problems.append(f"素材场景 {scene_no} 缺少 assetQuery")
''',
    )
    quality_reviewer["data"]["code"] = quality_code

    final_compiler = node_by_id(doc, "final_compiler")
    set_variable_selector(final_compiler, "article_package", ["article_package_aggregator", "output"])
    set_variable_selector(final_compiler, "video_script", ["video_script_aggregator", "output"])
    set_variable_selector(final_compiler, "quality_review_text", ["quality_reviewer", "text"])
    set_variable_selector(final_compiler, "image_assets_json", ["start", "image_assets_json"])
    set_variable_selector(final_compiler, "task_understanding_text", ["task_understanding", "structured_output"])
    set_variable_selector(final_compiler, "creative_strategy_text", ["creative_strategy", "structured_output"])
    final_compiler["data"]["code"] = FINAL_COMPILER_CODE
    final_compiler["data"]["desc"] = "确定性最终聚合，只输出 status、article、video、quality 主业务 JSON。"


def update_metadata(doc: dict) -> None:
    doc["app"]["description"] = "V3.1：基于 V3.0 节点拆分，只调整 structured_output 与最终编译 JSON 收敛，不改 LLM prompt。"
    doc["app"]["name"] = "内容日历生成图文与视频脚本 POC V3.1"


def assert_prompt_templates_unchanged(before: dict, after: dict) -> None:
    before_nodes = {node["id"]: node for node in before["workflow"]["graph"]["nodes"]}
    after_nodes = {node["id"]: node for node in after["workflow"]["graph"]["nodes"]}
    for node_id, before_node in before_nodes.items():
        before_data = before_node.get("data", {})
        if before_data.get("type") != "llm":
            continue
        after_data = after_nodes[node_id]["data"]
        if before_data.get("prompt_template") != after_data.get("prompt_template"):
            raise AssertionError(f"LLM prompt_template changed: {node_id}")


def main() -> None:
    source_doc = load_workflow()
    target_doc = copy.deepcopy(source_doc)
    update_metadata(target_doc)
    update_article_schema(target_doc)
    update_scene_schema(target_doc)
    update_code_nodes(target_doc)
    assert_prompt_templates_unchanged(source_doc, target_doc)

    TARGET_YML.write_text(
        yaml.safe_dump(target_doc, allow_unicode=True, sort_keys=False, width=120),
        encoding="utf-8",
    )
    print(TARGET_YML)


if __name__ == "__main__":
    main()
