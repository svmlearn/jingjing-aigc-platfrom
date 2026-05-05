# 2026-05-05 咨询专家短期交通 V1 实现记录

## 背景

本轮依据：

- `docs/架构规范/2026-05-05-consultation-agent-assets-context-design.md`
- `docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md`
- `docs/handoff/2026-05-04-v2.2-agent-console-assets-handoff.md`
- `docs/progress/2026-05-04-v2.2-agent-console-assets-implementation.md`

目标是实现第一阶段 V1：同一个 consultation session 内，用户先 `@` 专家 A，再 `@` 专家 B 时，专家 B 能读到专家 A 的关键结论、未解决问题和 handoff，而不是从零开始。

## 本轮完成

### 1. Runtime 类型补齐

文件：

- `app/src/server/api/consultation-runtime/types.ts`

新增：

- `SharedConsultationState`
- `ExpertTurnNote`
- `ConsultationAgentLoopState.sharedConsultationState`
- `ConsultationAgentLoopState.expertTurnNotes`
- `ConsultationAgentLoopState.latestExpertTurnNote`

### 2. 短期共享状态与专家回执

文件：

- `app/src/server/api/consultation-runtime/context.ts`

新增：

- `buildSharedConsultationState()`
- `buildExpertTurnNotes()`
- `buildExpertTrafficContextBlock()`
- `buildLatestExpertTurnNote()`

实现说明：

- `SharedConsultationState` 从商家资料、当前策略资产、用户本轮输入和最近专家回执生成。
- `ExpertTurnNote` 从上一轮 assistant message 的 `visibleSummary.agentLoop.expertTraffic.latestExpertTurnNote` 读取。
- 当前轮专家回复后生成新的 `latestExpertTurnNote`。
- expert traffic 标记为 `short_term_expert_traffic_v1`，只作为当前 session 的短期交通层，不是长期 `memory.md`。

### 3. Context Injection 接入

文件：

- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-service.ts`

完成：

- `buildConsultationContextInjection()` 增加 `expertTraffic`。
- system prompt 明确要求专家读取 `sharedConsultationState` 与 `recentExpertTurnNotes`。
- 策略资产 editor 和最终 assistant reply 共用同一份短期专家交通上下文。
- `@` 仍只切换本轮专家容器，不清空 session、策略资产或共享状态。

### 4. Runtime Snapshot 与事件留痕

文件：

- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-service.ts`

完成：

- runtime snapshot 的 `toolCallSummary.expertTraffic` 记录：
  - `sharedConsultationState`
  - `expertTurnNotes`
  - `latestExpertTurnNote`
- `agent.loop.started` 和 `agent.loop.completed` 事件保留短期交通摘要。
- assistant message 的 `visibleSummary.agentLoop.expertTraffic` 写入同样的短期交通层，供下一轮专家读取。

### 5. 测试补充

文件：

- `app/src/server/api/consultation-service.test.ts`

新增断言覆盖：

- runtime 存在 `SharedConsultationState`
- runtime 存在 `ExpertTurnNote`
- 上下文注入包含 `short_term_expert_traffic_v1`
- 专家回执包含 `handoffForNextExpert`
- assistant message 保留 `recentExpertTurnNotes` 与 `latestExpertTurnNote`

## 本轮明确未做

- 未做 `agent_soul_versions`。
- 未做 `agent_memory_notes`。
- 未做长期记忆自动晋升。
- 未做 memory candidates 自动审批。
- 未做专家自动切换建议。
- 未做多专家后台自由对话或并发抢答。
- 未新增 Supabase migration。
- 未部署 Vercel。

## 验证

已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-runtime src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts
cd app && npm run build
git diff --check -- app/src/server/api/consultation-runtime app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts docs/架构规范/2026-05-05-consultation-agent-assets-context-design.md
python3 .codex/skills/long-task-gate/scripts/check.py
```

结果：

- consultation service 相关测试 25 条通过。
- TypeScript typecheck 通过。
- targeted ESLint 通过。
- Next.js production build 通过，50 个页面生成完成。
- diff whitespace 检查通过。
- long-task gate 硬门禁和独立 verifier 均通过，状态为 `complete`。

## 分支与状态

- Worktree：`/Users/wy/.codex/worktrees/consultation-expert-traffic-v1`
- Branch：`codex/consultation-expert-traffic-v1`
- Commit：已创建；以当前 branch HEAD 为准
- Push：未 push
- Merge：未 merge
- 状态：long-task gate 已完成，待用户验收 / push / merge / deploy 决策。
