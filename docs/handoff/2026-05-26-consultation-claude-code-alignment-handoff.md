# 2026-05-26 咨询 Agent Claude Code 对齐交接

## 当前目标

把咨询台 Agent 的工具协议、模型可见上下文、策略资产上下文按用户确认的 Claude Code 对齐原则收紧：工具结果是唯一事实来源，策略资产工具不再要求模型传系统上下文，runtime context 不再暴露僵硬业务状态机。

## Worktree / Branch

- worktree：`/Users/wy/.codex/worktrees/consultation-claude-code-alignment`
- branch：`codex/consultation-claude-code-alignment`
- base：`main @ c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2`
- push：未 push
- merge：未 merge
- long-task-gate：disabled

## 已完成

1. 工具协议
   - `update_strategy_snapshot` 模型可见参数改为空对象 `{}`。
   - `update_content_calendar.calendar` 改为必填，缺失/空值返回 failed tool result。
   - tool result JSON 增加 `is_error`，失败原因对模型可见。
   - unknown/hidden/disabled/schema/runtime 错误均进入 tool result。

2. 模型可见上下文
   - 移除 `conversationContext` 中的 `round/stage/summaryText/recentMessages`。
   - 真实历史继续通过 `buildConversationHistoryMessages` 注入。
   - `strategySnapshotContext` 只保留策略资产目标字段。
   - 新增独立 `contentCalendarContext`。
   - `selectedKnowledgeContext/evidence` 改为 `selectedRetrievalContext/retrievalRole`。

3. 策略资产
   - 目标字段收敛为 `positioning/coreSellingPoints/targetAudiences/keyScenes/strategyTags/strategyMarkdown`。
   - `currentSuggestion` 不再作为策略资产 Editor tool schema、Editor 输入、runtime context 的模型合同。
   - 旧 DTO 兼容字段继续保留，未做 migration。
   - 策略资产 Editor 使用当前 loop 内 `state.strategySnapshot/state.strategyMarkdown`，不再固定读 session 旧快照。

4. 测试与文档
   - 更新并新增 consultation-service 源码断言，覆盖反模式不存在、工具失败原因回灌、隐藏工具、tool loop state 收缩。
   - 返工补充一个最小行为测试，直接覆盖写工具参数校验失败原因：`update_strategy_snapshot` 多余参数、`update_content_calendar` 缺 `calendar`。
   - 带入产品修订文档并追加本分支实现记录。
   - 写入 progress：`docs/progress/2026-05-26-consultation-claude-code-alignment.md`。

## 改动文件

- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/planner.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/guards.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`
- `docs/progress/2026-05-26-consultation-claude-code-alignment.md`
- `docs/handoff/2026-05-26-consultation-claude-code-alignment-handoff.md`

## 验证结果

- `git diff --check c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2..HEAD`
  - 通过：无 trailing whitespace 或 whitespace error。
- `cd app && node --test src/server/api/consultation-service.test.ts`
  - 通过：57 tests passed。
  - 备注：Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响结果。
- `cd app && corepack pnpm typecheck`
  - 通过。
- `cd app && corepack pnpm lint`
  - 通过。
- `cd app && NEXT_TELEMETRY_DISABLED=1 corepack pnpm build`
  - 主线程最终验收已重跑并通过。

详细验收过程、Claude Code 参考依据、产品验收矩阵和未完成边界记录在：

- `docs/progress/2026-05-26-consultation-claude-code-alignment.md`

## 已知风险

- `currentSuggestion` 仍存在于 `StrategySnapshotDto` 和旧数据兼容逻辑中。它已经从本轮目标模型合同中移出，但物理删除需要单独迁移任务。
- `context-preflight.ts` 没在本任务允许文件内，本轮未改其旧 tool result compact 兼容逻辑；新生成给模型的 tool result 已在 `runtime.ts` 做模型可见 payload 清理。
- 删除咨询历史后历史面板反复重新加载的问题不在本实现范围。

## 给 code-reviewer 的入口

- base：`c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2`
- head：本分支 HEAD commit
- worktree：`/Users/wy/.codex/worktrees/consultation-claude-code-alignment`
- 重点文件：
  - `app/src/server/api/consultation-runtime/tools.ts`
  - `app/src/server/api/consultation-runtime/runtime.ts`
  - `app/src/server/api/consultation-runtime/context.ts`
  - `app/src/server/api/consultation-service.ts`
  - `app/src/server/api/consultation-service.test.ts`
- 审查重点：
  - `update_strategy_snapshot` 是否真正对模型只暴露 `{}`。
  - schema failure / hidden tool / unknown tool 是否都以 failed tool result 回灌。
  - `contentCalendarContext` 是否已从策略资产上下文拆出。
  - `currentSuggestion` 是否仅剩 DTO/旧数据兼容，不再是模型目标合同。
  - `tool_loop_state` 是否已收缩到项目 JSON loop 最小必要字段。
