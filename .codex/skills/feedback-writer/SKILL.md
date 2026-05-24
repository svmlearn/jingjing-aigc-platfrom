---
name: feedback-writer
description: Use when the user corrects AI behavior, project workflow, validation discipline, subagent routing, or skill usage in a reusable way. Records process feedback under .codex/feedback/ for later evolution; does not replace handoff/progress project memory.
---

# Feedback Writer

Use this skill only for reusable workflow feedback. Do not record ordinary project facts here.

## Feedback vs Project Memory

Use:

- `docs/handoff/` for task handover and frozen branch state.
- `docs/progress/` for execution facts and validation evidence.
- `.codex/feedback/` for AI behavior/process improvement signals.

Do not create a separate project memory system by default.

## Record A Feedback Item When

1. The user corrects Agent behavior.
2. The user changes the desired development workflow.
3. A skill lacks guidance for a repeated real situation.
4. A validation, review, worktree, or subagent rule needs to become reusable.
5. A process mistake appears likely to recur.

Do not record when:

1. The user is only giving task-specific requirements.
2. The point belongs in PRD, architecture, handoff, or progress.
3. The signal is a one-off preference with no reuse value.

## Storage

Use project-local files:

```text
.codex/feedback/
  FEEDBACK-INDEX.md
  <topic>.md
```

If the directory or index does not exist, create it.

## Topic File Shape

```markdown
---
title: Short feedback title
source: user-correction
occurrences: 1
status: active
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Signal

What the user corrected.

## Better Rule

Reusable behavior change.

## Where It May Graduate

AGENTS.md / skill name / template name.
```

## Return

Return one line:

- `记录了 1 条 feedback：<title>（<file>）`
- `更新了 feedback：<title>，occurrences N -> N+1`
- `无新 feedback`
