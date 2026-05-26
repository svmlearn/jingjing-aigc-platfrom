---
title: 先做影响分析再删除代码
source: user-correction
occurrences: 1
status: active
created: 2026-05-26
updated: 2026-05-26
---

## Signal

用户在 worker Top8 预取修复中纠正：不能听到“删掉旧路径”就直接删，必须先看会不会有问题。

## Better Rule

涉及运行链路、历史兼容、素材/发布/账号/worker/数据库等高风险代码时，即使目标是删除旧逻辑，也要先做影响面检查：找调用链、对照正确基线、确认替代路径、更新契约测试，再做最小且可解释的删除。

## Where It May Graduate

`AGENTS.md` / `bug-fixer` / `jingjing-dev-workflow`
