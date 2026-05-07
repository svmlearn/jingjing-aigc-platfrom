# 2026-05-06 咨询 Agent native tool loop handoff

## 当前目标

基于 native tool loop 设计文档，把咨询 Agent planner 从 `bounded_business_tool_loop_v1` 迁移到主模型原生 tool calling loop，同时保留 deterministic fallback。

## 已完成

- 新开分支 / worktree：
  - branch: `codex/consultation-native-tool-loop`
  - worktree: `/Users/wy/.codex/worktrees/consultation-native-tool-loop`
- 新增 `plannerMode`：
  - `native_tool_calling`
  - `model_json_planner`
  - `deterministic`
- 默认 runtime mode 为 `native_tool_calling`。
- Agent `modelConfig.plannerMode` 可覆盖 planner mode。
- `app/src/server/api/consultation-runtime/tools.ts` 升级为 tool registry，负责 native tools schema、arguments 校验、默认参数生成。
- `app/src/server/api/consultation-runtime/runtime.ts` 新增 `native_tool_calling_loop_v1`：
  - 主模型通过结构化 `tool_calls` 请求工具。
  - runtime 校验后 dispatch 受控业务工具。
  - 工具结果作为 `role: "tool"` message 回灌。
  - native 失败、空回复、无 API key 时回退确定性 planner。
- `app/src/server/api/ai-runtime.ts` 修正 tool-call 对话截断，避免切断 assistant tool_calls 和 tool result 配对。
- 事件、runtime snapshot、商家可见 summary 都会记录 runtimeDesign / plannerMode / fallbackReason。
- 补充 source-level 测试，覆盖 native tool calling loop 和 message trimming。

## 改动文件

- `app/src/server/api/ai-runtime.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-runtime/experts.ts`
- `app/src/server/api/consultation-runtime/planner.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/types.ts`
- `docs/progress/2026-05-06-consultation-native-tool-loop-progress.md`
- `docs/handoff/2026-05-06-consultation-native-tool-loop-handoff.md`

## 验证结果

- `cd app && node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts`
  - 39 passed
  - 仅有 Node module typeless warning，非本次引入。
- `cd app && pnpm typecheck`
  - 通过。
- `cd app && pnpm lint`
  - 通过。

## 待验收 / 后续建议

- 建议在 staging 选择一个默认咨询 Agent 实测：
  - 普通轻问答应直接回复，不触发 `update_strategy_snapshot`。
  - 明确要求“写进右侧策略资产”时，应调用 `update_strategy_snapshot`。
  - 要求找对标时，应调用 `search_benchmark_materials`。
  - provider 不支持 tool calling 时，应记录 fallbackReason 并仍返回 assistant 回复。
- 如果 staging provider tool calling 兼容性不稳定，可以先把目标 Agent 的 `modelConfig.plannerMode` 设置为 `deterministic` 或 `model_json_planner`。

## 合并状态

- merge: 已 fast-forward 合并到 `main`
- git push: 已推送 `origin/main`
- Supabase: 本轮无 `app/supabase/migrations` 变更，未执行 DDL；`pnpm dlx supabase migration list --linked` 卡在 CLI 二进制下载阶段，已终止。
- Vercel: 已部署 production，并挂稳定 alias。
  - Stable alias: `https://jingjing-content-platform-staging.vercel.app`
  - Deployment ID: `dpl_JDHFQ9D4HcQcUamJjt5tRXTbaDhw`
  - Deployment: `https://jingjing-content-platform-staging-op7gn8l8c.vercel.app`
  - Inspect: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/JDHFQ9D4HcQcUamJjt5tRXTbaDhw`
- 最终代码提交：`c77311fe25aaa4b89c16c6c3570ab82f4a074bf7`

## 部署后备注

- Vercel API 返回 deployment `READY`，alias 已分配。
- Vercel metadata 对应 `main` 的 `1a17e126ffa665f460e026d11135587957381183`；由于根工作区存在本轮开始前的未关联脏文件，Vercel metadata 里 `gitDirty=1`，但部署执行目录为 `app/`。
- 本机 `curl` 到稳定 alias 和 deployment URL 在 20-30 秒内超时，未拿到 HTTP 响应；暂按 Vercel deployment 状态作为部署成功依据，后续建议用浏览器或异地网络补一次页面级 smoke。
- 已通过 Vercel fetch 工具访问 `https://jingjing-content-platform-staging.vercel.app/login`，返回 `200 OK`，页面 HTML 正常。
