# 2026-05-08 咨询 Agent Runtime Phase 4 接手说明

## 当前目标

接续 `docs/handoff/2026-05-08-consultation-runtime-context-boundary-handoff.md`，完成 Phase 4：把“用户需要补充的问题”从正文里的自然语言追问升级为可持久化、可回放的 runtime fact。

本阶段继续遵守两条约束：

- 不引入业务默认话术，不自动生成行业、客群、场景或转化结论。
- 不回退 `6597399 fix: require knowledge retrieval for consultation reads` 的知识库读取修复。

## 已完成内容

新增伪工具事实：

- `toolName: "request_user_clarification"`
- `status: "completed"`
- `payload.resultKind: "request_user_clarification"`
- `payload.source: "assistant_final_question"`
- `payload.blocksAssetWrite: true`

该事实不是可执行 business tool：

- 不进入 `enabledTools`。
- 不进入 planner ready tools。
- 不参与策略/内容资产写入。
- 不作为其他业务工具依赖。

触发规则：

- assistant final reply 必须是 LLM 回复。
- 本轮没有完成策略/内容资产写入工具。
- assistant 回复中检测到问题句。
- 每轮只记录第一条问题。

已接入链路：

- `toolResults`
- tool cards
- runtime snapshot
- `contextBoundary.sources.tools`
- assistant visible summary
- `agent.clarification.requested` 事件

## 改动文件

- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`
- `docs/progress/2026-05-08-consultation-runtime-clarification-request.md`

## 分支与 worktree

- Branch：`codex/consultation-runtime-refactor`
- Worktree：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-consultation-runtime-refactor`
- 主工作区：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`

## Commit

- Phase 4 implementation：`d28c335 feat: record consultation clarification requests`

## 验证结果

在 `app/` 目录执行：

```bash
node --test src/server/api/consultation-service.test.ts
npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/components/merchant/consultation-workspace.tsx src/contracts/consultation.ts src/lib/db/consultation-repository.ts
npm run typecheck
npm run build
```

结果：

- 单测通过：38 条通过。Node 仍有 package 未声明 ESM 的既有 warning，不影响测试结果。
- lint 通过。
- typecheck 通过。
- build 通过，Next.js 编译、类型检查和静态页面生成完成。
- `git diff --check` 通过。

## 当前状态

- 已提交 Phase 4 代码 commit。
- 本 handoff 正在补交文档 commit。
- 未 push。
- 未 merge。

## 下一步建议

Phase 5 可以进入 Agent run 心跳与中断恢复：

- 增加可观察 run state，例如 running / waiting_user / failed / completed。
- 把 `request_user_clarification` 映射到等待用户补充的运行态。
- 继续保持工具事实和业务资产分离。
- 继续避免在资料不足时写入策略资产或生成业务默认结论。
