#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys

from branch_event_lib import BranchEventError, create_branch_ready_event


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish a branch_ready event for main integration.")
    parser.add_argument("--handoff", help="Path to the branch handoff document.")
    parser.add_argument("--progress", help="Path to the branch progress document.")
    parser.add_argument("--dry-run", action="store_true", help="Print the event without writing inbox.")
    args = parser.parse_args()

    try:
        event = create_branch_ready_event(
            handoff=args.handoff,
            progress=args.progress,
            dry_run=args.dry_run,
        )
    except BranchEventError as exc:
        print(f"branch-done: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(event, ensure_ascii=False, indent=2))
    if not args.dry_run:
        print("branch-done: published branch_ready event to .codex/branch-events/inbox", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
