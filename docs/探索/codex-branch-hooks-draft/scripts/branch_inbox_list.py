#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys

from branch_event_lib import BranchEventError, load_events, pending_events, repo_root


def main() -> int:
    parser = argparse.ArgumentParser(description="List Codex branch events.")
    parser.add_argument("--all", action="store_true", help="Include processed events.")
    parser.add_argument("--json", action="store_true", help="Print raw JSON list.")
    args = parser.parse_args()

    try:
        root = repo_root()
        events = load_events(root, include_processed=args.all) if args.all else pending_events(root)
    except BranchEventError as exc:
        print(f"branch-inbox-list: {exc}", file=sys.stderr)
        return 2

    payload = [{"path": str(path), **event} for path, event in events]
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not payload:
        print("No pending branch events.")
        return 0

    for item in payload:
        print(
            f"{item.get('status', 'ready_for_review')}\t"
            f"{item.get('branch')}\t"
            f"{item.get('commit')}\t"
            f"{item.get('handoff') or '-'}\t"
            f"{item.get('path')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
