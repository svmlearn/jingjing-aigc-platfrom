---
name: code-review
description: Use for two-stage review of Jingjing worktree changes against a task brief, PRD, architecture docs, handoff/progress evidence, and validation results. Produces concrete findings and merge advice; does not fix code.
---

# Code Review

Use this skill for merge-readiness and independent review.

## Inputs

Prefer a complete review packet:

1. Task brief and acceptance criteria.
2. Worktree path.
3. Base/head refs or diff.
4. Source docs.
5. Implementer report.
6. Validation logs.
7. Long-task-gate report, if enabled.

If the review packet is missing core facts, return `NEEDS_CONTEXT`.

## Stage 1: Spec Compliance

Check whether the implementation did the right thing:

1. Task goals completed.
2. PRD/architecture/handoff/progress respected.
3. No unauthorized files or scope creep.
4. No exploration written as implemented fact.
5. Required docs and validation evidence present.
6. Account, merchant, store, platform, environment, database, storage, and publish targets are not confused.

If Stage 1 has a blocking issue, stop and return the blocking findings plus a fix prompt. Do not bury a spec miss under code-quality comments.

## Stage 2: Code Quality

Run only after Stage 1 is acceptable.

Check:

1. Bugs, regressions, race conditions, and error paths.
2. Data model, API contract, state machine, and worker boundary changes.
3. Unnecessary broad refactors.
4. Mock/fallback/skeleton/stale-artifact false success.
5. Missing tests or untrustworthy validation.
6. Security risks, hardcoded secrets, and accidental local paths.

## Evidence Rules

Use concrete evidence:

- File path and line when possible.
- Diff hunk or function name when line numbers are unstable.
- Command output summary for validation.
- Gate report path/status for long tasks.

Do not fix code in this skill. If a fix is needed, write a clear implementer prompt.

## Output Format

Return in Chinese:

```text
阻塞问题：
1. [P0/P1] file:line - issue, impact, fix direction

非阻塞问题：
1. ...

验证结果：
- 已看到：
- 缺失：
- 无法验证：

long-task-gate：
- enabled/disabled/status

合并建议：
- 可合并 | 修复后再审 | 暂不合并

给 implementer 的下一轮修复指令：
...
```
