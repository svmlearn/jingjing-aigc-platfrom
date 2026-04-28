#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from common import (
    LongTaskError,
    active_path,
    as_root_path,
    contract_path,
    ensure_state,
    gate_report_path,
    load_active,
    now_local,
    relative_to_root,
    repo_root,
    write_json,
)


def infer_task_id(source_docs: list[str]) -> str:
    if not source_docs:
        return "long-task"
    stem = Path(source_docs[0]).stem
    stem = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", stem)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-")
    return stem or "long-task"


def default_gates(root: Path, source_docs: list[str], no_default_gates: bool) -> list[dict[str, object]]:
    gates: list[dict[str, object]] = []
    for doc in source_docs:
        gates.append({"id": f"source_doc_exists:{doc}", "type": "file_exists", "path": doc})

    if no_default_gates:
        return gates

    if (root / "app" / "package.json").exists():
        gates.extend(
            [
                {
                    "id": "app_typecheck",
                    "type": "command",
                    "command": "cd app && pnpm exec tsc --noEmit --pretty false",
                    "timeoutSeconds": 300,
                },
                {
                    "id": "app_lint",
                    "type": "command",
                    "command": "cd app && pnpm lint",
                    "timeoutSeconds": 300,
                },
                {
                    "id": "app_build",
                    "type": "command",
                    "command": "cd app && pnpm build",
                    "timeoutSeconds": 900,
                },
            ]
        )

    worker_a = root / "workers" / "video-worker" / "openstoryline" / "app"
    worker_b = root / "workers" / "video-worker" / "worker" / "app"
    if worker_a.exists() and worker_b.exists():
        gates.append(
            {
                "id": "video_worker_compile",
                "type": "command",
                "command": "python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app",
                "timeoutSeconds": 300,
            }
        )

    return gates


def parse_must_contain(values: list[str]) -> list[dict[str, object]]:
    gates: list[dict[str, object]] = []
    for index, value in enumerate(values, start=1):
        if "::" not in value:
            raise LongTaskError("--must-contain must use FILE::TEXT")
        file_name, text = value.split("::", 1)
        gates.append(
            {
                "id": f"evidence_contains_{index}",
                "type": "file_contains",
                "file": file_name,
                "mustContain": [text],
            }
        )
    return gates


def main() -> int:
    parser = argparse.ArgumentParser(description="Start a project-local long task gate.")
    parser.add_argument("--task-id", default=None)
    parser.add_argument("--completion-promise", required=True)
    parser.add_argument("--source-doc", action="append", default=[], help="Task truth-source document. Repeatable.")
    parser.add_argument("--must-contain", action="append", default=[], help="Add file evidence gate as FILE::TEXT.")
    parser.add_argument("--no-default-gates", action="store_true")
    parser.add_argument("--force", action="store_true", help="Replace an existing active long task.")
    args = parser.parse_args()

    root = repo_root(Path.cwd())
    ensure_state(root)

    existing = load_active(root)
    if existing and existing.get("status") == "active" and not args.force:
        raise LongTaskError("A long task is already active. Use --force, pause it, or complete it first.")

    source_docs: list[str] = []
    for doc in args.source_doc:
        path = as_root_path(root, doc)
        if not path.exists():
            raise LongTaskError(f"Source doc does not exist: {doc}")
        source_docs.append(relative_to_root(root, path))

    task_id = args.task_id or infer_task_id(source_docs)
    gates = default_gates(root, source_docs, args.no_default_gates)
    gates.extend(parse_must_contain(args.must_contain))

    contract = {
        "taskId": task_id,
        "completionPromise": args.completion_promise,
        "sourceDocs": source_docs,
        "hardGates": gates,
        "verifier": {
            "enabled": True,
            "provider": "codex",
            "timeoutSeconds": 900,
        },
        "createdAt": now_local(),
        "notes": [
            "Edit hardGates to match the real Completion Gate before relying on this task.",
            "Only scripts/check.py may mark the task complete.",
        ],
    }
    write_json(contract_path(root), contract)

    active = {
        "enabled": True,
        "status": "active",
        "taskId": task_id,
        "contract": relative_to_root(root, contract_path(root)),
        "gateReport": relative_to_root(root, gate_report_path(root)),
        "completionPromise": args.completion_promise,
        "sourceDocs": source_docs,
        "createdAt": now_local(),
        "updatedAt": now_local(),
    }
    write_json(active_path(root), active)

    print(f"Started long task: {task_id}")
    print(f"Active: {relative_to_root(root, active_path(root))}")
    print(f"Contract: {relative_to_root(root, contract_path(root))}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LongTaskError as exc:
        print(f"long-task-gate start failed: {exc}", file=sys.stderr)
        raise SystemExit(2)
