#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from branch_event_lib import BranchEventError, git_context, pending_events  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
        if payload.get("stop_hook_active"):
            return 0
        ctx = git_context(Path(payload.get("cwd") or os.getcwd()))
        if ctx.branch != "main":
            return 0
        events = pending_events(ctx.root)
    except (BranchEventError, json.JSONDecodeError):
        return 0

    if not events:
        return 0

    summary = ", ".join(
        f"{event.get('branch')}@{event.get('commit')}" for _, event in events[:5]
    )
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": (
                    f"Branch inbox has {len(events)} pending event(s): {summary}. "
                    "Continue from main and process them serially. Do not push or touch staging/production."
                ),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
