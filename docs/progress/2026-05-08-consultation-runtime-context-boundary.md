# 2026-05-08 咨询 Agent Runtime 上下文边界快照

## 背景

接续：

- `c0a302c feat: record consultation tool failures as facts`
- `a0ab640 feat: wrap consultation tool execution errors`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

Phase 1 和 Phase 2 已把工具拒绝、参数失败、工具内部异常收敛为结构化工具事实。Phase 3 要解决的是另一类可解释性问题：一轮咨询回复到底基于哪些上下文、哪些工具结果、哪些知识片段和哪些 agent 资产版本生成。

## 现状问题

原先已有 `contextBudget`，但它在 loop 开始前计算：

- `knowledgeMatches` 还是空。
- `toolResults` 还是空。
- 工具更新后的 `strategyMarkdown` 没有进入最终预算。

这会导致 runtime snapshot 里的上下文预算不能代表最终回复实际可见的上下文。

## 本次实现

### 1. 新增 context boundary snapshot

新增：

- `buildContextBoundarySnapshot`
- `ConsultationContextBoundarySnapshot`
- `state.contextBoundary`

策略：

- 每轮 assistant reply 确定后，基于最终 `state + toolResults` 生成 `contextBoundary`。
- 同步把 `state.contextBudget` 更新为 `contextBoundary.budget`。
- 先只记录边界，不做自动压缩。

当前 policy：

```ts
policy: "consultation_context_boundary_v1"
compactBoundary: {
  policy: "context_compact_boundary_v1",
  status: "not_applied",
  reason: "phase_3_snapshot_only_no_compaction_yet"
}
```

### 2. 记录上下文来源

`contextBoundary.sources` 记录：

- session：session id、round、summary 是否存在、历史消息数、最近 conversation 的 role/字符数索引。
- currentUserMessage：当前输入长度和 mention routing。
- strategyAsset：strategyMarkdown 字符数、strategy tags、字段数量、brief 是否存在。
- agentAssets：agent id/key、prompt version、soul version。
- skills：候选 skill、激活 skill、激活 reference 数。
- knowledge：受控 knowledge chunk ids、document id/title、scope、score、contentKind、memoryMatchIds。
- tools：completed/skipped/failed 工具列表、每个 tool result 的 call id、状态、摘要、errorType。
- expertTraffic：共享事实数、开放问题数、专家交接 note 数。

为减少重复存储正文，recent conversation 不复制消息内容，只记录 role、字符数和相对尾部偏移；知识库记录 chunk/document 标识，不复制 chunk content。

### 3. 写入事实链路

新增字段进入：

- `agent.loop.completed.payload.contextBoundary`
- `runtimeSnapshot.toolCallSummary.contextBoundary`
- assistant message `visibleSummary.agentLoop.contextBoundary`

## 修改文件

- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

## 验证

```bash
cd app && node --test src/server/api/consultation-service.test.ts
```

结果：37 条通过。Node 仍有 package 未声明 ESM 的既有 warning，不影响测试。

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

Phase 4 可以做“用户补充问题工具化”：把资料不足时的一轮关键追问做成结构化 runtime result，而不是只散落在正文里。到那一步后，`contextBoundary` 可以记录本轮为什么没有写资产、缺的是哪类事实。
