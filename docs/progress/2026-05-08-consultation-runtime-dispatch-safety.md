# 2026-05-08 咨询 Agent Runtime 工具执行安全壳

## 背景

接续上一轮：

- `c0a302c feat: record consultation tool failures as facts`
- `docs/progress/2026-05-08-consultation-runtime-tool-failure-facts.md`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

Phase 1 已经让 native tool calling 的未知工具、未启用工具、非法参数进入 `failed` 工具事实。但工具通过校验后，具体 `dispatchTool` 内部如果抛错，仍可能中断整轮 runtime，而不是像 Claude Code 的 tool execution 一样返回结构化工具失败结果。

## 本次目标

Phase 2：给 `dispatchTool` 外围增加统一安全壳，让工具执行异常也进入 `toolResults`。

范围只限 runtime 事实链路，不新增业务默认话术，不改 `6597399` 的知识库读取契约。

## 本次实现

### 1. 统一 dispatch 安全壳

新增：

- `dispatchToolWithRuntimeSafety`
- `buildToolRuntimeErrorResult`
- `classifyToolRuntimeError`
- `formatToolRuntimeError`

三条路径都改为走统一安全壳：

- `runBoundedBusinessToolLoop`
- native model `tool_calls`
- `runRequiredNativeToolCall`

现在只有安全壳内部直接调用：

```ts
input.input.dispatchTool(...)
```

### 2. 失败结果结构

工具内部异常会生成：

```ts
{
  status: "failed",
  payload: {
    errorType,
    error,
    retryable,
    toolArgsPreview
  }
}
```

当前错误类型：

- `provider_error`：`AiRuntimeError`
- `validation_failed`：异常名称或消息包含 validation/schema/zod/invalid
- `runtime_error`：其他运行时异常

### 3. 知识库失败不清空已有命中

`applyToolResultToState` 调整为：

- `retrieve_knowledge_base` 只有在非 `failed` 时才更新 `state.knowledgeMatches`。
- 避免检索工具失败时，把本轮前面已有的受控知识片段清空。

### 4. failed 不作为完成依赖

- `getPlannerCompletedToolNames` 会排除 `failed` 工具结果。
- 确定性 planner loop 遇到 `failed` 工具结果后立即停止继续工具链，避免后续资产写入基于失败依赖继续推进。
- native tool calling loop 仍会把 failed tool result 回传给模型，但该工具会进入本轮 unavailable 列表，避免重复调用同一失败工具。

## 修改文件

- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

## 验证

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：36 条通过。Node 仍有 package 未声明 ESM 的既有 warning，不影响测试。

```bash
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/components/merchant/consultation-workspace.tsx src/contracts/consultation.ts src/lib/db/consultation-repository.ts
```

结果：通过。

```bash
cd app && npm run typecheck
```

结果：通过。

## 后续建议

下一阶段进入 Phase 3：上下文边界与可回放快照。重点是记录本轮到底使用了哪些 session summary、recent messages、knowledge chunks 和 strategy asset version，并为后续 compact boundary 做准备。
