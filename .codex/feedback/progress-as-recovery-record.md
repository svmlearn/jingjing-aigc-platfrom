---
title: Progress 要能支持未来恢复和排障
source: user-correction
occurrences: 1
status: active
created: 2026-05-26
updated: 2026-05-26
---

## Signal

用户纠正 progress 写法：不能只记录“这次跑通了”。如果未来突然发现问题，接手者应该能通过当时的 progress 复原原因、边界、隐性问题、半成功状态和恢复路径。

## Better Rule

重要任务的 progress 应按“未来排障入口”来写：记录问题原貌、根因判断、前后状态、实际改动、验证证据、半成功/补跑、中断点、未覆盖范围、隐性风险和回滚/恢复步骤。尤其涉及生产数据、账号授权、OSS/DB 迁移、worker、发布链路、素材库、视频生成或真实商家账号时，不能只写成功结论。

## Where It May Graduate

`AGENTS.md` / `jingjing-dev-workflow` / handoff-progress 模板
