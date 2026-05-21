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
