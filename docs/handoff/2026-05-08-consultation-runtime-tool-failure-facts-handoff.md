# 2026-05-08 咨询 Agent Runtime 工具失败事实化交接

## 当前目标

借鉴本地 Claude Code 参考源码的 agentic runtime 思想，系统性改造咨询 Agent runtime。本轮已完成架构审计、分阶段方案，并实现第一批低风险改动：native tool calling 的工具拒绝/校验失败必须成为结构化 `failed` 工具事实。

## 分支 / 工作树

- branch：`codex/consultation-runtime-refactor`
- worktree：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-consultation-runtime-refactor`
- 基线：`426d95f docs: add consultation refactor handoff`
- 实现提交：`c0a302c feat: record consultation tool failures as facts`
- push：未 push
- merge：未 merge，待验收 / 待合并决策

## 已完成内容

### 1. 架构审计和分阶段方案

新增：

- `docs/架构规范/2026-05-08-consultation-agent-runtime-refactor-plan.md`

内容覆盖：

- 当前咨询 runtime 已接近 Claude Code 风格的能力。
- 仍欠缺的能力。
- runtime / prompt / UI 的职责边界。
- Phase 1 到 Phase 5 的后续改造路线。

### 2. Phase 1：工具失败事实化

核心改动：

- `ConsultationToolCardDto.status` 增加 `failed`。
- `consultation-repository.ts` 读取历史 tool cards 时兼容 `failed` 状态。
- native tool calling 中，未知工具、未启用工具、非法 JSON、Schema 校验失败会生成 `failed` tool result。
- 失败结果进入：
  - `toolResults`
  - `agent.tool.completed` event
  - `agent.loop.completed.failedTools`
  - runtime snapshot `failedTools`
  - visible summary `agentLoop.toolResults`
  - 右侧执行过程工具卡
- 右侧执行区文案从“已执行 N 项”改为“记录 N 项执行事实”，并显示 `完成 / 跳过 / 失败` 状态。

### 3. Progress 留痕

新增：

- `docs/progress/2026-05-08-consultation-runtime-tool-failure-facts.md`

## 已明确保持不变

- 未回退 `6597399 fix: require knowledge retrieval for consultation reads`。
- 明确读取用户知识库或上传文件时，native loop 仍先执行 `retrieve_knowledge_base`。
- 未新增行业、客群、场景、卖点、到店咨询、私信转化等业务默认话术。
- 未改 strategy asset editor 的业务语义。
- 未改 worker、图文工作台或视频工作台链路。

## 验证结果

在 `app/` 下执行：

```bash
node --test src/server/api/consultation-service.test.ts
```

结果：35 passed。仍有既有 ESM warning，不影响测试。

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

1. 先验收本分支的 Phase 1：确认失败工具调用是否按预期进入右侧执行过程和 runtime snapshot。
2. 如果继续改造，进入 Phase 2：给 `dispatchTool` 外围增加统一安全壳，把工具内部 runtime error 也统一转成 `failed` tool result。
3. 后续再推进上下文 compact boundary、结构化用户补充问题、Agent run 心跳与中断恢复。

## 接手注意事项

- 不要把资料不足场景改成业务默认结论。
- 不要把 `failed` 工具结果当作已完成依赖。
- 不要把未知工具加入 `getNativeUnavailableToolNames` 的可执行工具集合；本轮已通过 `isKnownConsultationToolResult` 过滤。
- 如果合并到 main，建议用 fast-forward 或小范围 cherry-pick，并在合并后重跑本 handoff 中的验证命令。
