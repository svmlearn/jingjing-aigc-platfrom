# 2026-04-24 Cloud Demo Execution Progress

## 本轮目标

按 `docs/handoff/2026-04-23-cloud-demo-execution-brief.md` 先把商家端主链路从旧浅色工作台切到：

- 咨询页作为主首页
- 真实咨询会话 / 策略快照持久化
- 图文草稿真实落库
- 视频脚本真实落库
- 平台管理台可真实修改 `consultation_agent / knowledge_runtime`
- 视频保底轨至少能产出真实 MP4 文件

## 本轮已完成

### 1. 咨询域与知识库基础表

已新增 migration：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`

本轮新增：

- `consultation_sessions`
- `consultation_messages`
- `consultation_events`
- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`

同时扩展了 `platform_settings.category`，新增：

- `consultation_agent`
- `knowledge_runtime`

### 2. 咨询 API 与 demo 引擎

已新增：

- `app/src/contracts/consultation.ts`
- `app/src/contracts/knowledge.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/app/api/consultation/sessions/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/messages/route.ts`

当前能力：

- 商家可创建咨询会话
- 可连续发送消息
- 每轮会更新 `strategy_snapshot`
- 会同步沉淀内容日历草案
- 会返回轻量可见执行卡片

说明：

- 当前咨询引擎是仓库内保底 demo engine，不依赖外部 LLM key
- 已按平台设置中的 `consultation_agent` 读取工具开关与检索参数

### 3. 图文 / 视频生成真实落库

已新增：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/api/content/article-drafts/route.ts`
- `app/src/app/api/content/video-scripts/route.ts`
- `app/src/app/api/content/records/route.ts`
- `app/src/app/api/history/records/route.ts`

当前能力：

- 图文工作台会创建真实 `source_items`
- 图文草稿会写入真实 `content_drafts / content_variants`
- 默认生成 2 个图文版本
- 视频工作台会创建真实 `video_script` 变体
- 内容中心 / 历史页可读取真实咨询、草稿、视频任务记录

### 4. 商家端 UI 已切到原型图方向

已修改 / 新增：

- `app/src/app/page.tsx`
- `app/src/app/dashboard/page.tsx`
- `app/src/app/dashboard/article/page.tsx`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/app/dashboard/content/page.tsx`
- `app/src/app/dashboard/history/page.tsx`
- `app/src/app/dashboard/settings/page.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/*`

当前结果：

- 根路由默认进入咨询页
- 商家端主界面切成暗色原型图风格
- 页面结构对齐：
  - 咨询诊断
  - 图文工作台
  - 视频工作台
  - 内容中心
  - 我的内容
  - 商家设置

旧入口处理：

- `dashboard/import` 重定向到 `dashboard`
- `dashboard/merchant-profile` 重定向到 `dashboard/settings`

### 5. 平台管理台设置页接真实配置

已新增：

- `app/src/components/platform-admin/platform-settings-editor.tsx`

已修改：

- `app/src/app/platform-admin/settings/page.tsx`
- `app/src/contracts/platform-admin.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/schemas.ts`

当前能力：

- 平台管理台设置页真实读取 `/api/platform-admin/settings`
- 可保存：
  - `llmRuntime`
  - `consultationAgent`
  - `knowledgeRuntime`

### 6. 视频保底轨改成真实 MP4

已修改：

- `app/src/server/api/video-edit-jobs-service.ts`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/worker/app/processor.py`

结果：

- 即使 `content_draft` 下还没有上传素材，也允许创建视频任务
- `input_payload.render_mode` 会标记 `script_only_fallback`
- worker 不再因空 `input_assets` 直接报错
- `openstoryline` stub 改成用 `ffmpeg` 生成真实 MP4，而不是把文本写成假 `.mp4`

### 7. 主目录续跑：知识库上传 / 入库 / 检索闭环

本轮按用户要求继续在主目录 `main` 推进，没有切回 `../小红书抖音矩阵获客平台-cloud-demo`。

已新增：

- `app/src/lib/db/knowledge-repository.ts`
- `app/src/server/api/knowledge-service.ts`
- `app/src/app/api/platform-admin/knowledge/documents/route.ts`
- `app/src/app/api/platform-admin/knowledge/documents/[documentId]/route.ts`
- `app/src/app/api/platform-admin/knowledge/documents/[documentId]/retry/route.ts`
- `app/src/app/platform-admin/knowledge/page.tsx`
- `app/src/components/platform-admin/platform-knowledge-manager.tsx`

已修改：

- `app/src/contracts/knowledge.ts`
- `app/src/server/api/cos.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/components/platform-admin/platform-admin-shell.tsx`

当前能力：

- 平台管理台新增“知识库管理”入口
- 可上传文本类文件，或直接粘贴文本内容
- 会创建 `knowledge_documents`
- 会创建并更新 `knowledge_ingestion_jobs`
- 会按 `knowledge_runtime.chunkSize / chunkOverlap` 同步切块写入 `knowledge_chunks`
- 文档状态会从 `uploaded / processing` 推进到 `indexed`，失败时写 `failed`
- 可列表查看文档、状态、最新 job、chunk 数、摘要
- 可删除文档，依赖外键级联删除 chunks / jobs
- 可基于现有 chunks 重跑入库
- 咨询 service 会真实读取 indexed chunks，生成 `knowledge.retrieved` 事件，并把命中结果写入工具卡与可见摘要

参考项目采用情况：

- `references/open-source/hermes-agent/agent/prompt_builder.py`
  - 采用其“上下文注入前先做风险扫描”的思路
  - 当前在 `knowledge-service` 里做基础 prompt-injection / hidden content / secret exfil pattern 扫描
  - 命中风险的文档不会进入 `indexed` 检索
- `references/open-source/hermes-agent/model_tools.py`
  - 采用“工具调用结果结构化回灌”的思路
  - 当前把知识检索作为 `retrieve_knowledge_base` 工具卡与 `knowledge.retrieved` event 记录
- `references/open-source/AIWriteX/src/ai_write_x/core/unified_workflow.py`
  - 采用“统一输入 -> 处理/转换 -> 保存”的链路思路
  - 当前知识入库按“上传/粘贴输入 -> 切块转换 -> 文档与 chunks 落库”执行
- `references/open-source/AIWriteX/knowledge/templates/`
  - 采用其“本地知识/模板作为内容生成材料”的定位
  - 当前先把平台方法论作为咨询与后续内容生成的受控上下文入口

说明：

- 当前是 demo-safe 同步入库，embedding 仍标记为 `pending`
- 检索采用 lexical recall 保底，不依赖外部 LLM / embedding key
- 云端具备 COS env 时会尝试把原文对象写入 COS；本地缺 COS env 时会记录 `cosUploadSkippedReason=COS_NOT_CONFIGURED`，仍允许 DB-only fallback 便于本地 demo 验证

### 8. 主目录续跑：咨询 Agent Loop 收口

本轮继续参考：

- `references/open-source/hermes-agent/run_agent.py`
- `references/open-source/hermes-agent/model_tools.py`
- `references/open-source/hermes-agent/agent/prompt_builder.py`
- `references/open-source/claude-code泄漏的客户端源码/claude-code-main/`

已修改：

- `app/src/server/api/consultation-service.ts`
- `app/src/components/platform-admin/platform-settings-editor.tsx`

当前能力：

- 咨询 service 已从单次 demo 回复整理为有界 `bounded_tool_loop`
- 每轮会创建 `agent.loop.started`
- 每个工具会创建 `agent.tool.completed`
- 知识库检索会额外创建 `knowledge.retrieved`，便于 smoke 和后续审计查询
- 每轮结束会创建 `agent.loop.completed`
- loop 会按后台 `consultationAgent.enabledTools` 决定可执行工具
- loop 会按后台 `consultationAgent.maxRounds` 控制阶段收束
- loop 会按后台 `consultationAgent.systemPrompt` 记录 system prompt preview
- loop 会按后台 `consultationAgent.retrievalTopK` 与 `knowledgeRuntime.retrievalTopK` 决定知识检索上限
- 工具结果会回灌到 `strategySnapshot / knowledgeMatches / visible tool cards / assistant reply`

当前工具清单：

- `read_merchant_profile`
- `retrieve_knowledge_base`
- `read_history`
- `update_strategy_snapshot`
- `update_content_calendar`
- `generate_article_brief`
- `generate_video_brief`

平台后台配置能力：

- `systemPrompt` 已可配置
- `model` 已可配置
- `enabledTools` 已从逗号输入改成技能/工具勾选
- `maxRounds` 已可配置
- `retrievalTopK` 已可配置
- `visibleExecutionMode` 已可配置
- `temperature` 已可配置
- `knowledgeRuntime.chunkSize / chunkOverlap / retrievalTopK / embeddingModel / queryRewriteEnabled` 已可配置
- 知识库文档已可在 `platform-admin/knowledge` 上传、粘贴、删除、重跑

说明：

- 当前不是完整 Claude Code / Hermes runtime 的动态 LLM tool-call planner
- 当前是可审计、可配置、可本地 demo 的确定性有界 loop
- 下一步如果要更接近 Claude Code / Hermes，需要把 planner 从确定性工具序列升级为“LLM 产生 tool call JSON -> schema 校验 -> repair -> dispatch -> observation 回灌 -> 下一轮决策”

### 9. 主目录续跑：商家端 UI 与 AI 原型关键差距收口

本轮继续按 `docs/designs/AI设计的原型图/src/pages/` 做高优先级补齐。

已修改：

- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/components/merchant/article-workbench.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/components/merchant/history-hub.tsx`
- `app/src/components/merchant/content-center.tsx`

当前对齐结果：

- 咨询页补齐原型里的快捷提问 chip、结构化“我的策略资产”、右侧 Agent Loop 可见执行卡
- 图文页补齐“新建/改写”模式切换、参考素材入口、平台风格与口吻选择、空状态引导
- 视频页补齐授权状态提示、AI 脚本协同块、脚本/发布进度的更明确表达
- 历史页补齐搜索过滤与详情入口形态
- 内容中心补齐 `Your Library is Empty` 空状态、上传素材 / 找对标入口形态

说明：

- 这是“关键结构和交互语义”对齐，不是逐像素视觉定稿
- 已完成本地生产服务 smoke，页面可真实渲染
- 后续如要过最终验收，仍建议补一条录屏或逐页截图留痕

## 验证结果

已通过：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app`

本轮主目录续跑新增验证：

- `pnpm install --frozen-lockfile`
  - 结果：通过；主目录 `app/node_modules` 补齐 `cos-nodejs-sdk-v5` 与 `qcloud-cos-sts`
- `pnpm exec tsc --noEmit`
  - 结果：通过
- `pnpm lint`
  - 结果：未完成；ESLint 进程长时间无输出且 CPU 为 0，已手动停止
- `pnpm exec eslint <本轮改动文件>`
  - 结果：未完成；同样长时间无输出且 CPU 为 0，已手动停止
- `pnpm build`
  - 结果：未完成；Next build 在 `Creating an optimized production build ...` 阶段长时间无输出，已手动停止
- `pnpm exec next build --webpack --experimental-app-only`
  - 结果：未完成；webpack 模式同样在 production build 阶段无输出，已手动停止
- `pnpm exec next dev --hostname 127.0.0.1`
  - 结果：未完成；Next dev 子进程存在，但未监听 `127.0.0.1:3000`，已手动停止
- `NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3000`
  - 结果：未完成；webpack dev 子进程存在，但未监听 `127.0.0.1:3000`，已手动停止
- `/Users/wy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`
  - 结果：未完成；使用 Codex bundled Node 仍复现“不监听 3000”，已手动停止
- `pnpm install --force`
  - 结果：通过；将 `node_modules/next` 中被 macOS/iCloud 标记为 `dataless` 的占位文件重新物化，`find node_modules/.../next/dist -flags +dataless` 从 `6517` 降为 `0`
- 删除 iCloud 冲突副本 `* 2.*`
  - 结果：通过；删除 `.next/**` 下冲突生成文件，以及 `src/app/platform-admin/invitation-codes/page 2.tsx`
- `pnpm build`
  - 结果：通过；`Compiled successfully in 2.6s`，TypeScript 2.4s，静态页 `37/37`
- `pnpm lint`
  - 结果：通过；依赖文件物化后不再卡住
- `pnpm exec tsc --noEmit --pretty false`
  - 结果：通过
- `pnpm start`
  - 结果：通过；生产服务 `http://localhost:3000` ready in `91ms`
- `curl -I http://127.0.0.1:3000/dashboard`
  - 结果：通过；HTTP `200 OK`
- 浏览器 smoke：`/dashboard`、`/dashboard/article`、`/dashboard/video`、`/dashboard/content`、`/dashboard/history`
  - 结果：通过；主要商家端页面均可渲染
  - 观察：`/dashboard/content` 与 `/dashboard/history` 显示 `Missing public Supabase environment variables.`，属于本地环境变量缺失，不是页面构建失败
- `git diff --check`
  - 结果：未完成；`.git/objects` 内仍有 iCloud `dataless` 对象，Git 读取历史对象时会卡住。该问题不影响当前 `pnpm lint / tsc / build / start`，但提交前建议先确认 `.git` 目录已完整下载

补充收口：

- 为通过 React 19 hook lint，本轮额外整理：
  - `app/src/components/dashboard/draft-detail.tsx`
  - `app/src/components/dashboard/draft-video-panels.tsx`
  - `app/src/components/merchant/consultation-workspace.tsx`
- 本轮 agent loop / UI 收口后重新执行 `pnpm exec tsc --noEmit`
  - 结果：通过

未完成：

- 未做真实云端 worker 端到端跑通
- 未做录屏验收
- 未做完整逐页截图/录屏验收

## 当前还没完成

离 brief 的 Completion Gate 还差：

1. 知识库已有文本类上传 / 同步入库 / 管理 UI / 咨询 lexical recall 保底闭环，但还没有异步 worker、真实 embedding、RAG 向量召回和云端 UI smoke 记录
2. 咨询 Agent 已有可审计有界 loop，但还不是外部 LLM 驱动的动态 tool-call planner
3. 图文页当前是真实落库，但还没有接外部 LLM 与 RAG
4. 视频页可建真实任务，但还没有在真实环境完成一条 worker 跑通验证
5. 历史详情仍是单页内详情，不是完整独立 detail route
6. 还没有“至少 1 条完整录屏或等价验收记录”
7. 本地 Supabase public env 缺失，内容中心 / 历史页能渲染但 API 数据区会显示环境变量错误

## 当前结论

本轮已经把 cloud demo brief 最关键的第一层打通：

- 商家端主入口切换完成
- 咨询到内容生成的数据结构已落地
- 平台管理台开始真实控制咨询与知识运行参数
- 知识库文本类上传、入库、列表、删除、重跑和咨询检索已补上 demo-safe 闭环
- 咨询 Agent 已补成参考 Hermes / Claude Code 思路的可审计有界 tool loop
- 商家端 UI 已按 AI 原型补齐关键结构差距，并已通过本地生产服务 smoke
- 视频保底轨从“假文件”修到“真实 MP4”

但这还不是最终 Completion Gate 状态，当前更准确的状态应记为：

- `代码已改`
- `上一阶段验证已通过 lint / tsc / build / Python compile`
- `本轮知识库改动已通过 tsc`
- `本轮 agent loop / UI 收口已通过 tsc`
- `本轮 iCloud dataless / 冲突副本问题已处理`
- `本轮 pnpm lint / tsc / build / start / 商家端页面 smoke 已通过`
- `仍需等 .git objects 完整本地化后再跑 git diff --check / commit`
- `已整理到可提交的阶段性 checkpoint 状态`
- `feature worktree commit: 1c6ae66`
- `main commit: 82e6ada`
- `待继续接知识库与真实视频验收`
- `后续默认在 main 继续推进`

## 2026-04-24 补充：无 Supabase env 的本地 demo fallback 与闭环 smoke

### 背景

主目录本地没有 `.env.local`，且当前机器没有可用 Supabase CLI / Docker 本地库，因此真实 DB API 会因 `Missing public Supabase environment variables.` 或 service role 缺失而 500。

本轮没有伪造“云端已跑通”，而是补了一个明确边界的本地 demo fallback：

- 真实 Supabase env 存在时，继续走原 Supabase 路径
- Supabase env 缺失时，商家端使用内存态 demo user / merchant / sessions / drafts / knowledge / video jobs
- 平台 API 在 localhost + 完全无 Supabase env 时允许本地 smoke
- 平台页面 layout 在 localhost + 完全无 Supabase env 时允许进入后台，避免“API 能调、页面进不去”

### 本轮新增 / 修改

- `app/src/lib/demo/local-demo-runtime.ts`
- `app/src/lib/supabase/admin.ts`
- `app/src/lib/supabase/server.ts`
- `app/src/lib/auth/current-user.ts`
- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/server/api/errors.ts`
- `app/src/lib/db/merchant-repository.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/knowledge-repository.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/server/api/video-edit-jobs-service.ts`

### smoke 结果

已重新执行：

- `pnpm exec tsc --noEmit --pretty false`
  - 结果：通过
- `pnpm lint`
  - 结果：通过
- `pnpm build`
  - 结果：通过；`Compiled successfully in 2.5s`，TypeScript `2.4s`，静态页 `37/37`
- `pnpm start`
  - 结果：通过；`http://localhost:3000` ready in `80ms`

API 闭环 smoke：

- `GET /api/platform-admin/settings`
  - 结果：`200`
- `POST /api/platform-admin/knowledge/documents`
  - 结果：`201`，文档状态 `indexed`
- `POST /api/consultation/sessions`
  - 结果：`201`
- `POST /api/consultation/sessions/{sessionId}/messages`
  - 结果：`200`，事件包含 `agent.loop.started / agent.tool.completed / knowledge.retrieved / agent.loop.completed / strategy_snapshot.updated`
- `POST /api/content/article-drafts`
  - 结果：`201`，生成 2 个图文 variants
- `POST /api/content/video-scripts`
  - 结果：`201`
- `POST /api/video-edit-jobs`
  - 结果：`201`，本地 demo 状态为 `pending / local_demo_pending_worker`
- `GET /api/history/records?limit=10`
  - 结果：`200`，返回 `sessions=1 / draftBundles=2 / videoJobs=1`

浏览器 smoke：

- `/dashboard/article`
- `/dashboard/video`
- `/dashboard/content`
- `/dashboard/history`
- `/platform-admin/knowledge`
- `/platform-admin/settings`

结果：

- 以上页面均可打开
- 未再出现 Supabase env 错误
- 平台管理台不再重定向到 `/platform-admin-login`

### 当前边界

- 本地 demo store 是内存态，`pnpm start` 重启后 smoke 数据会清空
- 这不是替代 Supabase 的正式持久层，只是让本地无云配置时可继续 UI/API 验收
- 视频任务在本地 demo store 中可创建，但没有本地 worker 消费该内存任务，真实 MP4 仍需 staging/真实 DB worker 验证
- `.git/objects` 仍可能有 iCloud `dataless` 对象，提交前仍建议确认 Git 对象已完整本地化
