# 2026-05-26 咨询 Agent Claude Code 工具循环对齐

## 范围

- worktree：`/Users/wy/.codex/worktrees/consultation-claude-code-alignment`
- branch：`codex/consultation-claude-code-alignment`
- base：`main @ c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2`
- long-task-gate：disabled

本次只处理咨询台 Agent runtime / tools / context / strategy asset editor 的工具协议和模型可见上下文，不处理 `workers/**`、DB migration、前端组件或 video-worker 脏改动。

## Claude Code 对齐点

参考本地 Claude Code：

- `src/services/tools/toolExecution.ts`：先 `inputSchema.safeParse`，失败直接返回 `tool_result` / `is_error: true`。
- `src/utils/toolErrors.ts`：把缺参数、多余参数、类型错误格式化为模型可读原因。
- `src/query.ts`：`tool_use` 后执行工具，`tool_result` 回到下一轮消息。
- `src/services/tools/toolOrchestration.ts`：工具结果和 context 更新分层。
- `src/utils/messages.ts`：工具成功以对应 `tool_result.is_error !== true` 判断。

## 已改行为

1. `update_strategy_snapshot` 的模型可见 input schema 改为 `{}` + `additionalProperties: false`。
   - 模型不再传 `merchantId`、`round`、`stage`。
   - 模型误传策略资产正文或其他字段会得到失败 tool result，原因包含 unexpected parameter。

2. 工具校验失败原因按 Claude Code 风格回灌给模型。
   - 缺参数：`The required parameter ... is missing`
   - 多余参数：`An unexpected parameter ... was provided`
   - 类型错误：`The parameter ... type is expected as ...`
   - unknown/hidden/disabled tool、runtime exception 均以 failed tool result 暴露。

3. JSON/native tool result 增加 `is_error` 语义。
   - `result.status !== "completed"` 时 `is_error: true`。
   - 最终回复规则只保留短句：只有 `status=completed` 才能说已更新，`failed/skipped` 必须说明未完成原因。

4. `update_content_calendar` 改为 `calendar` 必填。
   - Zod schema 不再允许缺省 `calendar`。
   - runtime 不再用已有 `contentCalendarDraft` 同步成 completed，缺失/空日历会返回 failed tool result。

5. 策略资产目标字段收敛。
   - 模型可见目标字段：`positioning`、`coreSellingPoints`、`targetAudiences`、`keyScenes`、`strategyTags`、`strategyMarkdown`。
   - `strategyRecommendation` 未新增。
   - `currentSuggestion` 只保留为 `StrategySnapshotDto` / 旧数据兼容字段，不再出现在策略资产 Editor tool schema、Editor 输入上下文、runtime context 的目标字段里。

6. 模型可见上下文拆层。
   - 移除 runtime context 中的 `conversationContext.round/stage/summaryText/history.recentMessages`。
   - 真实历史继续由 `buildConversationHistoryMessages` 作为 message stream 提供。
   - `strategySnapshotContext` 只放策略资产目标字段。
   - `contentCalendarContext` 独立承载内容日历 compact 信息。
   - `selectedKnowledgeContext` / `evidence` 命名改为 `selectedRetrievalContext` / `retrievalRole`。

7. 隐藏工具保持隐藏。
   - `generate_article_brief`、`generate_video_brief` 仍在 registry 中保留兼容 dispatch，但不进入 LLM visible tools。
   - 咨询 Agent 模型可见 context 不再注入 `articleBrief` / `videoBrief`。

8. 商家级策略资产新鲜度。
   - 策略资产 Editor 和 guard 改为读取 `state.strategySnapshot` / `state.strategyMarkdown`，即当前 tool loop 内最新资产。
   - 不再回退到 `state.session.strategySnapshot` 作为同轮编辑基准。

## 返工记录

- code-reviewer 指出产品文档行尾空格导致 `git diff --check c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2..HEAD` 失败；已删除 `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md` 第 3-5 行尾部空格。
- 补充最小行为测试：动态导入 `parseNativeConsultationToolCall`，覆盖 `update_strategy_snapshot` 多余参数和 `update_content_calendar` 缺 `calendar` 时返回具体校验失败原因。
- 未导出 runtime 私有 `buildNativeRejectedToolResult` / `buildNativeToolResultContent`，避免为测试扩大生产 API；`failed/is_error` 结构仍由现有源码断言覆盖。

## 项目特例

- JSON tool loop 仍保留一个最小 `tool_loop_state`，只给出 `availableToolNames` 和 `toolResultPolicy`，用于 JSON-only 模型知道本轮可选工具。这是项目 JSON tool loop 的兼容特例；已移除 `turn/maxTurns/completed/failed/skipped/writeToolsAlreadyUsed`，也不包含业务 `round/stage/下一步追问`。
- `currentSuggestion` 还存在于 DTO、历史 session JSON、`isStrategySnapshot` 兼容校验和旧数据读取中。本轮没有 DB migration，未物理删除旧字段。

## 验证

- `git diff --check c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2..HEAD`
  - 返工前失败：产品文档第 3-5 行 trailing whitespace。
  - 返工 amend 后通过：无输出。
- `cd app && node --test src/server/api/consultation-service.test.ts`
  - 通过：57 tests passed。
  - 备注：Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响结果。
- `cd app && corepack pnpm typecheck`
  - 通过：`tsc --noEmit` 无错误。
- `cd app && corepack pnpm lint`
  - 通过：ESLint 无错误。
- `cd app && NEXT_TELEMETRY_DISABLED=1 corepack pnpm build`
  - 实现后通过：Next.js 16.2.4 production build compiled successfully，TypeScript 和静态页面生成完成。

## 主线程最终验收记录

### 文档归档判断

本次最终验收的过程、命令、代码证据和结论属于执行事实，归入 `docs/progress/2026-05-26-consultation-claude-code-alignment.md`。

`docs/handoff/2026-05-26-consultation-claude-code-alignment-handoff.md` 只保留交接入口和最终验收指针，不把详细流水账重复写入 handoff。

### 验收依据

1. 产品基准文档：
   - `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`
   - 来源基线：`/Users/wy/.codex/worktrees/consultation-small-fixes/docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md`

2. Claude Code 本地参考：
   - `references/open-source/claude-code项目/claude-code-main/src/query.ts`
   - `references/open-source/claude-code项目/claude-code-main/src/services/tools/toolExecution.ts`
   - `references/open-source/claude-code项目/claude-code-main/src/services/tools/toolOrchestration.ts`
   - `references/open-source/claude-code项目/claude-code-main/src/utils/messages.ts`

3. 参考项目确认到的核心事实：
   - Claude Code 在工具执行前用 `inputSchema.safeParse` 校验输入。
   - 参数校验失败会生成 `tool_result`，并设置 `is_error: true`。
   - 工具调用后，结果以 `tool_result` 回到下一轮消息。
   - 最近工具是否成功以对应 `tool_result.is_error !== true` 判断。
   - 缺失 tool result 时会补 synthetic error `tool_result`，避免模型以为工具已经成功。

### 主线程复核过程

1. 读取并对照产品基准文档。
2. 检查实现分支状态、diff 范围和改动文件。
3. 抽查关键实现文件，确认模型可见 schema、runtime context、tool result、策略资产 Editor 输入和旧字段兼容边界。
4. 抽查本地 Claude Code 参考项目，确认本分支采用的是 `tool_use -> tool_result -> is_error/status` 路线，而不是自然语言检测路线。
5. 重跑最终验证命令。
6. 明确未完成事项，避免把本分支没有处理的问题写成已解决。

### 最终验证命令

- `git diff --check c00ae07f2c670a6c6d3a35f6a8570bc6f51dc8a2..HEAD`
  - 通过：无输出。
- `node --test app/src/server/api/consultation-service.test.ts`
  - 通过：57 tests passed。
  - 备注：Node 输出 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响结果。
- `cd app && npm run typecheck`
  - 通过：`tsc --noEmit` 无错误。
- `cd app && npm run lint`
  - 通过：ESLint 无错误。
- `cd app && npm run build`
  - 通过：Next.js 16.2.4 production build compiled successfully，TypeScript 与静态页面生成完成。

### 产品验收矩阵

| 验收项 | 证据位置 | 结论 |
| --- | --- | --- |
| `update_strategy_snapshot` 对模型只暴露 `{}` | `app/src/server/api/consultation-runtime/tools.ts`：`emptyToolParameters`、`validateEmptyToolArgs("update_strategy_snapshot")`、工具描述要求空对象 | 通过 |
| `merchantId / round / stage` 不再由模型传给策略资产工具 | `buildConsultationToolArgs` 对 `update_strategy_snapshot` 返回 `{}`；模型可见 schema 无这三个字段 | 通过 |
| 模型误传策略正文或语义字段不再被当作工具合同 | `emptyToolArgsSchema.strict()`，`formatSchemaError` 返回 unexpected parameter；测试覆盖 `strategyMarkdown` 误传 | 通过 |
| 工具失败原因回到 tool result | `buildNativeRejectedToolResult`、`buildToolRuntimeErrorResult`、`buildJsonToolResultContent`、`buildNativeToolResultContent` | 通过 |
| tool result 有 Claude Code 风格成功/失败语义 | native 和 JSON tool result 均包含 `is_error: result.status !== "completed"` | 通过 |
| `update_content_calendar.calendar` 必填 | `updateContentCalendarParameters.required = ["calendar"]`；`updateContentCalendarArgsSchema` 要求 `calendar`；测试覆盖缺失 `calendar` | 通过 |
| 去掉自然语言“已更新”检测器 | 源码不再包含 `guardAssistantWriteClaims`；最终回复规则改为只看 tool result status | 通过 |
| runtime context 去掉模型可见 `round/stage/summaryText/recentMessages/conversationContext` | `buildConsultationRuntimeContextMessage` 只输出 `merchantProfileContext`、`expertRoutingContext`、`strategySnapshotContext`、`contentCalendarContext`、`selectedRetrievalContext`、`toolResultsContext` | 通过 |
| 内容日历拆为独立 `contentCalendarContext` | `buildConsultationRuntimeContextMessage` 中有独立 `# contentCalendarContext`，不再藏在策略资产目标字段里 | 通过 |
| 策略资产目标字段收敛 | 模型可见 `strategySnapshotContext` 和 `buildModelVisibleStrategyAsset` 只保留 `positioning/coreSellingPoints/targetAudiences/keyScenes/strategyTags/strategyMarkdown` | 通过 |
| `currentSuggestion` 只剩旧 DTO 兼容 | Editor tool schema、Editor 输入、runtime context、模型可见策略资产 payload 中不再出现 `currentSuggestion`；旧 snapshot 构造和兼容校验仍保留 | 通过，物理删除另开任务 |
| 图文/视频 brief 工具继续对咨询 Agent 隐藏 | `llmHiddenConsultationToolNames` 仍包含 `generate_article_brief`、`generate_video_brief` | 通过 |
| 不新增 `tools-suggestion` | 源码检索无 `tools-suggestion` | 通过 |
| 删除历史记录反复加载 | 本分支未处理 | 未完成，另开任务 |

### 边界说明

- `round`、`stage`、`summaryText` 仍存在于会话状态、事件、UI stage label、runtime snapshot 或内部 dispatch 参数中。这些属于系统内部状态或 UI 展示，不等于模型可见 runtime context。
- `contentCalendarDraft`、`contentCalendarGeneration` 仍存在于旧 `StrategySnapshotDto` 兼容结构中。本轮只完成模型上下文和策略资产目标字段收敛，未做 DB migration 或物理拆表。
- `currentSuggestion` 仍存在于旧 DTO、旧数据读取和 `isStrategySnapshot` 兼容校验中。本轮没有把历史数据做迁移。
- `merchantProfileContext` 仍包含商家资料全量项；产品文档已列为 P1 后续瘦身，不属于本分支完成范围。
- JSON tool loop 保留最小 `tool_loop_state`，只包含 `availableToolNames` 和 `toolResultPolicy`，不包含业务阶段、下一步追问或工具执行状态列表。

### 最终结论

- 以 `docs/产品文档/2026-05-26-咨询Agent工具结果与策略资产边界修订.md` 中的工具结果、策略资产边界、runtime context 和隐藏 brief 工具要求为准，本分支通过主线程最终验收。
- 本分支可合并。
- 不应把“删除咨询历史后历史面板反复重新加载”算入本分支已完成事项。
- 策略资产物理拆分、`currentSuggestion` 迁移和商家资料上下文瘦身应作为后续独立任务处理。

## 未做事项

- 未处理删除咨询历史后历史面板反复重新加载的问题。
- 未做 `StrategySnapshotDto.currentSuggestion` 的物理迁移或 DB migration。
- 未改 `workers/**`、`app/db/migrations/**`、前端组件或 video-worker 相关文件。
