# 2026-05-22 咨询 Agent 原生工具参数校验与展示修复

状态：已在独立 worktree 修复并验证，待验收 / 待合并决策

## 背景

用户截图显示咨询台 Agent 执行过程里出现两张失败工具卡：

- `编辑策略资产`：`arguments: Unrecognized key: "currentSuggestion"`
- `更新内容日历`：`arguments: Unrecognized keys: "strategyTags", "contentCalendarGenerationStatus", "contentCalendarGenerationId"`

这些字段属于模型侧旧习惯或运行态状态字段。工具契约仍应严格拒绝这类参数，但内部参数错误不应直接污染商家聊天界面的执行过程展示。

## 修复内容

- 保持 `app/src/server/api/consultation-runtime/tools.ts` 中写入触发类工具的 Zod 参数校验为 `.strict()`：
  - `merchantRoundArgsSchema`
  - `contentCalendarItemArgsSchema`
  - `updateContentCalendarArgsSchema`
- 保留工具 JSON Schema 的 `additionalProperties: false`，由 schema 继续定义严格参数契约。
- 在原生 tool calling 的工具说明里只保留正向 arguments 边界：
  - `update_strategy_snapshot` 只传 `merchantId / round / stage`
  - `update_content_calendar` 只传 `calendar / merchantId / round / stage`
- 移除主模型可见工具说明中的内部字段清单，`update_strategy_snapshot` 对主模型只描述为更新右侧策略资产整体文档。
- 在 `app/src/server/api/consultation-service.ts` 中过滤 `native_tool_call_rejected`，这类内部参数校验失败仍进入 runtime trace / event / snapshot，但不作为商家聊天顶部的执行事实卡展示。
- 在 `app/src/server/api/consultation-service.test.ts` 增加源码级回归断言，防止后续再次用 strip 放宽契约或把反向字段提示放回主模型工具说明。
- 新增可视化评审页 `docs/架构规范/2026-05-22-咨询Agent工具调用与上下文现状评审.html`，用于查看当前 system prompt、tools 描述、schema 校验、runtime trace 和商家 UI 展示边界。
- 该 HTML 已补充“可编辑评审”区：排除 `agent systemPrompt` 和 `soul.md`，展示其他固定上下文 / tools 描述 / schema / user JSON 结构；鼠标悬浮可看全文，点击“评审”可编辑内容、写建议并导出修改 JSON。
- 根据人工评审意见，新增问题记录文档 `docs/架构规范/2026-05-22-咨询Agent上下文与工具边界反思.md`。本轮只记录，不改造；重点包括 active skill 每轮重复注入、用户资料不应是 LLM 可见工具、历史内容不应是普通工具、user JSON 结构需要重新审视。

## 验证结果

在 worktree `../jingjing-agent-tool-schema-fix` 执行：

```bash
pnpm install --frozen-lockfile --offline
node --test src/server/api/consultation-service.test.ts
pnpm typecheck
pnpm lint
```

结果：

- `node --test src/server/api/consultation-service.test.ts`：50 pass，0 fail。
- `pnpm typecheck`：通过。
- `pnpm lint`：0 error，10 warning。warning 均为既有 unused import，涉及 `current-user.ts`、`content-draft-repository.ts`、`video-edit-job-repository.ts`，与本次改动无关。
- `node -e` 解析 HTML 内嵌脚本：通过。

## 合并状态

- 分支：`codex/agent-tool-schema-fix`
- Worktree：`../jingjing-agent-tool-schema-fix`
- 是否 push：否
- 是否 merge：否
