---
name: dev-builder
description: Use for bounded implementation work in the Jingjing project after a Controller provides a task brief, worktree/branch context, source docs, allowed files, validation commands, and long-task-gate status. Adapted from the reference project dev-builder skill for Codex/worktree/subagent execution.
---

# Dev Builder

Use this skill when acting as an implementation agent for this project.

## Required Inputs

Do not start editing until the task brief provides:

1. Task goal and acceptance criteria.
2. Worktree path or explicit permission to create one.
3. Branch/base ref.
4. Source docs: PRD, architecture, handoff, progress, or issue notes.
5. Allowed files/modules.
6. Forbidden files/modules.
7. Validation commands.
8. Long-task-gate: enabled or disabled.
9. Commit, push, and merge policy.

If a required item is missing and guessing could change scope, return `NEEDS_CONTEXT`.

## Core Rules

1. Make the smallest defensible change that satisfies the task.
2. Follow existing project patterns before inventing new abstractions.
3. Do not revert or overwrite unrelated user/agent changes.
4. Do not use mock, fallback, skeleton, or stale artifacts as success evidence.
5. Do not push or merge unless the task explicitly authorizes it.
6. Commit only if the task brief asks the implementer to commit.
7. If the task is marked long, follow `.codex/skills/long-task-gate/SKILL.md`.

## Current Project Truth

Use `docs/README.md` as the current architecture index.

Current mainline is domestic self-hosted app/worker, PostgreSQL, and Aliyun OSS. Supabase Cloud, Vercel, Tencent COS, and old staging docs are historical unless the task explicitly targets compatibility, cleanup, or archaeology.

## Workflow

1. Read `AGENTS.md`, `docs/README.md`, and task-specific source docs.
2. Check `git status` in the assigned worktree.
3. Confirm scope and affected files.
4. Implement in small patches.
5. Run the specified validation.
6. If validation fails, fix within scope and rerun.
7. Write handoff/progress only when the task requires it or when results need future handover.
8. Report exact status, changed files, validation results, and remaining risk.

## Output Format

Return in Chinese:

```text
状态：DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

已实现内容：
- ...

改动文件：
- ...

验证结果：
- command: result

long-task-gate：
- enabled/disabled, status, report path

commit/diff 状态：
- ...

遗留风险：
- ...

给 code-reviewer 的审查入口：
- worktree:
- base/head:
- 重点文件:
- 已知风险:
```
