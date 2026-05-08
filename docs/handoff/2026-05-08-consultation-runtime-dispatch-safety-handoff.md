# 2026-05-08 咨询 Agent Runtime 工具执行安全壳交接

## 当前目标

继续在 `codex/consultation-runtime-refactor` 分支推进 Phase 2：给咨询 Agent runtime 的 `dispatchTool` 外围增加统一安全壳，让工具内部异常也转成结构化 `failed` tool result。

## 分支 / 工作树

- branch：`codex/consultation-runtime-refactor`
- worktree：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-consultation-runtime-refactor`
- 基线：`d8b0f4b docs: add consultation runtime refactor handoff`
- Phase 2 提交：`a0ab640 feat: wrap consultation tool execution errors`
- push：未 push
- merge：未 merge，待验收 / 待合并决策

## 已完成内容

### 1. dispatchTool 安全壳

新增：

- `dispatchToolWithRuntimeSafety`
- `buildToolRuntimeErrorResult`
- `classifyToolRuntimeError`
- `formatToolRuntimeError`

现在以下三条路径都走统一安全壳：

- 确定性 / model_json planner loop
- native model `tool_calls`
- runtime-required tool contract，例如明确读取用户知识库时的 `retrieve_knowledge_base`

只有安全壳内部直接调用 `input.input.dispatchTool(...)`。

### 2. 失败工具结果

工具内部抛错会返回：

- `status: "failed"`
- `payload.errorType`
- `payload.error`
- `payload.retryable`
- `payload.toolArgsPreview`

当前分类：

- `provider_error`：`AiRuntimeError`
- `validation_failed`：异常名称或消息包含 validation/schema/zod/invalid
- `runtime_error`：其他异常

这些结果会沿用 Phase 1 已建立的事实链路进入：

- `toolResults`
- `agent.tool.completed`
- tool cards
- `agent.loop.completed.failedTools`
- runtime snapshot
- assistant final context

### 3. 依赖门禁

- `getPlannerCompletedToolNames` 会排除 `failed` 工具结果。
- 确定性 planner loop 遇到 `failed` 后停止后续工具链，避免策略资产写入基于失败依赖继续推进。
- native loop 会把 failed tool result 回传给模型，但该工具会进入本轮 unavailable，避免重复调用。

### 4. 知识库失败保护

`applyToolResultToState` 调整为：

- `retrieve_knowledge_base` 只有非 `failed` 时才更新 `state.knowledgeMatches`。
- 工具执行失败不会清空本轮已有知识片段。

## 已明确保持不变

- 未回退 `6597399 fix: require knowledge retrieval for consultation reads`。
- 明确读取用户知识库或上传文件时，runtime-required `retrieve_knowledge_base` 仍会先执行；如果执行内部失败，会作为 `failed` 工具事实返回。
- 未新增行业、客群、场景、卖点、到店咨询、私信转化等业务默认话术。
- 未改 worker、图文工作台、视频工作台链路。

## 验证结果

在 `app/` 下执行：

```bash
node --test src/server/api/consultation-service.test.ts
```

结果：36 passed。仍有既有 ESM warning，不影响测试。

```bash
npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/components/merchant/consultation-workspace.tsx src/contracts/consultation.ts src/lib/db/consultation-repository.ts
```

结果：通过。

```bash
npm run typecheck
```

结果：通过。

```bash
npm run build
```

结果：通过，Next.js 16.2.4 production build 成功。

## 下一步建议

1. 先验收 Phase 1 + Phase 2：工具拒绝、参数失败、工具内部异常是否都进入右侧执行事实和 runtime snapshot。
2. 如果继续改造，进入 Phase 3：上下文边界与可回放快照，记录本轮实际使用的 session summary、recent messages、knowledge chunks、strategy asset version，并为 compact boundary 做准备。

## 接手注意事项

- 不要把 `failed` 工具结果当作完成依赖。
- 不要让工具内部异常回到业务默认话术。
- 不要在通用 runtime 里补行业、目标客群、私信转化、到店咨询等业务默认结论。
- 合并前建议重跑本 handoff 的验证命令。
