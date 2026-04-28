#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from common import LongTaskError, as_root_path, gate_report_path, load_active, read_json, repo_root, sha256_file


def block(reason: str) -> int:
    print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
    return 0


def short_failed_gates(report: dict[str, Any]) -> str:
    failed = [str(item.get("id")) for item in report.get("hardGates", []) if item.get("status") != "passed"]
    if failed:
        return "Failed hard gates: " + ", ".join(failed[:8])
    verifier = report.get("verifier", {})
    output = verifier.get("output") if isinstance(verifier, dict) else None
    if isinstance(output, dict) and output.get("failedItems"):
        ids = [str(item.get("id")) for item in output.get("failedItems", [])]
        return "Verifier failed items: " + ", ".join(ids[:8])
    if isinstance(verifier, dict) and verifier.get("reason"):
        return "Verifier: " + str(verifier.get("reason"))
    return "Completion Gate has not passed."


def main() -> int:
    if os.environ.get("LONG_TASK_GATE_ALLOW_STOP") == "1":
        return 0

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}
    if payload.get("stop_hook_active"):
        return 0

    root = repo_root(Path(payload.get("cwd") or os.getcwd()))
    active = load_active(root)
    if not active or not active.get("enabled", True):
        return 0

    status = str(active.get("status") or "active")
    if status in {"paused", "blocked", "complete"}:
        return 0
    if status != "active":
        return 0

    report_path = as_root_path(root, str(active.get("gateReport") or gate_report_path(root)))
    if not report_path.exists():
        return block(
            "Long task is active but no gate report exists. Continue the task, update evidence docs, then run "
            "`python3 .codex/skills/long-task-gate/scripts/check.py`. Do not stop yet."
        )

    try:
        report = read_json(report_path)
    except LongTaskError:
        return block("Long task gate report is invalid JSON. Regenerate it with `python3 .codex/skills/long-task-gate/scripts/check.py`.")

    contract_value = active.get("contract")
    if contract_value:
        contract_file = as_root_path(root, str(contract_value))
        if contract_file.exists() and report.get("contractDigest") != sha256_file(contract_file):
            return block(
                "Long task contract changed after the latest gate report. Run "
                "`python3 .codex/skills/long-task-gate/scripts/check.py` again before stopping."
            )

    if report.get("status") == "complete":
        return 0

    reason = "\n".join(
        [
            f"Long task `{active.get('taskId')}` is still active and Completion Gate has not passed.",
            short_failed_gates(report),
            f"Next instruction: {report.get('nextInstruction') or 'continue implementation and rerun check.py'}",
            "Read the source docs and gate report, continue work, update progress/handoff evidence, then rerun "
            "`python3 .codex/skills/long-task-gate/scripts/check.py`. Do not provide the completion promise yet.",
        ]
    )
    return block(reason)


if __name__ == "__main__":
    raise SystemExit(main())
