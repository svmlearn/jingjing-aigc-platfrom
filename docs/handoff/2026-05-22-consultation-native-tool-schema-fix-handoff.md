# 2026-05-22 咨询 Agent 原生工具参数校验修复 Handoff

## 当前目标

修复咨询台 Agent 原生 tool calling 中写入类工具因为模型多传旧字段而失败的问题，避免用户聊天过程中出现僵硬的失败工具卡。

## 已完成内容

- `update_strategy_snapshot` 和 `update_content_calendar` 的运行时参数校验保持 `.strict()`，继续严格拒绝 schema 外字段。
- 主模型可见工具说明只保留正向 arguments 边界，不加入“不要输出某字段”的反向字段提示。
- `update_strategy_snapshot` 对主模型只描述为更新右侧策略资产整体文档，不暴露内部字段清单。
- `native_tool_call_rejected` 仍进入 runtime trace / event / snapshot，但不再作为商家聊天顶部的执行事实卡展示。
- 增加回归测试，覆盖严格 schema、正向工具说明和内部参数错误不展示给商家的约束。
- 新增当前现状可视化评审页：`docs/架构规范/2026-05-22-咨询Agent工具调用与上下文现状评审.html`。
- 评审页包含“可编辑评审”区：排除 `agent systemPrompt` 和 `soul.md`，其他上下文块支持悬浮看全文、点“评审”改正文/写建议、导出修改 JSON。
- 新增问题记录文档：`docs/架构规范/2026-05-22-咨询Agent上下文与工具边界反思.md`。该文档记录人工评审意见和后续改造方向，本轮不改造实现。

## 改动文件

- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/架构规范/2026-05-22-咨询Agent工具调用与上下文现状评审.html`
- `docs/架构规范/2026-05-22-咨询Agent上下文与工具边界反思.md`
- `docs/progress/2026-05-22-consultation-native-tool-argument-tolerance.md`
- `docs/handoff/2026-05-22-consultation-native-tool-schema-fix-handoff.md`

## 验证结果

- `pnpm install --frozen-lockfile --offline`：通过。
- `node --test src/server/api/consultation-service.test.ts`：50 pass，0 fail。
- `pnpm typecheck`：通过。
- `pnpm lint`：0 error，10 warning。warning 为既有 unused import，非本轮引入。
- `node -e` 解析 HTML 内嵌脚本：通过。

## 下一步建议

1. 在 staging 或本地页面复测截图中的连续对话场景，确认不再展示 `Unrecognized key` 失败卡。
2. 验收后由集成者将 `codex/agent-tool-schema-fix` 合入主线。

## 分支与合并状态

- Branch：`codex/agent-tool-schema-fix`
- Worktree：`../jingjing-agent-tool-schema-fix`
- Final commit：提交后以该分支 HEAD 为准
- Push：未 push
- Merge：未 merge
