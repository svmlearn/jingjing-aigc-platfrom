---
name: evolution-engine
description: Use to scan .codex/feedback/ and propose AGENTS.md, skill, or template improvements. It generates recommendations only; every change requires explicit user confirmation.
---

# Evolution Engine

Use this skill to turn repeated workflow feedback into proposed improvements.

## Inputs

Read:

1. `.codex/feedback/FEEDBACK-INDEX.md`
2. Referenced feedback topic files
3. Related `AGENTS.md` or skill files only when needed

If no feedback directory exists, return `无进化建议`.

## Signals

Suggest an evolution when:

1. A feedback topic appears 3+ times.
2. Multiple feedback files point to the same weak AGENTS rule.
3. A skill repeatedly misses the same workflow case.
4. A repeated operation would benefit from a new template or skill.

Do not invent recommendations without evidence.

## Output

Return in Chinese:

```text
进化建议（共 N 条）

规则毕业：
1. feedback: ...
   建议写入：AGENTS.md / skill / template
   建议内容：...
   操作：确认 / 跳过 / 延后

Skill 优化：
...

新 Skill / 模板候选：
...
```

## Hard Rule

Do not edit `AGENTS.md`, skills, templates, or hooks automatically. Show suggestions to the user and wait for explicit confirmation.
