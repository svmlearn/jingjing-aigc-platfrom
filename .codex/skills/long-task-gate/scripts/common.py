#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any


class LongTaskError(RuntimeError):
    pass


def now_local() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def run_process(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    process = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and process.returncode != 0:
        message = process.stderr.strip() or process.stdout.strip() or f"{args[0]} failed"
        raise LongTaskError(message)
    return process.stdout.strip()


def repo_root(cwd: Path | None = None) -> Path:
    try:
        return Path(run_process(["git", "rev-parse", "--show-toplevel"], cwd=cwd)).resolve()
    except LongTaskError:
        return (cwd or Path.cwd()).resolve()


def skill_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def state_dir(root: Path) -> Path:
    return root / ".codex" / "long-task"


def active_path(root: Path) -> Path:
    return state_dir(root) / "active.json"


def contract_path(root: Path) -> Path:
    return state_dir(root) / "contract.json"


def gate_report_path(root: Path) -> Path:
    return state_dir(root) / "gate-report.json"


def logs_dir(root: Path) -> Path:
    return state_dir(root) / "logs"


def ensure_state(root: Path) -> None:
    state_dir(root).mkdir(parents=True, exist_ok=True)
    logs_dir(root).mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LongTaskError(f"Invalid JSON: {path}") from exc
    if not isinstance(value, dict):
        raise LongTaskError(f"Expected JSON object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_active(root: Path) -> dict[str, Any] | None:
    path = active_path(root)
    if not path.exists():
        return None
    return read_json(path)


def update_active(root: Path, updates: dict[str, Any]) -> dict[str, Any]:
    active = load_active(root)
    if not active:
        raise LongTaskError("No active long task. Run start.py first.")
    active.update(updates)
    active["updatedAt"] = now_local()
    write_json(active_path(root), active)
    return active


def as_root_path(root: Path, value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = root / path
    return path.resolve()


def relative_to_root(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root))
    except ValueError:
        return str(path.resolve())


def truncate(text: str, limit: int = 4000) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated {len(text) - limit} chars]"


def event_stamp() -> str:
    return datetime.now().astimezone().strftime("%Y%m%dT%H%M%S")


def shell_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("CI", "1")
    return env


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
