---
name: jingjing-dev-workflow
description: Use when planning, implementing, delegating, or reviewing development work in the Jingjing Xiaohongshu/Douyin matrix project. Covers Controller routing, worktree isolation, Codex subagents, implementer/code-reviewer handoff, long-task-gate decisions, and handoff/progress expectations.
---

# Jingjing Dev Workflow

Use this skill as the project development controller. It does not replace product, design, video-run, or server-time skills; it decides which workflow to use and how to keep implementation, review, and handoff clean.

## First Read

For any nontrivial task, read:

1. `AGENTS.md`
2. `docs/README.md`
3. The relevant PRD / architecture / handoff / progress files named by the task
4. `docs/协作/2026-05-24-AGENTS开发流程合并规划.md` when changing Agent workflow itself

Treat `docs/README.md` as the current architecture index. Current mainline is domestic self-hosted app/worker, PostgreSQL, and Aliyun OSS; old Supabase/COS/Vercel notes are historical unless the task explicitly targets compatibility or cleanup.

## Route The Task

Choose the smallest workflow that is safe:

1. Discussion / planning only: answer or write planning docs; do not edit code.
2. Small local edit: patch directly if scope is narrow and no parallel work is likely.
3. Implementation task: use worktree isolation when more than one file, more than one turn, dirty main tree, parallel work, or high-risk app/worker/platform changes are involved.
4. Long task: if the user asks to continue until a Completion Gate passes, or the task has many hard checks and should not stop early, use `long-task-gate`.
5. Review task: use `code-reviewer` after implementation, before merge, or whenever the user asks for review.
6. Real remote video/server timing task: use `jingjing-video-edit-run` or `server-time-test` instead of this generic workflow.

## Controller Rules

The main Agent is the Controller. It must:

1. Decide whether the task is short or long.
2. Decide whether a worktree is required.
3. Decide whether to spawn `implementer`, `code-reviewer`, or both.
4. Provide complete context to each subagent; do not rely on hidden session memory.
5. Keep write scopes disjoint when multiple agents run.
6. Review subagent outputs before accepting them.
7. Keep push/merge decisions with the user unless explicitly authorized.

## Implementer Brief Template

When spawning or briefing `implementer`, include:

```text
Task:
Worktree:
Branch/base:
Long-task-gate: enabled/disabled
If enabled: task id, completion promise, source docs, hard gates
Source docs:
Allowed files/modules:
Forbidden files/modules:
Implementation requirements:
Validation commands:
Handoff/progress requirement:
Commit policy:
Push/merge policy:
Output format:
```

If any field is unknown and risky, resolve it before spawning. If the user explicitly wants the implementer to create the worktree, say so; otherwise Controller should create or name the worktree.

## Code Review Trigger

Run `code-reviewer` when:

1. `implementer` has finished a worktree task.
2. A long-task gate report exists or the task explicitly did not use gate.
3. The change is headed toward merge, handoff, release, or user acceptance.
4. The task touched PRD-sensitive, architecture-sensitive, worker, account, publish, storage, database, or auth code.

Review is two-stage:

1. Spec compliance: did it implement the assigned behavior and respect source docs?
2. Code quality: are there bugs, regressions, missing tests, contract breaks, fake fallbacks, or merge blockers?

## Long Task Gate

Do not rely on keyword accidents. The Controller must explicitly write one of these into the implementer brief:

```text
Long-task-gate: enabled
```

or:

```text
Long-task-gate: disabled
```

When enabled, follow `.codex/skills/long-task-gate/SKILL.md`. Completion is only valid after its check script and independent verifier mark the task complete.

## Project Memory And Feedback

Use existing project memory:

- `docs/handoff/` for handoff and frozen branch state.
- `docs/progress/` for executed facts and verification evidence.
- `docs/产品文档/` and `docs/架构规范/` for stable product/architecture truth.

Do not introduce a separate memory system by default.

Feedback is different from project memory. If the user corrects Agent behavior or process, record it only when it is reusable as a workflow improvement. First version can be manual; do not add feedback hooks unless the user asks or the workflow has stabilized.

## Final Check

Before finishing, report:

1. Files changed.
2. Whether subagents/worktrees/gate/review were used.
3. Validation run and results.
4. Handoff/progress written or why not needed.
5. Push/merge status.
