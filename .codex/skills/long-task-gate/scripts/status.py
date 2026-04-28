#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import LongTaskError, active_path, gate_report_path, load_active, read_json, repo_root, update_active


def main() -> int:
    parser = argparse.ArgumentParser(description="Show or update long task gate status.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("show")
    pause = sub.add_parser("pause")
    pause.add_argument("--reason", required=True)
    sub.add_parser("resume")
    block = sub.add_parser("block")
    block.add_argument("--reason", required=True)
    clear = sub.add_parser("clear")
    clear.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    root = repo_root(Path.cwd())

    if args.command == "show":
        active = load_active(root)
        if not active:
            print("No active long task.")
            return 0
        print(json.dumps(active, ensure_ascii=False, indent=2))
        report = gate_report_path(root)
        if report.exists():
            value = read_json(report)
            print("\nLatest gate report:")
            print(json.dumps({k: value.get(k) for k in ("status", "checkedAt", "nextInstruction")}, ensure_ascii=False, indent=2))
        return 0

    if args.command == "pause":
        update_active(root, {"status": "paused", "pauseReason": args.reason})
        print("Long task paused.")
        return 0

    if args.command == "resume":
        update_active(root, {"status": "active", "pauseReason": None, "blockReason": None})
        print("Long task resumed.")
        return 0

    if args.command == "block":
        update_active(root, {"status": "blocked", "blockReason": args.reason})
        print("Long task marked blocked.")
        return 0

    if args.command == "clear":
        if not args.yes:
            raise LongTaskError("Use clear --yes to remove active.json.")
        path = active_path(root)
        if path.exists():
            path.unlink()
        print("Long task active state cleared.")
        return 0

    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LongTaskError as exc:
        print(f"long-task-gate status failed: {exc}", file=sys.stderr)
        raise SystemExit(2)
