# 2026-05-08 咨询 Agent Runtime 工具失败事实化

## 背景

接续 `docs/handoff/2026-05-08-consultation-claude-code-inspired-refactor-handoff.md`。

本轮目标是借鉴本地 Claude Code 参考源码的 runtime 思想，先审计咨询 Agent，再做第一批低风险改造。重点不是增加业务默认话术，而是把工具执行事实、失败事实和 UI 展示事实收敛到 runtime。

已保持 `6597399 fix: require knowledge retrieval for consultation reads` 的修复：

- 明确读取用户知识库或上传文件时，native loop 仍先执行 `retrieve_knowledge_base`。
- 用户文档直读逻辑仍在 `consultation-runtime/rag.ts`。
- 没有恢复“可以不调用工具直接回复”的宽松提示。

## Claude Code 对照结论

参考本地源码：

- `src/query.ts`：不要信任 stop reason，应该扫描真实 tool use block，并保持 tool call/result 配对。
- `src/services/tools/toolExecution.ts`：未知工具、输入非法、执行失败都要转成结构化 tool result。
- `src/QueryEngine.ts`：最终成功与否要看最后消息形态、stop reason、tool result 和诊断信息。
- `src/remote/sdkMessageAdapter.ts`：tool result 识别应靠 content shape 和事实结果，不靠不可靠字段。

映射到咨询 runtime 的第一阶段动作：native tool calling 中，模型请求未知工具、未启用工具或非法参数时，也要成为本轮 `toolResults` 里的 `failed` 事实，而不是只作为隐藏的 tool message 给模型看。

## 本次实现

### 1. Tool card 状态扩展

`ConsultationToolCardDto.status` 从：

```ts
"completed" | "skipped"
```

扩展为：

```ts
"completed" | "skipped" | "failed"
```

历史数据兼容：

- `consultation-repository.ts` 读取旧 `tool_cards` 时，保留 `skipped` 和 `failed`。
- 未知状态仍按旧逻辑视为 `completed`，避免破坏历史消息。

### 2. native tool calling 拒绝结果入账

当 `parseNativeConsultationToolCall` 返回失败时：

- 写入 planner trace：`status: "rejected"`。
- 生成 `buildNativeRejectedToolResult`。
- 推入 `toolResults`，状态为 `failed`。
- 继续返回结构化 tool message 给模型。
- 触发 `agent.tool.completed` 事件，payload 内含失败摘要和错误类型。

这样 UI、snapshot、assistant final context 都能看到同一份失败事实。

### 3. Snapshot 与 loop completed 增加 failedTools

`agent.loop.completed` payload 和 runtime snapshot 增加：

```ts
failedTools
```

用于后续排查“模型想调用什么但 runtime 拒绝了”。

### 4. UI 展示失败状态

咨询页右侧执行过程改为：

- 文案从“已执行 N 项”改为“记录 N 项执行事实”。
- 展示 `完成 / 跳过 / 失败` 状态徽标。
- 如果存在失败项，摘要显示失败数量。

没有新增业务默认文案或默认行业/客群/场景结论。

### 5. 改造方案文档

新增：

- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

内容包括：

- 当前 runtime 距离 Claude Code 风格的差距。
- runtime / prompt / UI 的职责分层。
- Phase 1 到 Phase 5 的分阶段改造计划。

## 修改文件

- `app/src/contracts/consultation.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

## 验证

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：35 条通过。Node 仍提示 package 未声明 ESM 的既有 warning，不影响测试。

```bash
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/components/merchant/consultation-workspace.tsx src/contracts/consultation.ts src/lib/db/consultation-repository.ts
```

结果：通过。

```bash
cd app && npm run typecheck
```

结果：通过。

```bash
cd app && npm run build
```

结果：通过，Next.js 16.2.4 production build 成功。

## 后续建议

下一阶段建议做 Phase 2：给 `dispatchTool` 外围加统一安全壳，让工具内部 runtime error 也统一变成 `failed` tool result。这样可以继续收敛错误事实，不让模型用业务正文遮住系统失败。
