---
name: long-task-gate
description: Use when the user wants a single Codex window to keep working on a long task until an explicit Completion Gate passes. Provides project-local scripts for starting a gated task, running hard checks plus an independent Codex verifier, and preventing premature Stop via a silent opt-in Stop hook.
---

# Long Task Gate

Use this skill when the user says a task should continue until a Completion Gate passes, especially when they provide handoff/progress/PRD files and do not want the agent to stop early.

This skill is project-local. Runtime state lives in `.codex/long-task/` and is ignored by Git. The skill and scripts live in `.codex/skills/long-task-gate/`.

## Core Rule

The main agent may start, pause, resume, or mark a task blocked. It must not mark a task complete directly.

Completion is written only by `scripts/check.py` after both conditions pass:

1. Hard gates pass: deterministic commands and evidence checks from `contract.json`.
2. Independent verifier passes: a fresh `codex exec` review returns valid JSON with `verdict: "pass"`.

If either fails, status remains `active`, the Stop hook blocks stopping, and the agent must continue from the report's `nextInstruction`.

## Start A Long Task

When the user asks to enter long-task mode, run:

```bash
python3 .codex/skills/long-task-gate/scripts/start.py \
  --task-id <short-id> \
  --completion-promise <PROMISE_TOKEN> \
  --source-doc docs/handoff/<task>.md \
  --source-doc docs/progress/<task>.md
```

Then inspect `.codex/long-task/contract.json` and edit its `hardGates` for the real task. Use the repo's current docs as the source of truth. Do not invent completion criteria that are not in the task docs.

## Check Progress

After implementing and updating evidence docs, run:

```bash
python3 .codex/skills/long-task-gate/scripts/check.py
```

Use `--skip-verifier` only for debugging the hard gates. A real completion requires the verifier.

The check writes `.codex/long-task/gate-report.json`.

## Pause, Resume, Or Block

Use:

```bash
python3 .codex/skills/long-task-gate/scripts/status.py show
python3 .codex/skills/long-task-gate/scripts/status.py pause --reason "user paused"
python3 .codex/skills/long-task-gate/scripts/status.py resume
python3 .codex/skills/long-task-gate/scripts/status.py block --reason "missing staging secret"
```

`blocked` is only for external blockers such as missing credentials, unavailable services, or permissions. Ordinary bugs, failing tests, missing docs, and unfinished UI are not blockers; continue working.

## Stop Hook Behavior

The project Stop hook is silent by default:

- No `.codex/long-task/active.json`: allow stop.
- `status` is `paused`, `blocked`, or `complete`: allow stop.
- `status` is `active` and the latest gate report is missing, failed, or stale: block stop and tell the agent what to do next.
- `status` is `active` and gate report is complete: allow stop.

This means ordinary conversations are unaffected.

## Verifier Expectations

The independent verifier is conservative:

- It runs in a fresh `codex exec` session.
- It receives only task docs, contract, hard-gate results, and repo evidence.
- It should not edit files.
- It must output JSON matching `assets/verifier-output.schema.json`.
- Unclear evidence means `fail`, not `pass`.

## Final Response Rule

Only after `check.py` writes `status: "complete"` may the main agent output the configured completion promise, for example:

```text
<promise>CLOUD_DEMO_COMPLETE</promise>
```
