# 2026-05-03 咨询 Agent Runtime 模块化 Handoff

## 当前目标

把咨询 Agent 从“主 service 内隐式拼装”推进到“统一 runtime + 共享上下文装配器 + 专家容器切面”的结构。

本轮范围是 Phase B：机械拆分，不改变现有咨询行为。

## 已完成内容

- 新增设计文档：`docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md`。
- 新增 runtime 目录：`app/src/server/api/consultation-runtime/`。
- 已拆出的模块：
  - `types.ts`
  - `experts.ts`
  - `context.ts`
  - `guards.ts`
  - `skills.ts`
  - `tools.ts`
  - `planner.ts`
  - `utils.ts`
- `consultation-service.ts` 已改为从 runtime 模块导入：
  - 默认 Agent / `@专家` 解析
  - 专家容器 prompt
  - 共享上下文注入器
  - skill progressive disclosure
  - 受控业务工具目录
  - 确定性工具 planner
- `consultation-service.test.ts` 已改为同时扫描主 service 和 runtime 模块，避免拆分后测试只盯旧单文件。
- `update_strategy_snapshot` 已接入 guardrail：未调用 editor tool、schema retry 失败、runtime error、闲聊低置信误写、脏内容产物都会拒写并保留原资产。
- `agent_runtime_snapshots` 已接入真实咨询 runtime，写入失败只记录 `agent.runtime_snapshot.failed`，不阻断商家端回复。
- `planner.ts` 已升级为动态小循环：
  - `planNextConsultationToolCall()` 每轮只规划下一步工具。
  - 有 LLM key 时使用 JSON planner；无 key / JSON 无效 / 工具越界 / 过早 stop 时回到确定性 fallback。
  - planner 读取上一轮 observation，并把 `plannerTrace` 写入 tool event、loop completed event 和 runtime snapshot。
- `runtime.ts` 已成为咨询 runtime 编排入口：
  - `runConsultationRuntime()` 负责 agent loop。
  - `buildConsultationRuntimeSnapshotRecord()` 统一生成 snapshot 摘要。
  - `consultation-service.ts` 保留 auth/session/message/persistence 与工具副作用。
- `events.ts` 已抽出 runtime 事件 payload 构造。
- `rag.ts` 已抽出知识检索、embedding fallback 和专家 knowledgeDocumentIds scope。
- skill scoring 已接入：
  - `scoreConsultationSkills()` 输出分数。
  - active skill 带 `triggerReasons`。
  - snapshot 记录 active skill score 和触发原因。
- context budget 已接入：
  - `ContextBudgetReport`
  - `buildContextBudgetReport()`
  - `sessionSummary`
  - `char_budget_v1`
- 保持现有行为：
  - `@专家` 只切换专家容器，不清空 session/history/strategy。
  - 平台知识按专家绑定 knowledge documents 收窄。
  - 商家私有 indexed knowledge 继续按 merchant 共享。
  - 策略资产 editor 仍由模型 tool call + Zod 校验 + retry 负责，但写入前新增 guardrail。

## 本轮改动文件

- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/consultation-service.test.ts`
- `app/src/server/api/consultation-runtime/types.ts`
- `app/src/server/api/consultation-runtime/experts.ts`
- `app/src/server/api/consultation-runtime/context.ts`
- `app/src/server/api/consultation-runtime/events.ts`
- `app/src/server/api/consultation-runtime/guards.ts`
- `app/src/server/api/consultation-runtime/rag.ts`
- `app/src/server/api/consultation-runtime/runtime.ts`
- `app/src/server/api/consultation-runtime/skills.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-runtime/planner.ts`
- `app/src/server/api/consultation-runtime/utils.ts`
- `app/src/lib/db/agent-console-repository.ts`
- `docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md`
- `docs/progress/2026-05-03-consultation-runtime-reference-audit.md`

## 未改内容

- 未新增 Supabase migration。
- 未修改 merchant UI。
- 未修改 roundtable legacy service。
- 未部署 staging。

## 验证结果

已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-service.test.ts src/server/api/consultation-runtime src/lib/db/agent-console-repository.ts
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-service.test.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts docs/架构规范/2026-05-03-consultation-agent-runtime-modularization-design.md docs/progress/2026-05-03-consultation-runtime-reference-audit.md
rg -n "references/open-source|claude-code泄漏|hermes-agent|hermes_safe_context_block|systemPromptPreview" app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime app/src/lib/db/agent-console-repository.ts
```

结果：

- 19 条测试通过。
- TypeScript typecheck 通过。
- ESLint 通过。
- diff whitespace 检查通过。
- production runtime 文件未命中敏感参考来源或旧 debug 字段。
- `node --test` 仍有既有 package ESM warning，不影响本轮验证。

Long-task gate：

- taskId：`consultation-runtime-completion`
- completionPromise：`CONSULTATION_RUNTIME_COMPLETE`
- checkedAt：2026-05-03 11:33:02 +08:00
- status：`complete`
- 结论：hard gates 和独立 verifier 均通过。

## 后续建议

1. 后台 Agent Console 后续增加“可被 @ 调用”、别名、展示排序等显式配置。
2. context budget 后续可从字符级升级到 token accounting 和摘要压缩。
3. skill scoring 后续可接真实 usage count 表或 runtime snapshot 聚合。

## 追加修复：fallback 可见话术泄漏内部 tool key

本地试用时发现，低信息输入“我也不清楚你有什么建议吗？”会触发一条不合适回复：可见话术里暴露 `read_merchant_profile / read_history / update_content_calendar / generate_article_brief` 等内部 tool key，并且在策略资产未必写入时声称“已合并到客群和内容场景里”。

处理结论：

- 不是单纯的专家 prompt 问题，主要是 fallback 模板和 runtime 依赖判定问题。
- `buildAssistantReply()` 已改为：
  - 低信息输入不写右侧策略资产，只给方向选择。
  - 只有 `update_strategy_snapshot` completed 后才说“已写入 / 已合并”。
  - 只有 `update_content_calendar` completed 后才说“右侧内容日历已更新”。
- `buildAgentLoopReplyHint()` 不再拼接内部 tool key。
- 回复模型输入和 context injection 中的 tool result 改为中文 label，降低模型泄漏内部 key 的概率。
- `runConsultationRuntime()` 已改为：`update_strategy_snapshot` skipped 不再满足后续内容工具依赖，并停止本轮后续内容工具执行。

追加验证已通过：

```bash
cd app && node --test src/server/api/consultation-service.test.ts
cd app && npm run typecheck
cd app && npm run lint -- src/server/api/consultation-service.ts src/server/api/consultation-runtime/runtime.ts src/server/api/consultation-runtime/context.ts src/server/api/consultation-runtime/tools.ts src/server/api/consultation-service.test.ts
git diff --check -- app/src/server/api/consultation-service.ts app/src/server/api/consultation-runtime/runtime.ts app/src/server/api/consultation-runtime/context.ts app/src/server/api/consultation-runtime/tools.ts app/src/server/api/consultation-service.test.ts
```

结果：

- 21 条测试通过。
- TypeScript typecheck 通过。
- 针对修复文件的 ESLint 通过。
- diff whitespace 检查通过。

## 追加修复：按轮次推进导致“假 Agent / 状态机”体验

继续本地试用后确认：当前本地 LLM runtime 实际不可用。`.env.local` 有 `LLM_API_KEY`，但按默认 SiliconFlow `Qwen/Qwen3-32B` 调最小 chat completion 返回 HTTP `401`。因此本地商家端很多回复进入 fallback 路径。

旧 fallback / stage 逻辑的问题是：

- `nextStage` 按用户消息轮次硬切，第 3 轮自动进入“策略沉淀完成”。
- fallback 回复按 round 说“策略已经够落地了”，即使用户是在质疑“为什么不先问实际情况”。
- tool cards 对未执行的 writer tools 使用 completed 默认值，导致内容日历 / 图文 / 视频没有真实执行也显示 completed。

已修复：

- 阶段标签改为由真实 tool result 决定，不再按第 N 轮消息推进。
- 没有策略写入时，最终阶段为 `实际情况确认中`。
- 只有 `update_strategy_snapshot` completed 后才显示 `策略资产待确认`。
- 只有 `update_content_calendar` completed 后才显示 `策略沉淀完成`。
- fallback 识别“应该先问实际情况”类流程质疑，并明确先问事实、不写策略资产、不套模板。
- tool cards 默认把未执行 writer tools 标为 skipped。

实际接口验证结果：

- 对新 session 发送 `@初始咨询 Agent 不应该先问我的实际情况什么的吗？`
- 返回 `currentStage = 实际情况确认中`
- assistant 回复：承认“真正的咨询应该先问实际情况”
- `update_strategy_snapshot` skipped
- `update_content_calendar` / `generate_article_brief` / `generate_video_brief` skipped

追加验证：

- 23 条测试通过。
- TypeScript typecheck 通过。
- targeted ESLint 通过。
- targeted diff whitespace 检查通过。

## 追加部署：Vercel Production + Production Supabase

用户明确要求直接推送到正式环境后，已将当前本地工作区部署到 Vercel Production，并同步本地运行环境到 Production Supabase + SiliconFlow。

执行记录：

- 已备份原本地环境文件：
  - `app/.env.local.backup-20260503-173338`
- 已执行：

```bash
cd app && vercel env pull .env.local --environment=production --yes
cd app && npm run build
cd app && vercel --prod --yes
```

环境状态：

- 本地 `.env.local` 已改为 Production 环境变量。
- 本地已使用 Production `SILICONFLOW_API_KEY`。
- 本地已使用 Production Supabase 三件套。
- Production Supabase `llm_runtime` 为：
  - `providerLabel = SiliconFlow`
  - `baseUrl = https://api.siliconflow.cn/v1`
  - `primaryModel = Qwen/Qwen3-32B`
  - `fallbackModel = Qwen/Qwen3-14B`
- SiliconFlow 最小 chat completion 返回 `200 OK`。
- Production Supabase platform settings 可读。

部署结果：

- Inspect URL：`https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/BjoeDruzSSt1Sz4CQZ3gZ7qQmfw8`
- Deployment URL：`https://jingjing-content-platform-staging-kdo9ri60u.vercel.app`
- Production alias：`https://jingjing-content-platform-staging.vercel.app`
- Vercel Production build 通过。
- Production alias 已切换到新部署。

线上验证：

- `https://jingjing-content-platform-staging.vercel.app/` 返回 `200`
- `https://jingjing-content-platform-staging.vercel.app/login` 返回 `200`

风险提示：

- 当前本地 `.env.local` 已直连 Production Supabase，本地任何登录后操作都会写真实线上数据。
- 本次是 Vercel CLI 从当前本地未提交工作区直接部署 Production；尚未 git commit / push / merge。

## 追加修复：Agent Console 支持新建 Agent，并进入商家端 @ 专家列表

用户指出：当前后台只有一个咨询 Agent，且无法新增 Agent；新建 Agent 如果上线，应该出现在商家咨询页可 @ 的专家列表里。

已完成：

- 后台 `Agent 配置` 左侧列表增加“新建 Agent”入口。
- 顶部“复制 Agent”按钮接入真实 copy API。
- 顶部“保存”按钮接入真实 update API。
- 顶部“设为线上”按钮接入真实 set-online API。
- 基础信息区可编辑：
  - 名称
  - 状态
  - 角色描述
  - 后台描述
- 点击“设为线上”时，如果 Agent 还是草稿，会先自动保存为 `enabled`，再设为默认咨询入口。
- 因为商家端专家列表按 `serviceStatus === "enabled"` 读取，所以被启用 / 设为线上的 Agent 会进入商家端 @ 专家列表。
- 新增测试：
  - `app/src/server/api/agent-console-admin.test.ts`

验证：

- `node --test src/server/api/agent-console-admin.test.ts src/server/api/consultation-service.test.ts` 通过，25 条相关测试通过。
- `npm run typecheck` 通过。
- targeted ESLint 通过。
- `npm run build` 通过。

Production 部署：

- Inspect URL：`https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/3vrnDcnQtrYCB491U5uSumd4bSmD`
- Deployment URL：`https://jingjing-content-platform-staging-ob0i7d6qv.vercel.app`
- Production alias：`https://jingjing-content-platform-staging.vercel.app`
- Vercel Production build 通过，alias 已切换。

线上访问验证：

- `/platform-admin-login` 返回 `200`
- `/platform-admin/agents` 未登录返回 `307`，符合管理员鉴权预期。

## Branch / Merge 状态

- Branch：`codex/v2.2-roundtable-multi-agent`
- Commit：未创建
- Push：未 push
- Merge：未 merge
- Vercel Production：已部署
- 状态：guardrail、runtime snapshot、动态 planner 小循环、skill scoring、context budget、runtime.ts 编排入口、Agent Console 新建/复制/保存/设线上闭环已完成；当前已部署到 Vercel Production，待用户线上验收 / 待决定是否 commit、push、merge
