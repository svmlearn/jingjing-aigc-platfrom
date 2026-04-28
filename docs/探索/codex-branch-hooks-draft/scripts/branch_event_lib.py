#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


FINAL_STATUSES = {"merged", "needs_fix", "blocked", "closed"}
ACTIVE_STATUSES = {"ready_for_review", "ready_for_recheck", "reviewing"}


class BranchEventError(RuntimeError):
    pass


@dataclass(frozen=True)
class GitContext:
    root: Path
    branch: str
    short_head: str
    head: str
    main_short: str
    is_dirty: bool
    ahead_main_count: int


def run_git(args: list[str], cwd: Path | None = None, check: bool = True) -> str:
    process = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and process.returncode != 0:
        raise BranchEventError(process.stderr.strip() or f"git {' '.join(args)} failed")
    return process.stdout.strip()


def repo_root(cwd: Path | None = None) -> Path:
    return Path(run_git(["rev-parse", "--show-toplevel"], cwd=cwd)).resolve()


def git_context(cwd: Path | None = None) -> GitContext:
    root = repo_root(cwd)
    branch = run_git(["branch", "--show-current"], cwd=root)
    head = run_git(["rev-parse", "HEAD"], cwd=root)
    short_head = run_git(["rev-parse", "--short", "HEAD"], cwd=root)
    main_short = run_git(["rev-parse", "--short", "main"], cwd=root)
    is_dirty = bool(run_git(["status", "--porcelain"], cwd=root))
    ahead = int(run_git(["rev-list", "--count", "main..HEAD"], cwd=root) or "0")
    return GitContext(
        root=root,
        branch=branch,
        short_head=short_head,
        head=head,
        main_short=main_short,
        is_dirty=is_dirty,
        ahead_main_count=ahead,
    )


def infer_version(branch: str) -> str | None:
    match = re.match(r"^codex/(v\d+(?:\.\d+)*)(?:[-/].+)?$", branch)
    return match.group(1) if match else None


def sanitize_branch(branch: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", branch).strip("-")


def now_local() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def now_event_stamp() -> str:
    return datetime.now().astimezone().strftime("%Y%m%dT%H%M%S")


def branch_events_dir(root: Path) -> Path:
    return root / ".codex" / "branch-events"


def inbox_dir(root: Path) -> Path:
    return branch_events_dir(root) / "inbox"


def processed_dir(root: Path) -> Path:
    return branch_events_dir(root) / "processed"


def runtime_dir(root: Path) -> Path:
    return branch_events_dir(root) / "runtime"


def ensure_event_dirs(root: Path) -> None:
    inbox_dir(root).mkdir(parents=True, exist_ok=True)
    processed_dir(root).mkdir(parents=True, exist_ok=True)
    runtime_dir(root).mkdir(parents=True, exist_ok=True)


def make_relative_path(root: Path, value: str | None) -> str | None:
    if not value:
        return None
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def require_existing_relative(root: Path, value: str | None, label: str) -> str | None:
    relative = make_relative_path(root, value)
    if not relative:
        return None
    candidate = root / relative if not Path(relative).is_absolute() else Path(relative)
    if not candidate.exists():
        raise BranchEventError(f"{label} does not exist: {value}")
    return relative


def create_branch_ready_event(
    *,
    handoff: str | None,
    progress: str | None,
    dry_run: bool = False,
) -> dict[str, Any]:
    ctx = git_context()
    version = infer_version(ctx.branch)
    if ctx.branch == "main":
        raise BranchEventError("branch-done must run from a worker branch, not main.")
    if not version:
        raise BranchEventError("branch name must match codex/vX.Y-* so the version can be inferred.")
    if ctx.is_dirty:
        raise BranchEventError("worktree is dirty; commit or clean changes before publishing branch_ready.")
    if ctx.ahead_main_count <= 0:
        raise BranchEventError("branch has no commits ahead of main.")

    handoff_path = require_existing_relative(ctx.root, handoff, "handoff") if handoff else None
    progress_path = require_existing_relative(ctx.root, progress, "progress") if progress else None
    event_id = f"{now_event_stamp()}-{sanitize_branch(ctx.branch)}-{ctx.short_head}"
    event = {
        "type": "branch_ready",
        "id": event_id,
        "version": version,
        "branch": ctx.branch,
        "commit": ctx.short_head,
        "head": ctx.head,
        "baseMain": ctx.main_short,
        "worktree": str(ctx.root),
        "handoff": handoff_path,
        "progress": progress_path,
        "status": "ready_for_review",
        "createdAt": now_local(),
    }
    if not dry_run:
        ensure_event_dirs(ctx.root)
        path = inbox_dir(ctx.root) / f"{event_id}.json"
        path.write_text(json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return event


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BranchEventError(f"invalid JSON event {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise BranchEventError(f"event must be a JSON object: {path}")
    return value


def event_files(root: Path, *, include_processed: bool = False) -> list[Path]:
    ensure_event_dirs(root)
    files = sorted(inbox_dir(root).glob("*.json"))
    if include_processed:
        files.extend(sorted(processed_dir(root).glob("*.json")))
    return files


def load_events(root: Path, *, include_processed: bool = False) -> list[tuple[Path, dict[str, Any]]]:
    events: list[tuple[Path, dict[str, Any]]] = []
    for path in event_files(root, include_processed=include_processed):
        try:
            events.append((path, load_json(path)))
        except BranchEventError:
            continue
    return events


def pending_events(root: Path) -> list[tuple[Path, dict[str, Any]]]:
    events = []
    for path, event in load_events(root):
        if event.get("type") != "branch_ready":
            continue
        status = str(event.get("status") or "ready_for_review")
        if status in ACTIVE_STATUSES:
            events.append((path, event))
    return events


def find_event(root: Path, event_ref: str) -> tuple[Path, dict[str, Any]]:
    candidates = load_events(root, include_processed=True)
    for path, event in candidates:
        if event.get("id") == event_ref or path.name == event_ref or str(path) == event_ref:
            return path, event
    explicit = Path(event_ref)
    if explicit.exists():
        return explicit, load_json(explicit)
    raise BranchEventError(f"event not found: {event_ref}")


def update_event_status(
    *,
    event_ref: str,
    status: str,
    message: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    root = repo_root()
    path, event = find_event(root, event_ref)
    event["status"] = status
    event["updatedAt"] = now_local()
    if message:
        event["message"] = message

    if status in FINAL_STATUSES:
        ensure_event_dirs(root)
        target = processed_dir(root) / path.name
        path.write_text(json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if path.resolve() != target.resolve():
            shutil.move(str(path), str(target))
        return target, event

    path.write_text(json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path, event


def latest_control_boards(root: Path) -> list[Path]:
    docs = root / "docs" / "progress"
    if not docs.exists():
        return []
    boards = sorted(
        docs.glob("*branch-control-board*.md"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return boards[:5]


def branch_fix_context(root: Path, branch: str) -> str | None:
    start = f"<!-- codex-branch-fix-start {branch} -->"
    end = f"<!-- codex-branch-fix-end {branch} -->"
    for board in latest_control_boards(root):
        text = board.read_text(encoding="utf-8")
        cursor = 0
        while True:
            start_index = text.find(start, cursor)
            if start_index < 0:
                break
            end_index = text.find(end, start_index)
            if end_index < 0:
                break
            block = text[start_index + len(start) : end_index].strip()
            cursor = end_index + len(end)
            if re.search(r"`?(needs_fix|ready_for_recheck)`?", block):
                return f"Control board: {board.relative_to(root)}\n\n{block}"
    return None
