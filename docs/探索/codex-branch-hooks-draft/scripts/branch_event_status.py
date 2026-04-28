#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys

from branch_event_lib import BranchEventError, update_event_status


def main() -> int:
    parser = argparse.ArgumentParser(description="Update a Codex branch event status.")
    parser.add_argument("--event", required=True, help="Event id, filename, or path.")
    parser.add_argument(
        "--status",
        required=True,
        choices=["ready_for_review", "ready_for_recheck", "reviewing", "needs_fix", "blocked", "merged", "closed"],
        help="New event status.",
    )
    parser.add_argument("--message", help="Optional status note.")
    args = parser.parse_args()

    try:
        path, event = update_event_status(
            event_ref=args.event,
            status=args.status,
            message=args.message,
        )
    except BranchEventError as exc:
        print(f"branch-event-status: {exc}", file=sys.stderr)
        return 2

    print(json.dumps({"path": str(path), "event": event}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
