# 2026-05-06 咨询 Agent native tool calling loop 改造记录

## 背景

本轮基于 `docs/架构规范/2026-05-06-consultation-agent-native-tool-loop-design.md`，把咨询 Agent planner 从当前 `bounded_business_tool_loop_v1` 迁移到原生 tool calling 主路径，并保留确定性 fallback。

注意：本 worktree 从 `main@057f54e` 新开，不继承主目录当前未提交的删除和未跟踪文档改动；native tool loop 设计文档作为输入已阅读。

## 已完成

- 新增 runtime 级 `plannerMode`：
  - `native_tool_calling`
  - `model_json_planner`
  - `deterministic`
- 默认咨询 Agent runtime 进入 `native_tool_calling`。
- Agent `modelConfig.plannerMode` 可覆盖 planner 模式，便于单 Agent 灰度或回退。
- `tools.ts` 从纯 catalog 扩展为受控业务工具 registry：
  - 输出 OpenAI-compatible `tools` schema。
  - 校验模型返回的 tool call name 与 arguments。
  - 生成每个工具的受控默认参数。
- `runtime.ts` 新增 `native_tool_calling_loop_v1`：
  - 主模型使用 `tools + toolChoice: "auto"` 自主决定是否调用工具。
  - 工具结果通过 `role: "tool"` 回灌给模型。
  - 每轮最多 2 个 tool calls，最多 4 个 tool turns。
  - 每个已执行工具本轮不重复开放。
  - 工具名发明、未启用工具、arguments 非法都不执行，只返回 tool error message 给模型。
  - native 失败、空回复或无 API key 时切回确定性 planner。
- 旧 `model_json_planner` 仍保留，可通过 `plannerMode` 使用。
- `ai-runtime.ts` 修正消息截断策略：保留 system message，并按最近消息组保留 assistant tool_calls 与 tool result 配对，避免 tool call/result 被截断打散。
- 事件和 runtime snapshot 增加：
  - `runtimeDesign`
  - `plannerMode`
  - `terminalReason`
  - `fallbackReason`
  - `toolCallingProvider`
  - `strategyWriteCount`
- 商家端 assistant message 的 `visibleSummary.agentLoop` 会记录 native/bounded 模式和 fallback 信息。

## 关键决策

- native tool loop 是主路径，但不是放开任意工具；仍只开放咨询业务工具。
- 业务工具 dispatch 仍在原服务内复用现有实现，registry 第一版只负责 schema、参数、可见 tool 列表和 native call 校验。
- `update_strategy_snapshot` 仍只在模型明确调用外层工具时执行；内部策略资产 editor 的 guardrail 保持不变。
- fallback 走确定性 planner，不再额外依赖 JSON planner，减少 native 失败后的二次模型规划成本。
- `model_json_planner` 保留为可选模式，方便对比和回滚。

## 验证

在 `/Users/wy/.codex/worktrees/consultation-native-tool-loop/app` 执行：

```bash
node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts
```

结果：

- 39 passed
- 仅有 Node module typeless warning，非本次引入。

```bash
pnpm typecheck
```

结果：

- 通过。

```bash
pnpm lint
```

结果：

- 通过。

## 风险与回滚

- 风险：默认 `plannerMode` 已切到 `native_tool_calling`，真实 provider 如果 tool calling 兼容性不足，会触发 fallback，但首轮会多一次失败调用。
- 回滚：将目标 Agent `modelConfig.plannerMode` 设置为 `deterministic` 或 `model_json_planner`；也可 revert 本分支改动。
- 未新增 Supabase migration，未修改前端交互，未触碰 roundtable legacy 和 worker。

