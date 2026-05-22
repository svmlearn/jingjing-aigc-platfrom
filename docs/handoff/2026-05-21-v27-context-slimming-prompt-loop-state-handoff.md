# 2026-05-21 V2.7 上下文工程瘦身继续实现 Handoff

## 当前目标

继续落地 `docs/产品文档/V2.7-咨询Agent上下文工程瘦身PRD.md` 中剩余 P0/P1 要求，重点避免已经从主 user JSON 移走的冗余内容回流到 system prompt、JSON `tool_loop_state` 或其他 LLM 消息。

## 分支和 worktree

- worktree：`/Users/wy/.codex/worktrees/v27-context-slimming`
- branch：`codex/v27-context-slimming-20260521`
- push / merge：未 push，未 merge
- 最终 commit：本 handoff 所在提交；具体 hash 以 `git log -1 --oneline` 和最终回复为准。

## 已完成内容

### 1. system prompt 工具规则瘦身

修改文件：

- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-runtime/context.ts`

完成内容：

- `buildNativeToolCallingMessages` 只保留 native tool calling 最小协议和 PRD 9.4.2 白名单规则。
- `buildJsonToolLoopMessages` 只保留 JSON `tool_use` / `final` 最小协议、读取前序 `tool_result` 的协议提醒，以及 PRD 9.4.2 白名单规则。
- 删除旧链路说明：“不再通过用户端图文工作台或视频工作台作为前置”。
- 删除 `generate_article_brief` / `generate_video_brief` 的 system prompt 说明。
- 删除依赖 `observations` 判断是否已检索的 prompt 表述，改为“业务结果以前序 `tool_result` 消息为准”。
- 删除重复日历规则，保留“生成、补充或调整内容日历/营销日历/团队选题/本周图文/视频任务时，优先考虑 `update_content_calendar`”。
- `slim_v2` system prompt 删除 JSON `observations` 权威来源说法，并移除重复的 calendar_work 条件规则。

### 2. JSON tool loop 状态消息瘦身

修改文件：

- `app/src/server/api/consultation-runtime/runtime.ts`

完成内容：

- 删除 `tool_loop_state.decisionRules`。
- 删除 `tool_loop_state.observations[].summary`。
- 删除 `tool_loop_state.availableTools` 中 description / inputSchema 级别的膨胀上下文。
- 当前 `tool_loop_state` 只保留：
  - `availableToolNames`
  - `completedToolNames`
  - `failedToolNames`
  - `skippedToolNames`
  - `writeToolsAlreadyUsed`
- 工具业务结果仍只通过前序 `tool_result` 消息进入 JSON loop。

### 3. LLM 可见工具集合收口

修改文件：

- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/planner.ts`

完成内容：

- 增加 `isLlmVisibleConsultationTool`，将 `generate_article_brief` / `generate_video_brief` 从 LLM API tools 和 business tool prompt 中隐藏。
- JSON planner 的 ordered tools 不再包含这两个 brief 工具。
- JSON planner 的 user payload 不再复述 `observations.summary`，只保留失败/跳过状态列表。

说明：这没有删除 legacy brief 工具实现、schema 或旧 handler，只是切断 LLM 可见暴露面。

### 4. 测试更新

修改文件：

- `app/src/server/api/consultation-service.test.ts`

完成内容：

- 原先确认旧流程规则存在的源码断言，改成确认瘦身后字段和边界存在。
- 增加对 `availableToolNames` / `completedToolNames` / `failedToolNames` / `skippedToolNames` / `writeToolsAlreadyUsed` 的源码保护。
- 增加对 `observations: input.toolResults.map` 不再存在的保护。

## 预算硬执行现状

已确认：

- 主模型 user JSON 中没有 `budget` report。
- `buildSlimContextPackSystemPrompt` 不再把 `budget` 作为 system prompt 可见内部字段点名。
- `runtimeSnapshot` / `contextBoundary` 仍保留 budget 和 over-budget omission trace。

尚未完成：

- `buildContextBudgetReport` 仍主要是 report/debug 结构。
- `compactBoundary.status` 仍是 `not_applied`。
- 尚未实现完整 preflight enforcer、bucket selector、clipper 和 omit policy。

建议下一步单独拆 P1：在消息发送前的 selector/preflight 层实现预算裁剪，尤其覆盖 tool result compact、skill body/reference 裁剪、保留 native tool call/result pair。

## 验证结果

执行目录：`/Users/wy/.codex/worktrees/v27-context-slimming/app`

已通过：

```bash
corepack pnpm typecheck
corepack pnpm lint
node --test src/server/api/consultation-service.test.ts
corepack pnpm build
git diff --check
```

说明：

- `corepack pnpm lint` 通过，但仍有 10 个既有 unused warnings，文件在 `src/lib/auth/current-user.ts`、`src/lib/db/content-draft-repository.ts`、`src/lib/db/video-edit-job-repository.ts`，不在本轮改动范围。
- `node --test` 通过 45 项；Node 仍提示 package 未声明 `"type": "module"`，这是既有 warning。

## rg 自查结果

命令：

```bash
rg -n "generate_article_brief|generate_video_brief|不再通过用户端图文工作台|decisionRules|observations.*summary|tool_loop_state" app/src/server/api
```

结论：

- `不再通过用户端图文工作台`：无业务源码命中。
- `decisionRules`：无命中。
- `observations.*summary`：无命中。
- `tool_loop_state`：仅剩 runtime 构造和测试断言，属于预期。
- `generate_article_brief` / `generate_video_brief`：仍在 schema、legacy tool registry、legacy handler 和 LLM hidden set 中出现；不会进入 system prompt、business tool prompt、API tools 或 JSON planner ordered tools。

## 当前状态

状态：代码已实现并验证，待用户验收 / 待合并决策。

本轮不 push、不 merge。主 worktree 进入本轮前已有的未提交文档改动未覆盖、未纳入本轮说明。

## 2026-05-21 follow-up 小补丁

触发原因：`c6b224f` 后继续修 4 个小问题，不重做大改。

本次补丁完成：

1. JSON tool loop 继续不把 schema 放回 `tool_loop_state`，但在 JSON loop system protocol 中补了 `update_content_calendar` 的极简参数契约：`calendar[]`，每项至少 `dayLabel` / `contentType` / `title` / `summary`。
2. skipped / failed / guardrail rejected 诚实规则只保留在 `buildSlimContextPackSystemPrompt` 这一处，native prompt 和 JSON prompt 不再重复注入。
3. `parseNativeConsultationToolCall` 增加 `isLlmVisibleConsultationTool` 防御；即使模型猜出 legacy brief 工具名，也会被 rejected，不进入 dispatch。
4. `generate_article_brief` / `generate_video_brief` 从平台默认 `enabledTools` 和平台管理端工具勾选 UI 中移除；legacy schema、registry 和 handler 暂不删除。

本次补丁验证：

```bash
node --test src/server/api/consultation-service.test.ts
git diff --check
corepack pnpm typecheck
```

`rg` 自查命令：

```bash
rg -n "generate_article_brief|generate_video_brief|decisionRules|observations.*summary|工具返回 skipped|工具结果是 skipped|tool_loop_state" app/src/server/api app/src/components app/src/lib
```

自查结论：

- `decisionRules`：无命中。
- `observations.*summary`：无命中。
- `工具返回 skipped`：无命中。
- `工具结果是 skipped`：只剩 `buildSlimContextPackSystemPrompt` 一处，符合去重目标。
- `tool_loop_state`：仅 runtime 构造和测试断言。
- `generate_article_brief` / `generate_video_brief`：剩余命中仅在 legacy schema、legacy tool registry、legacy handler 和 hidden set；默认 enabledTools 和平台管理端勾选 UI 已无命中。

## 下一步建议

1. 如继续做 V2.7 P1，优先实现预算 preflight enforcer，而不是继续增加 prompt 规则。
2. 如要彻底清除 `generate_article_brief` / `generate_video_brief` 的源码命中，需要另起任务决定是否删除 legacy schema、tool registry 和 handler。
3. 合并前建议再次确认默认 agent 配置和平台管理端工具配置 UI 是否还展示 legacy brief 工具。

## 2026-05-22 P1 预算硬执行补丁

触发目标：把 consultation agent context budget 从 report/debug 升级为真正的 preflight enforcer，在发送 LLM 前对主模型消息做裁剪和 omit，不再只记录 `over_budget`。

本次补丁完成：

1. 新增 `enforceConsultationMessageBudget`，策略为 `consultation_context_preflight_enforcer_v1`。
2. 在发送模型前执行 message preflight：
   - native tool calling 每轮：`native_tool_calling_turn_${turn}`
   - native final：`native_tool_calling_final`
   - JSON tool loop 每轮：`json_tool_loop_turn_${turn}`
   - JSON final：`json_tool_loop_final`
   - fallback assistant reply：`assistant_reply`
   - strategy asset editor：`strategy_asset_editor`
3. 裁剪/压缩策略：
   - system message 超限时中段裁剪，避免无限注入 skill body / references。
   - user JSON 会压缩 `strategySnapshot`、`currentStrategySnapshot`、`currentKnowledgeMatches`、`recentConversation`、`recentUserMessages`。
   - tool result 会压缩长 `payload` 为 `tool_payload_preview_v1`，并裁剪 `knowledgeMatches[].content`。
   - 总字符仍超限时按消息组保留最近上下文，保留 native assistant tool call + tool result 配对，不拆 pair。
4. `runtimeSnapshot.contextBoundary.compactBoundary` 现在记录：
   - `status: applied | not_applied`
   - `reason`
   - `reports`
   - 每个 report 含 original/final chars、clipped/omitted message count 和 action 明细。
5. budget/report 仍不进入主模型消息；完整 debug 继续留在 runtimeSnapshot/contextBoundary。

本次补丁验证：

```bash
corepack pnpm typecheck
corepack pnpm lint
node --test src/server/api/consultation-service.test.ts
corepack pnpm build
git diff --check
```

说明：

- `node --test` 通过 46 项。
- `corepack pnpm lint` 通过，但仍有 10 个既有 unused warnings，均不在本轮改动文件内。
- 新增测试 `consultation preflight enforces payload budget before model calls`，保护 enforcer、tool payload compact、message omit、各模型调用路径和 debug report。

## 2026-05-22 hard budget selector 小修

触发原因：`f46ac9d` 后发现 `selectMessagesWithinCharBudget` 仍可能不是严格 hard budget，并且保留最近上下文时可能出现“保留最新、跳过中间、又保留更旧”的断层。

本次小修完成：

1. 将 preflight 执行器拆到 `app/src/server/api/consultation-runtime/context-preflight.ts`，`context.ts` 继续 re-export，现有调用路径不变。
2. `enforceConsultationMessageBudget` 现在会在最终返回前执行 hard fit；正常情况下 `report.finalChars <= report.maxTotalChars`。
3. 如果极端情况下连最小消息结构都超过预算，report 会显式记录 `hardBudgetSatisfied: false` 和 `overflowReason`，并追加 `hard_budget_unavoidable` action。
4. 最近上下文选择改成遇到较新的 group 放不下后立即 omit 并停止向更旧消息回捞，避免历史断层。
5. native assistant `toolCalls` 与连续 tool result 作为一个 group 保留或省略；hard clip 只压缩 content/payload，不破坏 `toolCallId` 配对。
6. 新增行为测试覆盖：
   - 超长 system/user/tool messages 仍满足 hard budget。
   - assistant tool call + tool result pair 一起保留或一起省略。
   - 省略较新的历史 group 后不会再保留更旧非 system 消息。

本次验证：

```bash
corepack pnpm typecheck
node --test src/server/api/consultation-service.test.ts
git diff --check
```

结果：

- `corepack pnpm typecheck` 通过。
- `node --test src/server/api/consultation-service.test.ts` 通过 49 项。
- `git diff --check` 通过。
