#!/usr/bin/env python3
"""
内容日历 -> 图文内容包 / 视频镜头脚本 Dify workflow 回归测试脚本。

特点：
- base-url / api-key 不写死，优先使用命令行，其次使用环境变量。
- 支持 streaming 模式保存每个节点输出。
- 支持批量 JSON 用例、重复运行、并发运行。
- 自动做轻量验收：最终 JSON 可解析、风险词、copyReadyText、assetQuery、qualityReview.pass 等。
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CASE_PATH = SCRIPT_DIR / "testcases"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR / "results"

RISK_PATTERNS = [
    "投资回报率高",
    "租金回报高",
    "收益稳定",
    "稳赚",
    "保值增值",
    "满租",
    "租金区间",
    "租金回报",
    "低位价格",
    "价格错位",
    "确定兑现",
    "运营成熟验证",
]


def load_cases(case_path: Path) -> List[Dict[str, Any]]:
    files: List[Path]
    if case_path.is_file():
        files = [case_path]
    else:
        files = [Path(p) for p in sorted(glob.glob(str(case_path / "*.json")))]

    cases: List[Dict[str, Any]] = []
    for path in files:
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            print(f"  跳过 {path}: {exc}")
            continue

        cases.append(
            {
                "name": path.stem,
                "path": str(path),
                "data": data,
                "inputs": extract_inputs(data),
                "expected": data.get("expected", {}),
            }
        )
        print(f"  已加载: {path.stem}")

    return cases


def extract_inputs(data: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(data.get("inputs"), dict):
        return data["inputs"]

    reserved = {"meta", "expected", "notes"}
    return {key: value for key, value in data.items() if key not in reserved}


def call_dify_workflow_streaming(
    *,
    base_url: str,
    api_key: str,
    case_name: str,
    inputs: Dict[str, Any],
    user_prefix: str,
    save_nodes: bool,
    timeout: int,
) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/workflows/run"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": inputs,
        "response_mode": "streaming",
        "user": f"{user_prefix}_{case_name}_{int(time.time())}",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout, stream=True)
    except Exception as exc:
        return {"success": False, "error": str(exc), "raw_response": None, "node_outputs": None}

    if response.status_code != 200:
        return {
            "success": False,
            "error": f"HTTP {response.status_code}: {response.text[:1000]}",
            "raw_response": None,
            "node_outputs": None,
        }

    node_outputs: Dict[str, Any] = {}
    final_result: Optional[Dict[str, Any]] = None
    workflow_run_id: Optional[str] = None

    for line in response.iter_lines():
        if not line:
            continue
        line_str = line.decode("utf-8", errors="replace")
        if not line_str.startswith("data: "):
            continue

        try:
            event_data = json.loads(line_str[6:])
        except json.JSONDecodeError:
            continue

        workflow_run_id = event_data.get("workflow_run_id", workflow_run_id)
        event_type = event_data.get("event")
        data = event_data.get("data", {})

        if event_type == "node_started" and save_nodes:
            node_id = data.get("node_id")
            if node_id:
                node_outputs[node_id] = {
                    "node_type": data.get("node_type"),
                    "title": data.get("title", ""),
                    "started_at": data.get("created_at"),
                    "status": "running",
                    "inputs": data.get("inputs"),
                    "outputs": None,
                }
        elif event_type == "node_finished" and save_nodes:
            node_id = data.get("node_id")
            if node_id:
                node_outputs.setdefault(node_id, {})
                node_outputs[node_id].update(
                    {
                        "node_type": data.get("node_type", node_outputs[node_id].get("node_type")),
                        "title": data.get("title", node_outputs[node_id].get("title", "")),
                        "status": data.get("status"),
                        "finished_at": data.get("created_at"),
                        "inputs": data.get("inputs", node_outputs[node_id].get("inputs")),
                        "outputs": data.get("outputs"),
                        "error": data.get("error"),
                        "execution_metadata": data.get("execution_metadata"),
                    }
                )
        elif event_type == "workflow_finished":
            final_result = data

    return {
        "success": True,
        "error": None,
        "raw_response": final_result,
        "node_outputs": node_outputs if save_nodes else None,
        "workflow_run_id": workflow_run_id,
    }


def extract_final_json(raw_response: Optional[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], str, List[str]]:
    errors: List[str] = []
    if not raw_response:
        return None, "", ["missing raw_response"]

    outputs = raw_response.get("outputs") or {}
    text = (
        outputs.get("final_result_json")
        or outputs.get("text")
        or outputs.get("result")
        or outputs.get("output")
        or ""
    )

    if isinstance(text, dict):
        return text, json.dumps(text, ensure_ascii=False), []

    if not isinstance(text, str) or not text.strip():
        return None, "", ["missing final output text"]

    cleaned = strip_code_fence(text.strip())
    try:
        return json.loads(cleaned), cleaned, []
    except json.JSONDecodeError as exc:
        errors.append(f"final JSON parse failed: {exc}")
        return None, cleaned, errors


def strip_code_fence(text: str) -> str:
    match = re.fullmatch(r"```(?:json)?\s*([\s\S]*?)\s*```", text.strip())
    return match.group(1).strip() if match else text


def public_payload_text(final_json: Dict[str, Any]) -> str:
    """Only scan publish-facing content for risky wording."""
    article = final_json.get("articlePackage") or {}
    video = final_json.get("videoScript") or {}
    return json.dumps(
        {
            "articlePackage": article,
            "videoScript": video,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def evaluate_result(final_json: Optional[Dict[str, Any]], final_text: str, expected: Dict[str, Any]) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    def add(name: str, passed: bool, detail: str = "") -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})

    add("final_json_parseable", final_json is not None)
    if final_json is None:
        return {"passed": False, "checks": checks, "risk_terms": []}

    quality = final_json.get("qualityReview") or {}
    article = final_json.get("articlePackage") or {}
    video = final_json.get("videoScript") or {}
    scenes = video.get("scenes") if isinstance(video.get("scenes"), list) else []

    risk_terms = [term for term in RISK_PATTERNS if term in public_payload_text(final_json)]
    add("no_risk_terms", not risk_terms, " / ".join(risk_terms))

    copy_ready = article.get("copyReadyText")
    add("copy_ready_text_present", isinstance(copy_ready, str) and bool(copy_ready.strip()))

    empty_asset_queries = [
        str(scene.get("sceneNo", index + 1))
        for index, scene in enumerate(scenes)
        if not str(scene.get("assetQuery", "")).strip()
    ]
    add("scene_asset_query_present", not empty_asset_queries, f"empty scenes: {', '.join(empty_asset_queries)}")

    upload_required_scenes = [
        scene for scene in scenes if scene.get("uploadRequired") is True
    ]
    required_uploads = video.get("requiredUploads")
    add(
        "required_uploads_present_when_needed",
        not upload_required_scenes or (isinstance(required_uploads, list) and len(required_uploads) > 0),
    )

    team_asset_scenes = [
        scene for scene in scenes if scene.get("assetSourceHint") == "team_video_asset"
    ]
    optional_assets = video.get("optionalTeamVideoAssets")
    add(
        "optional_team_video_assets_present",
        not team_asset_scenes or (isinstance(optional_assets, list) and len(optional_assets) > 0),
    )

    expect_pass = expected.get("quality_pass")
    if isinstance(expect_pass, bool):
        add("quality_pass_matches_expected", quality.get("pass") is expect_pass, f"actual={quality.get('pass')}")

    min_scores = expected.get("min_scores")
    if isinstance(min_scores, dict):
        scores = quality.get("scores") or {}
        low_scores = [
            f"{key}:{scores.get(key)}<{threshold}"
            for key, threshold in min_scores.items()
            if not isinstance(scores.get(key), (int, float)) or scores.get(key) < threshold
        ]
        add("quality_scores_meet_minimum", not low_scores, " / ".join(low_scores))

    passed = all(check["passed"] for check in checks)
    return {"passed": passed, "checks": checks, "risk_terms": risk_terms}


def run_tests(args: argparse.Namespace) -> Path:
    base_url = args.base_url or os.getenv("DIFY_BASE_URL")
    api_key = args.api_key or os.getenv("DIFY_API_KEY")

    if not base_url:
        raise SystemExit("缺少 Dify base url。请传 --base-url 或设置 DIFY_BASE_URL。")
    if not api_key:
        raise SystemExit("缺少 Dify api key。请传 --api-key 或设置 DIFY_API_KEY。")

    case_path = Path(args.case_path or DEFAULT_CASE_PATH).expanduser().resolve()
    output_dir = Path(args.output_dir or DEFAULT_OUTPUT_DIR).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    node_dir = output_dir / "node_outputs"
    if args.save_nodes:
        node_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("内容日历 Dify workflow 回归测试")
    print(f"base_url: {base_url}")
    print(f"case_path: {case_path}")
    print(f"output_dir: {output_dir}")
    print(f"runs: {args.runs}")
    print(f"concurrency: {args.concurrency}")
    print(f"save_nodes: {args.save_nodes}")
    print("=" * 80)

    cases = load_cases(case_path)
    if not cases:
        raise SystemExit("没有可运行测试用例。")

    summary: Dict[str, Any] = {
        "test_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "base_url": base_url,
        "case_path": str(case_path),
        "runs": args.runs,
        "save_nodes": args.save_nodes,
        "cases": [],
    }
    print_lock = threading.Lock()

    for case in cases:
        case_name = case["name"]
        print("\n" + "=" * 80)
        print(f"测试用例: {case_name}")
        print("=" * 80)

        case_runs: List[Dict[str, Any]] = []

        def run_once(run_index: int) -> Dict[str, Any]:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            started = time.time()
            result = call_dify_workflow_streaming(
                base_url=base_url,
                api_key=api_key,
                case_name=case_name,
                inputs=case["inputs"],
                user_prefix=args.user_prefix,
                save_nodes=args.save_nodes,
                timeout=args.timeout,
            )
            elapsed = time.time() - started
            final_json, final_text, parse_errors = extract_final_json(result.get("raw_response"))
            evaluation = evaluate_result(final_json, final_text, case.get("expected", {}))
            output_name = f"{case_name}_run{run_index}_{timestamp}.json"
            output_path = output_dir / output_name
            payload = {
                "case_name": case_name,
                "case_path": case["path"],
                "run_index": run_index,
                "timestamp": timestamp,
                "elapsed_time": elapsed,
                "success": result["success"],
                "workflow_run_id": result.get("workflow_run_id"),
                "error": result.get("error"),
                "raw_response": result.get("raw_response"),
                "final_json": final_json,
                "final_text": final_text,
                "parse_errors": parse_errors,
                "evaluation": evaluation,
            }
            with output_path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)

            node_output_name = None
            if args.save_nodes and result.get("node_outputs"):
                node_output_name = f"{case_name}_run{run_index}_{timestamp}_nodes.json"
                with (node_dir / node_output_name).open("w", encoding="utf-8") as f:
                    json.dump(result["node_outputs"], f, ensure_ascii=False, indent=2)

            with print_lock:
                status = "通过" if result["success"] and evaluation["passed"] and not parse_errors else "需看"
                print(
                    f"  run {run_index}/{args.runs} {status} | "
                    f"{elapsed:.2f}s | {output_name}"
                    + (f" | nodes={node_output_name}" if node_output_name else "")
                )
                failed = [check for check in evaluation["checks"] if not check["passed"]]
                if failed:
                    print("    未通过检查: " + "；".join(f"{item['name']}({item['detail']})" for item in failed))
                if parse_errors:
                    print("    解析错误: " + "；".join(parse_errors))

            return {
                "run_index": run_index,
                "success": result["success"],
                "elapsed_time": elapsed,
                "output_file": output_name,
                "node_output_file": node_output_name,
                "evaluation_passed": evaluation["passed"],
                "parse_errors": parse_errors,
            }

        with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            futures = [executor.submit(run_once, index) for index in range(1, args.runs + 1)]
            for future in as_completed(futures):
                case_runs.append(future.result())

        summary["cases"].append({"case_name": case_name, "runs": sorted(case_runs, key=lambda item: item["run_index"])})

    summary_name = f"测试汇总_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    summary_path = output_dir / summary_name
    with summary_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 80)
    print(f"测试完成: {summary_path}")
    print("=" * 80)
    return summary_path


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="内容日历 Dify workflow 回归测试")
    parser.add_argument("--base-url", default=None, help="Dify API base url，例如 https://dify.example.com/v1")
    parser.add_argument("--api-key", default=None, help="Dify app API key。也可用环境变量 DIFY_API_KEY。")
    parser.add_argument("--case-path", default=str(DEFAULT_CASE_PATH), help="测试用例 JSON 文件或目录")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="测试结果输出目录")
    parser.add_argument("--runs", type=int, default=1, help="每个用例运行次数")
    parser.add_argument("--concurrency", type=int, default=1, help="并发数")
    parser.add_argument("--save-nodes", action="store_true", help="保存每个节点输出")
    parser.add_argument("--timeout", type=int, default=300, help="单次 workflow 超时时间秒")
    parser.add_argument("--user-prefix", default="content_calendar_test", help="Dify user 前缀")
    return parser


if __name__ == "__main__":
    run_tests(build_arg_parser().parse_args())
