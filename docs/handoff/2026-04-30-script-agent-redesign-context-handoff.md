# 2026-04-30 脚本制作 Agent 重设计上下文交接

## 当前目标

用户正在重设计视频工作台里的脚本制作 Agent。

新的方向是：

1. 基础范式仍然是 ReAct / 多轮对话。
2. Agent 只负责短视频脚本的生成与修改，不负责视频制作 workflow。
3. 所有基础业务信息应在开始时由咨询台 / 视频工作台上下文传入，包括产业、目标、受众、卖点、素材、禁用表达等。
4. 首轮基于咨询台与工作台上下文生成初版脚本 v1。
5. 后续用户提出修改要求时，读取系统提示词、咨询台信息、当前脚本版本、历史消息、当前问题、工具调用结果，生成新版本 v2 / v3。
6. 旧版本必须保留，不覆盖。
7. Agent 只有一个受控工具：`modify_script` / 脚本制作 tool。
8. 视频制作是固定 workflow：只有在素材已确定、用户确认要剪辑视频后，app 再把锁定脚本按固定格式交给后续视频制作模块。
9. 不要再有“没有接入大模型时默认生成脚本”的兜底；未接入大模型时应明确提示“请检查是否接入大模型”。

## 用户最新要求

用户给了新的 prompt 内容，并要求：

1. `custom_prompt` 要按用途分块，不要整段挤在一起。
2. prompt 中不要再写默认生成脚本。
3. 没有接入大模型时，不要用 deterministic fallback 生成脚本，而是输出类似“请检查是否接入大模型”的提示。
4. 结合此前流程设计落地：
   - 咨询台已确认信息 -> 生成 v1
   - 用户修改 -> 基于当前版本调用 `modify_script`
   - 新增版本而不是覆盖旧稿
   - 用户确认最终版本后，app 按固定 payload 交给视频制作 workflow

## 已完成内容

本轮已经先做了一段“prompt 配置清理”，尚未完成用户最新这段重设计落地。

已完成：

1. 把脚本制作 Agent 的系统提示词收敛到单一代码源：
   - `app/src/server/api/video-script-production-agent.ts`
2. 清理了其他脚本制作 Agent 的 `custom_prompt` / `systemPrompt` 配置入口：
   - `app/src/components/platform-admin/platform-settings-editor.tsx`
   - `app/src/contracts/knowledge.ts`
   - `app/src/lib/db/platform-admin-repository.ts`
   - `app/src/server/api/schemas.ts`
   - `app/supabase/migrations/202604280001_script_production_agent_settings.sql`
3. `buildScriptProductionAgentMessages` 不再接收外部 `systemPrompt`，始终使用 canonical prompt。
4. 新增 schema 测试，验证平台设置更新不再接受 `scriptProductionAgent.systemPrompt`：
   - `app/src/server/api/platform-settings-schema.test.ts`
5. 已写过一份上一阶段 handoff：
   - `docs/handoff/2026-04-30-script-production-agent-prompt-cleanup-handoff.md`

## 当前未完成内容

用户最新要求还没有完成代码修改。下一步应继续做：

1. 重写 `SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT`，按用途分块，例如：
   - `[角色边界]`
   - `[上下文输入]`
   - `[唯一工具：modify_script]`
   - `[初版与多轮修改]`
   - `[版本规则]`
   - `[信息不足处理]`
   - `[脚本结构]`
   - `[交付给视频 workflow]`
   - `[输出要求]`
2. 从 prompt 中移除“视频制作 tool”。
3. 从 prompt 中弱化或移除“候选差异化 / 多策略候选”的表达；用户明确说“不要给多的策略”。
4. 从 prompt 中移除“抖音竖版”这类过窄表达，改为当前接口只生成“短视频脚本”。
5. 保留信息不足时 `needs_more_info` 的严格追问逻辑。
6. 在脚本生成链路里去掉无大模型时的 fallback 脚本返回：
   - 当前 `app/src/server/api/content-generation-service.ts` 里 `generateVideoScriptCandidatesWithAgent` 在无 API key、调用失败、解析失败时会返回 `fallbackCandidates`。
   - 这和用户新要求冲突。
   - 建议改为抛出 `ApiError`，code 可用：
     - `SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED`
     - `SCRIPT_PRODUCTION_MODEL_UNAVAILABLE`
     - `SCRIPT_PRODUCTION_MODEL_OUTPUT_INVALID`
   - message 需要包含或接近：“脚本制作 Agent 未接入大模型，请检查是否接入大模型后再生成脚本。”

## 建议的 TDD 下一步

继续按 TDD 做，先改测试再改实现：

1. 更新 `app/src/server/api/video-script-production-agent.test.ts`
   - 断言 system prompt 包含分块标题。
   - 断言包含 `modify_script` / `脚本制作 tool`。
   - 断言不包含 `视频制作 tool`。
   - 断言不包含 `抖音竖版`。
2. 增加一个纯 helper 测试，用于覆盖“未接入大模型”的文案，例如在 `video-script-production-agent.ts` 中导出：
   - `SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED_MESSAGE`
   - `isScriptProductionModelConfigured(apiKey)`
3. 先运行相关测试，确认失败。
4. 再修改 prompt 与 service 行为。
5. 最后运行最小验证。

## 当前验证结果

上一段清理完成后已经跑过：

1. `node --conditions react-server --test src/server/api/video-script-production-agent.test.ts src/server/api/platform-settings-schema.test.ts`
   - 结果：通过，10 个测试 passed。
2. `corepack pnpm lint`
   - 结果：通过。
3. `git diff --check`
   - 结果：通过。
4. `corepack pnpm typecheck`
   - 结果：失败，但失败点来自已有的未跟踪文件：
     - `app/src/lib/ui/video-job-status-copy.test.ts(20,16)`
     - 报错是 `string | undefined` 不能赋给 `string`。
   - 该文件看起来是本轮任务外的既有 / 并行改动，不应随手回退。

## 当前工作区状态

当前在主工作区：

- `D:\codexplan\jinging`

当前没有新建 worktree、没有 commit、没有 push、没有 merge。

当前 `git status --short` 显示这些改动：

```text
 M app/src/components/merchant/video-workbench.tsx
 M app/src/components/platform-admin/platform-settings-editor.tsx
 M app/src/contracts/knowledge.ts
 M app/src/lib/db/platform-admin-repository.ts
 M app/src/server/api/content-generation-service.ts
 M app/src/server/api/schemas.ts
 M app/src/server/api/video-script-production-agent.test.ts
 M app/src/server/api/video-script-production-agent.ts
 M app/supabase/migrations/202604280001_script_production_agent_settings.sql
?? app/src/lib/ui/video-job-status-copy.test.ts
?? app/src/lib/ui/video-job-status-copy.ts
?? app/src/server/api/platform-settings-schema.test.ts
?? docs/handoff/2026-04-30-script-production-agent-prompt-cleanup-handoff.md
?? docs/handoff/2026-04-30-video-preview-revision-entry-handoff.md
?? docs/handoff/2026-04-30-video-workbench-formal-feedback-handoff.md
```

其中：

1. 与本轮 prompt 清理相关的改动主要是：
   - `app/src/components/platform-admin/platform-settings-editor.tsx`
   - `app/src/contracts/knowledge.ts`
   - `app/src/lib/db/platform-admin-repository.ts`
   - `app/src/server/api/content-generation-service.ts`
   - `app/src/server/api/schemas.ts`
   - `app/src/server/api/video-script-production-agent.test.ts`
   - `app/src/server/api/video-script-production-agent.ts`
   - `app/supabase/migrations/202604280001_script_production_agent_settings.sql`
   - `app/src/server/api/platform-settings-schema.test.ts`
   - `docs/handoff/2026-04-30-script-production-agent-prompt-cleanup-handoff.md`
2. `app/src/components/merchant/video-workbench.tsx`、`app/src/lib/ui/video-job-status-copy.*`、另外两份 video handoff 看起来是本轮任务外的既有 / 并行改动，不要回退。

## 下一位 Agent 接手建议

1. 先不要处理无关 dirty files。
2. 继续完成用户最新 prompt 重设计。
3. 优先改测试：
   - `app/src/server/api/video-script-production-agent.test.ts`
4. 再改实现：
   - `app/src/server/api/video-script-production-agent.ts`
   - `app/src/server/api/content-generation-service.ts`
5. 验证建议：
   - `node --conditions react-server --test src/server/api/video-script-production-agent.test.ts src/server/api/platform-settings-schema.test.ts`
   - `corepack pnpm lint`
   - `git diff --check`
   - `corepack pnpm typecheck`，但需要注明当前可能被任务外的 `video-job-status-copy.test.ts` 阻塞。

## 压缩上下文摘要

一句话版：

当前任务是把视频工作台脚本 Agent 改成“只负责初版脚本 + 多轮修改 + 版本沉淀”的 Agent；它只允许一个 `modify_script` 工具，视频制作交给固定 workflow；已经完成了后台可配置 `systemPrompt` 的清理，但还没完成最新的分块 prompt、去视频制作 tool、去 fallback 脚本和无大模型明确报错。
