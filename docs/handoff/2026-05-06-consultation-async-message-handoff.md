# 2026-05-06 咨询消息异步回复 handoff

## 当前目标

把商家端咨询页发送消息链路从“同步等待完整 Agent loop”改成“用户消息先落库并立即返回，后台继续跑 Agent，前端显示思考中并轮询 assistant 回复”。

## 已完成

- 新增 `enqueueConsultationMessageForUser`：保留账号、会话、Agent 可用性和积分预留校验，写入用户消息与 `agent.loop.queued` 事件后立即返回。
- 新增 `processQueuedConsultationMessageForUser`：后台处理已排队消息，复用原来的咨询 Agent loop、策略资产写入、runtime snapshot、usage 消耗和 assistant 消息落库。
- `POST /api/consultation/sessions/[sessionId]/messages` 改为返回 `202` 和 `{ processing: { status, userMessageId } }`，通过 Next `after()` 调度后台处理。
- 前端咨询工作台根据最后一条消息是否为 user 判断 `assistantPending`，显示“思考中”气泡，并每 2.5 秒轮询 session，直到 assistant 消息出现。
- 后台处理失败时会写 `agent.loop.failed` 事件，并追加一条 generic assistant 失败提示，避免页面永久卡在 pending。

## 改动文件

- `app/src/server/api/consultation-service.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/messages/route.ts`
- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/server/api/consultation-service.test.ts`

## 验证结果

- `cd app && node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts`
  - 38 passed
  - 仅有 Node module typeless warning，非本次引入。
- `cd app && pnpm typecheck`
  - 通过。
- `cd app && pnpm lint`
  - 通过。
- 本地 dev server 冒烟：
  - `GET /login` 返回 200。
  - 未登录 `POST /api/consultation/sessions/test/messages` 返回 401，route 可编译。
  - 未登录 `GET /dashboard` 返回 307，并编译到 `ConsultationWorkspace` bundle。
  - 使用商家账号本地登录成功，创建临时会话成功。
  - 临时会话发送消息返回 `202`，`post_time_seconds=2.969446`，`processing_status=queued`。
  - 轮询最终拿到 assistant 回复，`assistant_count=2`。
  - 临时会话删除成功，`delete_status=204`。

## 待验收 / 后续建议

- 本轮只解决第一层体验问题：浏览器不再等完整 Agent loop 才结束 POST。
- 后台完整 Agent loop 仍然偏慢，尤其 `update_strategy_snapshot` 和多次 planner/LLM 调用；下一层建议做轻量消息跳过策略资产 Editor、planner 确定性优先、资产 Editor 独立短超时。
- 本分支未 merge、未 push、未部署。需要用户验收后再决定是否合并到 main 并发 staging。

## 分支 / worktree

- branch: `codex/consultation-async-message`
- worktree: `/Users/wy/.codex/worktrees/consultation-async-message`
- merge: 未执行
- push: 未执行
