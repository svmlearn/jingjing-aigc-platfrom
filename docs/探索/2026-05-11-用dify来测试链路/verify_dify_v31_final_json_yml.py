#!/usr/bin/env python3
from __future__ import annotations

import inspect
import json
from pathlib import Path

import yaml


BASE_DIR = Path(__file__).resolve().parent
SOURCE_YML = BASE_DIR / "内容日历生成图文与视频脚本 POC V3.0.yml"
TARGET_YML = BASE_DIR / "2026-05-13-142434-内容日历生成图文与视频脚本-Dify工作流-V3.1-最终JSON收敛.yml"

EXPECTED_TOP_LEVEL = {"status", "article", "video", "quality"}
REMOVED_KEYS = {
    "workflowVersion",
    "articlePackage",
    "titleStrategy",
    "videoScript",
    "memberDelivery",
    "workerDelivery",
    "qualityReview",
    "trace",
    "saveHints",
    "assetId",
    "imageBriefIfMissing",
    "blocks",
    "props",
    "fallbackVisual",
    "scores",
    "debug",
}


def load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def node_by_id(doc: dict, node_id: str) -> dict:
    for node in doc["workflow"]["graph"]["nodes"]:
        if node.get("id") == node_id:
            return node
    raise AssertionError(f"missing node: {node_id}")


def assert_llm_prompts_unchanged(source: dict, target: dict) -> None:
    source_nodes = {node["id"]: node for node in source["workflow"]["graph"]["nodes"]}
    target_nodes = {node["id"]: node for node in target["workflow"]["graph"]["nodes"]}
    for node_id, source_node in source_nodes.items():
        source_data = source_node.get("data", {})
        if source_data.get("type") != "llm":
            continue
        target_data = target_nodes[node_id]["data"]
        if source_data.get("prompt_template") != target_data.get("prompt_template"):
            raise AssertionError(f"LLM prompt_template changed: {node_id}")


def assert_selector(doc: dict, node_id: str, variable: str, selector: list[str]) -> None:
    node = node_by_id(doc, node_id)
    for item in node["data"].get("variables", []):
        if item.get("variable") == variable:
            if item.get("value_selector") != selector:
                raise AssertionError(f"{node_id}.{variable} selector is {item.get('value_selector')}, expected {selector}")
            return
    raise AssertionError(f"{node_id}.{variable} selector missing")


def assert_structured_schemas(doc: dict) -> None:
    scene_schema = node_by_id(doc, "scene_breakdown")["data"]["structured_output"]["schema"]["properties"]["scenes"]["items"]
    scene_props = scene_schema["properties"]
    required_scene_fields = {
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
    }
    missing = required_scene_fields - set(scene_props)
    if missing:
        raise AssertionError(f"scene_breakdown schema missing fields: {sorted(missing)}")
    if "fallbackVisual" in scene_props:
        raise AssertionError("scene_breakdown schema still contains fallbackVisual")
    if "props" in scene_props["filmingGuide"]["properties"]:
        raise AssertionError("scene_breakdown filmingGuide schema still contains props")

    article_schema = node_by_id(doc, "article_body")["data"]["structured_output"]["schema"]
    image_match_props = article_schema["properties"]["contentBlocks"]["items"]["properties"]["imageMatch"]["properties"]
    for key in ("cosPath", "role"):
        if key not in image_match_props:
            raise AssertionError(f"article_body imageMatch schema missing {key}")


def compile_code_nodes(doc: dict) -> None:
    for node_id in ("article_compiler", "delivery_compiler", "quality_reviewer", "final_compiler"):
        code = node_by_id(doc, node_id)["data"]["code"]
        compile(code, f"<{node_id}>", "exec")


def run_final_compiler_unit(doc: dict) -> dict:
    namespace: dict = {}
    code = node_by_id(doc, "final_compiler")["data"]["code"]
    exec(compile(code, "<final_compiler>", "exec"), namespace)
    main = namespace["main"]
    signature = inspect.signature(main)
    if "image_assets_json" not in signature.parameters:
        raise AssertionError("final_compiler.main must accept image_assets_json")

    article_package = json.dumps(
        {
            "articlePackage": {
                "selectedTitle": "70平4米层高，总价友好",
                "coverCopy": "70平4米层高的家",
                "body": "预算有限，但也想住得舒服。",
                "hashtags": ["买房", "#小户型"],
                "imageMatches": [
                    {
                        "blockNo": 1,
                        "assetId": "img_001",
                        "title": "项目外立面",
                        "usage": "封面",
                    }
                ],
                "copyReadyText": "70平4米层高，总价友好\n\n预算有限，但也想住得舒服。",
            },
            "titleStrategy": {
                "titles": [],
                "selectedTitleReason": "",
            },
        },
        ensure_ascii=False,
    )
    video_script = json.dumps(
        {
            "videoScript": {
                "narrative": {
                    "storyOutline": "从预算焦虑到看到小面积空间可能性。",
                    "estimatedDuration": "60-90秒",
                    "bgmDirection": "轻盈、温暖",
                    "toneOfVoice": "亲切共情",
                },
                "scenes": [
                    {
                        "sceneNo": 1,
                        "timeRange": "0-5s",
                        "durationSec": 5,
                        "sceneType": "口播",
                        "title": "开场口播",
                        "requiresUserUpload": True,
                        "purpose": "共鸣与好奇",
                        "taskDescription": "开头直接说客户最关心的问题。",
                        "visualDescription": "中介站在小区入口附近，面对镜头自然说话。",
                        "voiceover": "70平的小户型，层高竟然有4米？",
                        "subtitle": "70平4米层高，预算有限也能看",
                        "shotLanguage": {
                            "framing": "半身口播",
                            "cameraMovement": "固定镜头",
                            "orientation": "横屏",
                            "composition": "人物站画面左侧",
                        },
                        "filmingGuide": {
                            "method": "手机横屏，半身自拍口播",
                            "location": "小区入口",
                            "posture": "站着",
                            "tips": ["手机横屏拍", "语速放慢"],
                        },
                        "editGuide": {
                            "transition": "直接切",
                            "pacing": "正常",
                            "minUsableSeconds": 3,
                        },
                        "assetQuery": "小区 入口",
                    }
                ],
            },
            "memberDelivery": {},
            "workerDelivery": {},
        },
        ensure_ascii=False,
    )
    quality = json.dumps({"pass": False, "needsRewrite": False, "riskTerms": []}, ensure_ascii=False)
    image_assets = json.dumps(
        [
            {
                "assetId": "img_001",
                "cosPath": "cos://jingjing/project/2026/05/article-cover-70m-4m.jpg",
            }
        ],
        ensure_ascii=False,
    )
    result = main(article_package, video_script, quality, image_assets, {}, {})
    return json.loads(result["final_result_json"])


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for item in value:
            yield from walk_keys(item)


def assert_final_payload(payload: dict) -> None:
    if set(payload) != EXPECTED_TOP_LEVEL:
        raise AssertionError(f"final top-level keys are {sorted(payload)}, expected {sorted(EXPECTED_TOP_LEVEL)}")

    present_removed = sorted(REMOVED_KEYS.intersection(set(walk_keys(payload))))
    if present_removed:
        raise AssertionError(f"removed fields still present in final payload: {present_removed}")

    article = payload["article"]
    for key in ("title", "coverCopy", "images", "copyText"):
        if key not in article:
            raise AssertionError(f"article missing {key}")
    if not article["images"] or set(article["images"][0]) != {"cosPath", "role"}:
        raise AssertionError("article.images[] must contain only cosPath and role")

    video = payload["video"]
    for key in ("storyOutline", "estimatedDuration", "bgm", "toneOfVoice", "scenes"):
        if key not in video:
            raise AssertionError(f"video missing {key}")
    if not video["scenes"]:
        raise AssertionError("video.scenes must not be empty in unit payload")
    scene = video["scenes"][0]
    for key in (
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
    ):
        if key not in scene:
            raise AssertionError(f"video.scenes[] missing {key}")
    for key in ("method", "location", "posture", "tips"):
        if key not in scene["filmingGuide"]:
            raise AssertionError(f"filmingGuide missing {key}")

    if set(payload["quality"]) != {"riskTerms"}:
        raise AssertionError("quality must contain only riskTerms")


def main() -> None:
    if not SOURCE_YML.exists():
        raise AssertionError(f"source YAML missing: {SOURCE_YML}")
    if not TARGET_YML.exists():
        raise AssertionError(f"target YAML missing: {TARGET_YML}")

    source = load(SOURCE_YML)
    target = load(TARGET_YML)

    assert_llm_prompts_unchanged(source, target)
    assert_selector(target, "article_compiler", "title_cover", ["title_cover", "structured_output"])
    assert_selector(target, "article_compiler", "article_body", ["article_body", "structured_output"])
    assert_selector(target, "delivery_compiler", "video_narrative", ["video_narrative", "structured_output"])
    assert_selector(target, "delivery_compiler", "scene_breakdown", ["scene_breakdown", "structured_output"])
    assert_selector(target, "final_compiler", "image_assets_json", ["start", "image_assets_json"])
    assert_structured_schemas(target)
    compile_code_nodes(target)
    assert_final_payload(run_final_compiler_unit(target))
    print("Dify V3.1 YAML final JSON contract verification passed.")


if __name__ == "__main__":
    main()
