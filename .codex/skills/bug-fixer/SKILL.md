---
name: bug-fixer
description: Use for targeted bug fixes in the Jingjing project after a symptom, failing validation, or code-review finding is known. Focuses on evidence collection, root cause, one-change-at-a-time repair, and regression validation.
---

# Bug Fixer

Use this skill when the task is specifically to fix a known bug, failing check, runtime exception, or review finding.

## Inputs

Need at least:

1. Symptom or review finding.
2. Reproduction steps or failing command.
3. Worktree/branch.
4. Allowed files/modules.
5. Expected behavior from PRD/architecture/handoff when relevant.

If the symptom is too vague to locate safely, ask for context or return `NEEDS_CONTEXT`.

## Four-Stage Debugging

1. Collect evidence: full error, stack, logs, failing command, recent diff, related files.
2. Analyze pattern: compare similar working flows and trace data/control flow.
3. Form hypotheses: at most three, each with a validation method.
4. Fix one cause: make one focused change, then rerun the failing check and nearby regression checks.

## Rules

1. Do not "try random fixes".
2. Do not fix multiple unrelated issues in one pass.
3. Do not mask the bug with fallback/mock/skeleton output.
4. Do not broaden scope without Controller approval.
5. If three focused attempts fail, stop and report that the root assumption should be revisited.

## Output

Return in Chinese:

```text
状态：FIXED | FIXED_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
根因：
修复：
改动文件：
验证：
回归检查：
剩余风险：
```
