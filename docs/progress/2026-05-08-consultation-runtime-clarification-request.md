# 2026-05-08 咨询 Agent Runtime 用户补充问题结构化

## 背景

接续 Phase 1-3：

- 工具拒绝和参数失败已进入 `failed` 工具事实。
- 工具内部异常已由 `dispatchToolWithRuntimeSafety` 收敛为 `failed` 工具事实。
- 每轮回复已生成 `consultation_context_boundary_v1`，记录实际上下文来源。

Phase 4 要处理的是：资料不足时，Agent 不能把追问只散落在正文里，也不能为了显得完整而写业务默认结论。需要把“本轮需要用户补充一个关键事实”变成可持久化、可回放的 runtime fact。

## 本次实现

### 1. 新增 runtime fact

新增伪工具结果：

```ts
toolName: "request_user_clarification"
status: "completed"
payload.resultKind: "request_user_clarification"
```

它不是可执行 business tool：

- 不进入 `enabledTools`。
- 不进入 planner ready tools。
- 不参与策略资产写入。
- 不作为任何业务工具依赖。

`status: "completed"` 只表示“澄清请求已记录”，不是表示策略/内容资产完成。

### 2. 触发条件

在 assistant final reply 生成后判断：

1. assistant reply 必须是正常 LLM 回复。
2. 本轮没有完成策略/内容资产写入：
   - `update_strategy_snapshot`
   - `update_content_calendar`
   - `generate_article_brief`
   - `generate_video_brief`
3. assistant 回复中检测到问题句。

满足后只记录第一条问题，符合“一轮只问一个关键问题”的方向。

### 3. 进入事实链路

澄清请求进入：

- `toolResults`
- tool cards
- runtime snapshot
- `contextBoundary.sources.tools`
- assistant visible summary

额外新增事件：

- `agent.clarification.requested`

### 4. 原因分类

当前 reason code：

- `tool_failed_needs_clarification`
- `context_read_needs_user_confirmation`
- `insufficient_context_after_skipped_tools`
- `insufficient_user_context`

这些只描述 runtime 状态，不写业务结论。

## 修改文件

- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

## 验证

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：38 条通过。Node 仍有 package 未声明 ESM 的既有 warning，不影响测试。

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

结果：通过。Next.js 编译、类型检查和静态页面生成均完成。

## 后续建议

后续可以在 UI 上把 `request_user_clarification` 与普通工具卡区分得更清楚，例如显示为“等待用户补充”，但这应保持事实展示，不要扩写业务默认结论。
