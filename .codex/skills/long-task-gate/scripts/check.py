#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from common import (
    LongTaskError,
    as_root_path,
    contract_path,
    event_stamp,
    gate_report_path,
    load_active,
    now_local,
    read_json,
    relative_to_root,
    repo_root,
    sha256_file,
    shell_env,
    skill_dir,
    state_dir,
    truncate,
    update_active,
    write_json,
)


def run_command_gate(root: Path, run_dir: Path, gate: dict[str, Any]) -> dict[str, Any]:
    gate_id = str(gate["id"])
    command = str(gate.get("command") or "")
    timeout = int(gate.get("timeoutSeconds") or 300)
    if not command:
        return {"id": gate_id, "type": "command", "status": "failed", "reason": "Missing command."}

    log_path = run_dir / f"{gate_id}.log"
    try:
        process = subprocess.run(
            ["/bin/bash", "-lc", command],
            cwd=str(root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
            env=shell_env(),
        )
        output = process.stdout or ""
        log_path.write_text(output, encoding="utf-8")
        status = "passed" if process.returncode == 0 else "failed"
        return {
            "id": gate_id,
            "type": "command",
            "status": status,
            "command": command,
            "exitCode": process.returncode,
            "log": relative_to_root(root, log_path),
            "outputTail": truncate(output[-4000:]),
        }
    except subprocess.TimeoutExpired as exc:
        output = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        log_path.write_text(output, encoding="utf-8")
        return {
            "id": gate_id,
            "type": "command",
            "status": "failed",
            "command": command,
            "reason": f"Timed out after {timeout}s.",
            "log": relative_to_root(root, log_path),
            "outputTail": truncate(output[-4000:]),
        }


def run_file_exists_gate(root: Path, gate: dict[str, Any]) -> dict[str, Any]:
    gate_id = str(gate["id"])
    raw_path = str(gate.get("path") or gate.get("file") or "")
    if not raw_path:
        return {"id": gate_id, "type": "file_exists", "status": "failed", "reason": "Missing path."}
    path = as_root_path(root, raw_path)
    return {
        "id": gate_id,
        "type": "file_exists",
        "status": "passed" if path.exists() else "failed",
        "path": raw_path,
        "reason": "" if path.exists() else "File does not exist.",
    }


def run_file_contains_gate(root: Path, gate: dict[str, Any]) -> dict[str, Any]:
    gate_id = str(gate["id"])
    raw_file = str(gate.get("file") or gate.get("path") or "")
    if not raw_file:
        return {"id": gate_id, "type": "file_contains", "status": "failed", "reason": "Missing file."}
    path = as_root_path(root, raw_file)
    if not path.exists():
        return {"id": gate_id, "type": "file_contains", "status": "failed", "file": raw_file, "reason": "File does not exist."}
    text = path.read_text(encoding="utf-8", errors="replace")
    must_contain = [str(item) for item in gate.get("mustContain", [])]
    missing = [item for item in must_contain if item not in text]
    must_not_contain = [str(item) for item in gate.get("mustNotContain", [])]
    present_forbidden = [item for item in must_not_contain if item in text]
    passed = not missing and not present_forbidden
    return {
        "id": gate_id,
        "type": "file_contains",
        "status": "passed" if passed else "failed",
        "file": raw_file,
        "missing": missing,
        "presentForbidden": present_forbidden,
    }


def run_hard_gates(root: Path, run_dir: Path, contract: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for gate in contract.get("hardGates", []):
        gate_type = gate.get("type")
        if gate_type == "command":
            results.append(run_command_gate(root, run_dir, gate))
        elif gate_type == "file_exists":
            results.append(run_file_exists_gate(root, gate))
        elif gate_type == "file_contains":
            results.append(run_file_contains_gate(root, gate))
        else:
            results.append({"id": gate.get("id", "unknown"), "type": gate_type, "status": "failed", "reason": "Unknown gate type."})
    return results


def parse_json_text(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("Verifier output must be a JSON object.")
    return value


def verifier_is_valid(value: dict[str, Any]) -> bool:
    required = {"verdict", "confidence", "evidenceSummary", "failedItems", "remainingRisks", "nextInstruction"}
    if not required.issubset(value):
        return False
    if value.get("verdict") not in {"pass", "fail"}:
        return False
    return isinstance(value.get("failedItems"), list) and isinstance(value.get("evidenceSummary"), list)


def build_verifier_prompt(root: Path, contract: dict[str, Any], hard_results: list[dict[str, Any]], run_dir: Path) -> str:
    prompt_path = skill_dir() / "references" / "verifier-prompt.md"
    instructions = prompt_path.read_text(encoding="utf-8")
    try:
        git_status = subprocess.run(
            ["git", "status", "--short"],
            cwd=str(root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        ).stdout.strip()
    except OSError:
        git_status = ""

    return "\n\n".join(
        [
            instructions,
            "## Task Contract",
            json.dumps(contract, ensure_ascii=False, indent=2),
            "## Hard Gate Results",
            json.dumps(hard_results, ensure_ascii=False, indent=2),
            "## Repo Evidence Pointers",
            f"Repository root: {root}",
            f"Run logs directory: {relative_to_root(root, run_dir)}",
            f"Source docs: {', '.join(contract.get('sourceDocs', []))}",
            f"Git status --short:\n{git_status or '(clean)'}",
            "Return only valid JSON. Do not edit files.",
        ]
    )


def run_codex_verifier(root: Path, run_dir: Path, contract: dict[str, Any], hard_results: list[dict[str, Any]]) -> dict[str, Any]:
    codex = shutil.which("codex")
    if not codex:
        return {"status": "failed", "reason": "codex CLI not found.", "output": None}

    verifier_config = contract.get("verifier", {})
    timeout = int(verifier_config.get("timeoutSeconds") or 900)
    schema = skill_dir() / "assets" / "verifier-output.schema.json"
    output_path = run_dir / "verifier-output.json"
    stdout_path = run_dir / "verifier-stdout.log"
    prompt = build_verifier_prompt(root, contract, hard_results, run_dir)

    cmd = [
        codex,
        "exec",
        "-C",
        str(root),
        "-s",
        "read-only",
        "--disable",
        "codex_hooks",
        "--output-schema",
        str(schema),
        "-o",
        str(output_path),
    ]
    model = verifier_config.get("model")
    if model:
        cmd.extend(["-m", str(model)])
    cmd.append(prompt)

    env = shell_env()
    env["LONG_TASK_GATE_ALLOW_STOP"] = "1"

    try:
        process = subprocess.run(
            cmd,
            cwd=str(root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        stdout_path.write_text(stdout, encoding="utf-8")
        return {"status": "failed", "reason": f"Verifier timed out after {timeout}s.", "log": relative_to_root(root, stdout_path)}

    stdout_path.write_text(process.stdout or "", encoding="utf-8")
    raw = output_path.read_text(encoding="utf-8") if output_path.exists() else process.stdout or ""
    try:
        output = parse_json_text(raw)
    except Exception as exc:  # noqa: BLE001 - preserve verifier failure context.
        return {
            "status": "failed",
            "reason": f"Verifier returned invalid JSON: {exc}",
            "exitCode": process.returncode,
            "log": relative_to_root(root, stdout_path),
            "rawOutput": truncate(raw),
        }

    if process.returncode != 0:
        return {
            "status": "failed",
            "reason": f"Verifier command exited with {process.returncode}.",
            "exitCode": process.returncode,
            "log": relative_to_root(root, stdout_path),
            "output": output,
        }

    if not verifier_is_valid(output):
        return {
            "status": "failed",
            "reason": "Verifier JSON did not match required shape.",
            "log": relative_to_root(root, stdout_path),
            "output": output,
        }

    return {
        "status": "passed" if output.get("verdict") == "pass" else "failed",
        "log": relative_to_root(root, stdout_path),
        "output": output,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run hard gates and independent verifier.")
    parser.add_argument("--skip-verifier", action="store_true", help="Debug hard gates only; this cannot complete the task.")
    args = parser.parse_args()

    root = repo_root(Path.cwd())
    active = load_active(root)
    if not active:
        raise LongTaskError("No active long task. Run start.py first.")

    contract_file = as_root_path(root, str(active.get("contract") or contract_path(root)))
    if not contract_file.exists():
        raise LongTaskError(f"Contract not found: {contract_file}")
    contract = read_json(contract_file)

    run_dir = state_dir(root) / "runs" / event_stamp()
    run_dir.mkdir(parents=True, exist_ok=True)
    hard_results = run_hard_gates(root, run_dir, contract)
    hard_pass = all(result.get("status") == "passed" for result in hard_results)

    verifier_config = contract.get("verifier", {"enabled": True, "provider": "codex"})
    verifier: dict[str, Any]
    if args.skip_verifier:
        verifier = {"status": "skipped", "reason": "Skipped by --skip-verifier; task cannot be completed from this run."}
    elif not hard_pass:
        verifier = {"status": "skipped", "reason": "Hard gates failed; verifier not run."}
    elif verifier_config.get("enabled", True):
        verifier = run_codex_verifier(root, run_dir, contract, hard_results)
    else:
        verifier = {"status": "failed", "reason": "Verifier disabled in contract; real completion requires independent verification."}

    verifier_pass = verifier.get("status") == "passed"
    complete = hard_pass and verifier_pass and not args.skip_verifier

    failed_hards = [result for result in hard_results if result.get("status") != "passed"]
    verifier_next = ""
    if isinstance(verifier.get("output"), dict):
        verifier_next = str(verifier["output"].get("nextInstruction") or "")

    if complete:
        next_instruction = "Completion Gate passed. The main agent may provide the completion promise."
    elif failed_hards:
        failed_ids = ", ".join(str(item.get("id")) for item in failed_hards)
        next_instruction = f"Continue fixing failed hard gates: {failed_ids}. Then run check.py again."
    elif verifier_next:
        next_instruction = verifier_next
    elif verifier.get("status") == "skipped":
        next_instruction = str(verifier.get("reason"))
    else:
        next_instruction = "Verifier failed or found missing evidence. Read the verifier log/output, fix the issues, update progress/handoff, then run check.py again."

    report = {
        "status": "complete" if complete else "failed",
        "taskId": contract.get("taskId"),
        "checkedAt": now_local(),
        "contract": relative_to_root(root, contract_file),
        "contractDigest": sha256_file(contract_file),
        "completionPromise": contract.get("completionPromise"),
        "runDir": relative_to_root(root, run_dir),
        "hardGates": hard_results,
        "verifier": verifier,
        "nextInstruction": next_instruction,
    }
    report_path = gate_report_path(root)
    write_json(report_path, report)

    active_updates = {"lastGateReport": relative_to_root(root, report_path)}
    if complete:
        active_updates.update({"status": "complete", "completedAt": now_local(), "completedBy": "long-task-gate/check.py"})
    elif active.get("status") == "complete":
        active_updates.update({"status": "active", "completedAt": None, "completedBy": None})
    update_active(root, active_updates)

    print(json.dumps({k: report[k] for k in ("status", "taskId", "checkedAt", "nextInstruction")}, ensure_ascii=False, indent=2))
    return 0 if complete else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LongTaskError as exc:
        print(f"long-task-gate check failed: {exc}", file=sys.stderr)
        raise SystemExit(2)
