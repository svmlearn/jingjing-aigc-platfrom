#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from branch_event_lib import (  # noqa: E402
    BranchEventError,
    branch_fix_context,
    git_context,
    pending_events,
)


def emit_context(event_name: str, text: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": event_name,
                    "additionalContext": text,
                }
            },
            ensure_ascii=False,
        )
    )


def main() -> int:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    event_name = payload.get("hook_event_name") or "UserPromptSubmit"

    try:
        ctx = git_context(Path(payload.get("cwd") or os.getcwd()))
    except (BranchEventError, json.JSONDecodeError):
        return 0

    if ctx.branch == "main":
        events = pending_events(ctx.root)
        if not events:
            return 0
        lines = [
            "Codex branch inbox has pending worker branch events. Process them serially from main.",
            "",
            "Suggested main flow for each event:",
            "1. Read the event handoff/progress.",
            "2. Mark reviewing with `.codex/scripts/branch-event-status --event <id> --status reviewing`.",
            "3. Create a temporary worktree from main and run `git merge --no-commit --no-ff <branch>`.",
            "4. Run the required checks, usually `pnpm lint` and `pnpm build` under `app/`.",
            "5. If checks pass, merge locally into main, mark the event `merged`, and update the control board.",
            "6. If review fails, mark `needs_fix`, write the fix request into the control board, and do not merge.",
            "",
            "Pending events:",
        ]
        for path, event in events:
            lines.append(
                "- "
                f"id={event.get('id')} "
                f"branch={event.get('branch')} "
                f"commit={event.get('commit')} "
                f"status={event.get('status', 'ready_for_review')} "
                f"handoff={event.get('handoff') or '-'} "
                f"event={path.relative_to(ctx.root)}"
            )
        emit_context(str(event_name), "\n".join(lines))
        return 0

    fix_context = branch_fix_context(ctx.root, ctx.branch)
    if fix_context:
        emit_context(
            str(event_name),
            "\n".join(
                [
                    f"This worker branch `{ctx.branch}` has a fix request in the control board.",
                    "Handle the request, commit the fix, rerun verification, then publish a new branch_ready event with `.codex/scripts/branch-done`.",
                    "",
                    fix_context,
                ]
            ),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
