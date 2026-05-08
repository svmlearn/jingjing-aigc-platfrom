# 2026-05-08 咨询 Agent Runtime 上下文边界快照交接

## 当前目标

继续在 `codex/consultation-runtime-refactor` 分支推进 Phase 3：上下文边界与可回放快照。目标是让每轮咨询回复能解释“用了哪些上下文”，并为后续 compact boundary / 长上下文恢复铺底。

## 分支 / 工作树

- branch：`codex/consultation-runtime-refactor`
- worktree：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-consultation-runtime-refactor`
- Phase 3 提交：`a69a9c1 feat: snapshot consultation context boundaries`
- push：未 push
- merge：未 merge，待验收 / 待合并决策

## 已完成内容

### 1. 新增 context boundary snapshot

新增：

- `buildContextBoundarySnapshot`
- `ConsultationContextBoundarySnapshot`
- `state.contextBoundary`

每轮 assistant reply 确定后，runtime 会基于最终 `state + toolResults` 写入：

- `state.contextBoundary`
- `state.contextBudget = contextBoundary.budget`

这修复了之前 `contextBudget` 在 loop 开始前计算、没有包含最终 `knowledgeMatches/toolResults/strategyMarkdown` 的问题。

### 2. 当前边界策略

新增 policy：

```ts
policy: "consultation_context_boundary_v1"
compactBoundary: {
  policy: "context_compact_boundary_v1",
  status: "not_applied",
  reason: "phase_3_snapshot_only_no_compaction_yet"
}
```

本轮只记录边界，不做自动 compact。

### 3. 记录上下文来源

`contextBoundary.sources` 记录：

- session id、round、summary 是否存在、历史消息数、最近 conversation 的 role/字符数索引。
- 当前用户消息长度和 mention routing。
- strategyMarkdown 字符数、strategy tags、字段数量、brief 是否存在。
- agent id/key、prompt version、soul version。
- candidate/active skills、激活 reference 数。
- knowledge chunk ids、document id/title、scope、score、contentKind、memoryMatchIds。
- completed/skipped/failed tool result 摘要。
- expert traffic 的共享事实数、开放问题数、交接 note 数。

为减少重复存储正文，recent conversation 不复制消息内容；知识库也只记录 chunk/document 标识，不复制 chunk content。

### 4. 写入事实链路

`contextBoundary` 已进入：

- `agent.loop.completed.payload.contextBoundary`
- `runtimeSnapshot.toolCallSummary.contextBoundary`
- assistant message `visibleSummary.agentLoop.contextBoundary`

## 已明确保持不变

- 未回退 `6597399 fix: require knowledge retrieval for consultation reads`。
- 未新增行业、客群、场景、卖点、到店咨询、私信转化等业务默认话术。
- 未做真实 compact / 自动摘要替换。
- 未改 worker、图文工作台、视频工作台链路。

## 验证结果

在 `app/` 下执行：

```bash
node --test src/server/api/consultation-service.test.ts
```

结果：37 passed。仍有既有 ESM warning，不影响测试。

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

进入 Phase 4：用户补充问题工具化。建议新增轻量结构化 result 或工具，把“资料不足，需要用户补充一个关键事实”变成可持久化事实，而不是只散落在 assistant 正文里。

## 接手注意事项

- `contextBoundary` 当前不是压缩结果，只是边界快照。
- 不要在 context boundary 里复制大段消息正文或知识库 chunk content。
- 不要把 context boundary 当作长期 memory，它是本轮 runtime replay / diagnostics。
- 合并前建议重跑本 handoff 的验证命令。
