# 2026-04-24 Cloud Demo Execution Handoff

## 1. 当前目标

继续按 `docs/handoff/2026-04-23-cloud-demo-execution-brief.md` 推进，最终交付“可真实跑通的商家平台 demo”。

本轮重点先打第一条真实闭环：

1. 商家进入咨询页
2. 真实产生会话与策略快照
3. 从咨询进入图文 / 视频页
4. 真实写入 `content_drafts / content_variants`
5. 平台管理台真实改咨询与知识参数
6. 视频保底轨改成真实 MP4

## 2. 当前分支 / worktree

- 当前续跑分支：`main`
- 当前续跑 worktree：主目录 `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- 历史阶段性分支：`codex/cloud-demo-execution`
- 历史阶段性 worktree：`../小红书抖音矩阵获客平台-cloud-demo`
- 基线：`main` 上 `9611de0 docs: add cloud demo execution brief`
- 当前主目录 HEAD：`ac24241`
- 说明：`codex/cloud-demo-execution` 的阶段性成果已同步进入 `main`，后续默认不要切回 `-cloud-demo`

## 3. 本轮已完成

### 3.1 咨询域基础设施

已新增：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`
- `app/src/contracts/consultation.ts`
- `app/src/contracts/knowledge.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/app/api/consultation/sessions/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/route.ts`
- `app/src/app/api/consultation/sessions/[sessionId]/messages/route.ts`

结果：

- 咨询会话、消息、事件已可真实持久化
- `strategy_snapshot` 会按轮次更新
- 会返回轻量可见执行卡片

### 3.2 图文 / 视频真实草稿落库

已新增：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/app/api/content/article-drafts/route.ts`
- `app/src/app/api/content/video-scripts/route.ts`
- `app/src/app/api/content/records/route.ts`
- `app/src/app/api/history/records/route.ts`

结果：

- 图文工作台生成真实 `content_drafts / content_variants`
- 视频脚本生成真实 `video_script` 变体
- 内容中心与历史页不再只读 mock

### 3.3 商家端主界面切换

已新增 / 修改：

- `app/src/app/page.tsx`
- `app/src/app/dashboard/page.tsx`
- `app/src/app/dashboard/article/page.tsx`
- `app/src/app/dashboard/video/page.tsx`
- `app/src/app/dashboard/history/page.tsx`
- `app/src/app/dashboard/settings/page.tsx`
- `app/src/app/dashboard/content/page.tsx`
- `app/src/app/dashboard/import/page.tsx`
- `app/src/app/dashboard/merchant-profile/page.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/*`
- `app/src/app/layout.tsx`
- `app/src/app/globals.css`

结果：

- 根路由默认进入 `/dashboard`
- 商家端页面已经切成原型图暗色风格
- 主导航已换成：
  - 咨询诊断
  - 图文工作台
  - 视频工作台
  - 内容中心
  - 我的内容
  - 商家设置

### 3.4 平台管理台设置页接真实配置

已新增：

- `app/src/components/platform-admin/platform-settings-editor.tsx`

已修改：

- `app/src/app/platform-admin/settings/page.tsx`
- `app/src/contracts/platform-admin.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/schemas.ts`

结果：

- 平台管理台可真实读写：
  - `llmRuntime`
  - `consultationAgent`
  - `knowledgeRuntime`

### 3.5 视频保底轨修复

已修改：

- `app/src/server/api/video-edit-jobs-service.ts`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/worker/app/processor.py`

结果：

- 没上传素材时也能创建任务
- worker 不再因空输入直接失败
- `openstoryline-engine` 会用 `ffmpeg` 产出真实 MP4

### 3.6 主目录续跑：知识库上传 / 入库 / 检索闭环

本轮按用户要求在主目录 `main` 继续，没有切回 `-cloud-demo`。

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

结果：

- 平台管理台新增“知识库管理”入口
- 支持上传文本类文件或粘贴文本内容
- 真实创建 `knowledge_documents`
- 真实创建并更新 `knowledge_ingestion_jobs`
- 按 `knowledge_runtime.chunkSize / chunkOverlap` 同步切块写入 `knowledge_chunks`
- 列表可见文档状态、最新 job、chunk 数与摘要
- 支持删除文档和基于现有 chunks 重跑入库
- 咨询 service 已真实检索 indexed chunks，并写入 `knowledge.retrieved` event、工具卡和 visible summary
- 参考 Hermes 做了基础上下文注入风险扫描，命中风险的文档不会进入 indexed 检索

### 3.7 主目录续跑：咨询 Agent Loop 收口

本轮按用户追问继续补齐“咨询 agent 是否构建完成、agent loop 是否参考 Claude Code / Hermes”的实现事实。

已修改：

- `app/src/server/api/consultation-service.ts`
- `app/src/components/platform-admin/platform-settings-editor.tsx`

结果：

- 咨询 service 已从单次 demo 回复整理为 `bounded_tool_loop`
- 每轮会落 `agent.loop.started`
- 每个工具会落 `agent.tool.completed`
- 知识检索会额外落 `knowledge.retrieved`
- 每轮结束会落 `agent.loop.completed`
- loop 会读取后台 `consultationAgent.systemPrompt`
- loop 会读取后台 `consultationAgent.enabledTools`
- loop 会读取后台 `consultationAgent.maxRounds`
- loop 会读取后台 `consultationAgent.retrievalTopK`
- loop 会读取后台 `knowledgeRuntime.retrievalTopK`
- 工具结果会回灌到 `strategySnapshot / knowledgeMatches / visible tool cards / assistant reply`

当前工具清单：

- `read_merchant_profile`
- `retrieve_knowledge_base`
- `read_history`
- `update_strategy_snapshot`
- `update_content_calendar`
- `generate_article_brief`
- `generate_video_brief`

后台配置结果：

- `systemPrompt` 可配置
- `model` 可配置
- `enabledTools` 已改成技能/工具勾选
- `maxRounds` 可配置
- `retrievalTopK` 可配置
- `visibleExecutionMode` 可配置
- `temperature` 可配置
- `knowledgeRuntime.chunkSize / chunkOverlap / retrievalTopK / embeddingModel / queryRewriteEnabled` 可配置
- `platform-admin/knowledge` 可配置知识内容来源

边界说明：

- 当前已经不是简单“一问一答 mock”，而是可审计、可配置、可本地 demo 的确定性有界工具循环
- 当前仍不是完整 Claude Code / Hermes runtime，也不是外部 LLM 动态生成 tool-call JSON
- 下一阶段如果要继续逼近参考项目，应升级为“LLM planner -> schema 校验 -> repair -> dispatch -> observation -> 下一轮决策”

### 3.8 主目录续跑：商家端 UI 与 AI 原型关键差距收口

本轮按 `docs/designs/AI设计的原型图/src/pages/` 继续补齐关键 UI 结构。

已修改：

- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/components/merchant/article-workbench.tsx`
- `app/src/components/merchant/video-workbench.tsx`
- `app/src/components/merchant/history-hub.tsx`
- `app/src/components/merchant/content-center.tsx`

结果：

- 咨询页补齐快捷提问 chip、结构化“我的策略资产”、右侧 Agent Loop 可见执行卡
- 图文页补齐“新建/改写”模式切换、参考素材入口、平台风格与口吻选择、空状态引导
- 视频页补齐授权状态提示、AI 脚本协同块、脚本/发布进度的更明确表达
- 历史页补齐搜索过滤与详情入口形态
- 内容中心补齐 `Your Library is Empty` 空状态、上传素材 / 找对标入口形态

边界说明：

- 当前是关键结构和交互语义对齐，不是逐像素视觉验收
- 已完成本地生产服务浏览器 smoke，核心商家端页面可真实渲染
- 后续还需要一轮正式录屏或逐页截图，把视觉偏差留痕

## 4. 当前没完成的部分

### 4.1 知识库已有保底闭环，但还不是完整 RAG

已经完成：

- 文本类上传 / 粘贴
- 同步切块入库
- 文档列表 / 删除 / 重跑
- 咨询 lexical recall

还没做：

- 异步入库 worker
- PDF / Word 等复杂文档解析
- 真实 embedding
- Supabase pgvector 向量召回
- 云端 UI/API smoke 记录

### 4.2 图文 / 视频生成还是保底 engine

目前生成逻辑是仓库内 demo engine，目标是先保证 demo 可跑。

还没做：

- 外部 LLM 真调用
- 真正的向量 RAG 命中链路

### 4.3 咨询 Agent Loop 仍是确定性 planner

已经完成：

- 可配置 system prompt
- 可配置 model 字段
- 可配置技能 / 工具开关
- 可配置知识库 runtime
- 有界工具循环
- 结构化事件审计
- 工具结果回灌

还没做：

- 外部 LLM 动态 planner
- tool-call JSON schema 校验与自动 repair 的完整链路
- 多轮 observation 后再规划下一步工具
- prompt / skill / knowledge 的版本化发布与回滚

### 4.4 商家端 UI 还缺浏览器验收

已经完成：

- 已按 AI 原型补齐主页面的关键结构差距
- 已通过 TypeScript 检查
- 已通过本地生产服务 smoke

还没做：

- 录屏验收
- 逐页面视觉偏差记录

### 4.5 视频还未做真实云端验收

当前只做到：

- 前端能建任务
- worker stub 能编译
- stub 能产出真实 MP4

还没做：

- 真正跑一条 `video_edit_jobs` 从 `pending -> succeeded`
- 成片回写到 COS
- 页面上看到真实成片 URL

### 4.6 Completion Gate 还没过

主要欠缺：

1. 知识库云端 UI/API smoke、异步 worker、embedding 与向量召回
2. 咨询 Agent 从确定性 planner 升级到外部 LLM tool-call planner
3. 视频真实 worker 验收
4. 至少一条录屏 / 等价验收记录
5. 更完整的 history detail route
6. 本地 lint / build / dev server 卡住问题

## 5. 推荐下一步顺序

建议按这个顺序继续：

1. 先排查 Next dev / build 卡住，拿到本地浏览器 UI smoke 能力
2. 对知识库管理页做一轮本地或 staging UI/API smoke：上传文本、列表、重跑、删除、咨询命中
3. 对咨询页做一轮 agent loop smoke：确认 `agent.loop.started / agent.tool.completed / knowledge.retrieved / agent.loop.completed`
4. 再决定是否把知识入库从同步 demo-safe 方案升级为 worker 异步方案
5. 接 embedding 与 Supabase pgvector 向量召回
6. 把咨询 planner 从确定性工具序列升级为 LLM tool-call planner
7. 用当前 video page 建一条真实任务，在 staging worker 上验一遍
8. 验证 COS 回写与结果预览
9. 补录屏或等价完整验收记录

## 6. 验证结果

已通过：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app`

本轮主目录续跑新增验证：

- `pnpm install --frozen-lockfile`
  - 通过；主目录 `app/node_modules` 补齐 `cos-nodejs-sdk-v5` 与 `qcloud-cos-sts`
- `pnpm exec tsc --noEmit`
  - 通过
- `pnpm lint`
  - 未完成；ESLint 进程长时间无输出且 CPU 为 0，已手动停止
- `pnpm exec eslint <本轮改动文件>`
  - 未完成；同样长时间无输出且 CPU 为 0，已手动停止
- `pnpm build`
  - 未完成；Next build 在 `Creating an optimized production build ...` 阶段长时间无输出，已手动停止
- `pnpm exec next build --webpack --experimental-app-only`
  - 未完成；webpack 模式同样在 production build 阶段无输出，已手动停止
- `pnpm exec next dev --hostname 127.0.0.1`
  - 未完成；Next dev 子进程存在，但未监听 `127.0.0.1:3000`，已手动停止
- `NEXT_TELEMETRY_DISABLED=1 pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3000`
  - 未完成；webpack dev 子进程存在，但未监听 `127.0.0.1:3000`，已手动停止
- `/Users/wy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`
  - 未完成；使用 Codex bundled Node 仍复现“不监听 3000”，已手动停止
- `pnpm exec tsc --noEmit`
  - 通过；本轮 agent loop / UI / 文档收口后重新执行
- `pnpm install --force`
  - 通过；将 `node_modules/next` 中被 macOS/iCloud 标记为 `dataless` 的占位文件重新物化
- 删除 iCloud 冲突副本 `* 2.*`
  - 通过；删除 `.next/**` 冲突生成文件，以及 `src/app/platform-admin/invitation-codes/page 2.tsx`
- `pnpm build`
  - 通过；`Compiled successfully in 2.6s`，TypeScript 2.4s，静态页 `37/37`
- `pnpm lint`
  - 通过；依赖文件物化后不再卡住
- `pnpm exec tsc --noEmit --pretty false`
  - 通过
- `pnpm start`
  - 通过；生产服务 `http://localhost:3000` ready in `91ms`
- `curl -I http://127.0.0.1:3000/dashboard`
  - 通过；HTTP `200 OK`
- 浏览器 smoke：`/dashboard`、`/dashboard/article`、`/dashboard/video`、`/dashboard/content`、`/dashboard/history`
  - 通过；核心商家端页面均可渲染
  - 观察：内容中心与历史页显示 `Missing public Supabase environment variables.`，属于本地环境变量缺失
- `git diff --check`
  - 未完成；`.git/objects` 内仍有 iCloud `dataless` 对象，Git 读取历史对象时会卡住。提交前建议先确认 `.git` 目录完整下载

补充收口：

- 为通过 React 19 hook lint，本轮额外整理：
  - `app/src/components/dashboard/draft-detail.tsx`
  - `app/src/components/dashboard/draft-video-panels.tsx`
  - `app/src/components/merchant/consultation-workspace.tsx`

## 7. 改动文件范围

核心代码：

- `app/src/app/page.tsx`
- `app/src/app/dashboard/**`
- `app/src/app/api/consultation/**`
- `app/src/app/api/content/**`
- `app/src/app/api/history/**`
- `app/src/app/api/platform-admin/knowledge/**`
- `app/src/app/platform-admin/knowledge/page.tsx`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/**`
- `app/src/components/platform-admin/platform-knowledge-manager.tsx`
- `app/src/components/platform-admin/platform-settings-editor.tsx`
- `app/src/contracts/consultation.ts`
- `app/src/contracts/knowledge.ts`
- `app/src/contracts/platform-admin.ts`
- `app/src/contracts/draft.ts`
- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/knowledge-repository.ts`
- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/content-generation-service.ts`
- `app/src/server/api/knowledge-service.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/server/api/cos.ts`
- `app/src/server/api/schemas.ts`

数据与 worker：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`
- `workers/video-worker/openstoryline/app/main.py`
- `workers/video-worker/worker/app/processor.py`

## 8. 参考项目采用情况

### 咨询 Agent

本轮实际借鉴：

- `references/open-source/hermes-agent/`

采用方式：

- 借其“有界工具循环 + 结构化快照 + 轻量可见执行”思路
- 当前没有照抄运行时，而是在 `app/src/server/api/consultation-service.ts` 里做了可审计 `bounded_tool_loop`
- 本轮补充参考 Claude Code 泄漏客户端源码的 agent-loop 形态：有界循环、工具预算、工具调度、结果 observation 回灌、事件留痕
- 本轮知识库检索补充借鉴 `agent/prompt_builder.py` 的安全上下文注入思路：知识文档入库前做基础 prompt-injection 扫描，咨询时只注入 indexed chunks
- 本轮知识检索补充借鉴 `model_tools.py` 的结构化工具回灌思路：检索结果写入 `retrieve_knowledge_base` 工具卡、`agent.tool.completed` 与 `knowledge.retrieved` event

### 商家端视觉

本轮实际采用：

- `docs/designs/AI设计的原型图/`

主要映射：

- `src/pages/Consultation.tsx`
- `src/pages/ArticleWorkbench.tsx`
- `src/pages/VideoWorkbench.tsx`
- `src/pages/ContentCenter.tsx`
- `src/pages/History.tsx`
- `src/pages/Settings.tsx`
- `src/components/layout/MainLayout.tsx`

### 图文生成

本轮只借了“统一输入 -> 多版本输出 -> 落库”的结构思路，未直接接入上游：

- `references/open-source/AIWriteX/`

本轮知识库补充采用：

- `references/open-source/AIWriteX/src/ai_write_x/core/unified_workflow.py`
  - 借其“统一输入 -> 处理/转换 -> 保存”的链路组织方式
  - 当前映射为“上传/粘贴输入 -> 切块转换 -> documents/chunks/jobs 落库”
- `references/open-source/AIWriteX/knowledge/templates/`
  - 借其“本地知识/模板作为内容生成材料”的定位
  - 当前先作为咨询 Agent 的受控知识上下文入口

### 视频链路

本轮保留当前 worker 架构，并把本地 stub 修到能产出真实 MP4：

- `workers/video-worker/openstoryline/app/main.py`

还没有真正接：

- `references/open-source/小红书AI剪辑视频/`

## 9. Push / Merge / Commit 状态

- `codex/cloud-demo-execution` 已冻结阶段性 checkpoint commit：`1c6ae66`
- 该阶段性成果已同步进入 `main`：`82e6ada`
- 当前主目录 `main` HEAD：`ac24241`
- 本轮知识库 / agent loop / UI 续跑尚未创建新 commit
- Completion Gate 仍未完成

## 10. 当前建议状态

当前最合适的状态是：

- `待继续执行`
- `已具备阶段性 checkpoint 条件`
- `知识库 demo-safe 保底闭环已补，待 smoke 与向量化`
- `咨询 Agent bounded tool loop 已补，待 LLM planner 化`
- `商家端 UI 已按 AI 原型补齐关键结构差距，待浏览器验收`
- `待真实视频验收`
- `默认直接在 main 推进`

## 11. 给下一个零记忆 Agent 的续跑提示

如果你是“没有聊天记忆、只读文件接手”的下一位，请直接按下面做，不要再重走一遍探索。

### 11.1 先读这些文件，顺序不要变

1. `AGENTS.md`
2. `docs/handoff/2026-04-23-cloud-demo-execution-brief.md`
3. `docs/progress/2026-04-24-cloud-demo-execution-progress.md`
4. 本文件 `docs/handoff/2026-04-24-cloud-demo-execution-handoff.md`

读完这 4 个文件后，就可以直接继续实现，不需要再从聊天记录里找上下文。

### 11.2 先确认工作区，不要跑错地方

当前默认续跑工作区已经回到主目录：

- workspace: `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`
- branch: `main`

补充说明：

- 历史并行开发 worktree 仍存在：`/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台-cloud-demo`
- 它对应的分支是：`codex/cloud-demo-execution`
- 但当前这轮 cloud demo 第一阶段成果已经 cherry-pick 到 `main`，后续默认不要再切回 `-cloud-demo`，除非明确要对照旧 worktree 快照。

### 11.3 当前“已经成立”的事实

这些可以直接当真相源，不要再重新怀疑一遍：

1. 商家端主入口已经不是旧浅色后台，主页已经切到 `/dashboard` 咨询页
2. 咨询会话 / 策略快照 / 图文草稿 / 视频脚本 都已经有真实表和真实 API
3. 第一阶段 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build` 已通过
4. 本轮知识库新增代码已通过 `pnpm exec tsc --noEmit`
5. 本轮主目录 `pnpm lint` 与 `pnpm build` 进程卡住，未得到通过结论
6. worker Python compile 已通过
7. 视频保底轨已经不是“假 mp4 文本文件”，而是真 `ffmpeg` 生成 MP4
8. 知识库文本类上传 / 入库 job / 管理台列表 / 咨询 lexical recall 已有代码闭环
9. 咨询 Agent 已有可审计有界 tool loop，后台可配置 system prompt / model / skill / knowledge runtime
10. 商家端 UI 已补齐 AI 原型关键结构差距，并已通过本地生产服务 smoke
11. `pnpm build` 和 `pnpm start` 已恢复正常，之前卡住的直接原因是 iCloud `dataless` 占位文件和 `* 2.*` 冲突副本
12. `.git/objects` 仍有部分 iCloud `dataless` 对象，`git diff --check` / commit 前需要等 Git 对象完整本地化

### 11.4 当前不要浪费时间的地方

这几处不用再重复排雷：

1. React 19 hook lint 相关阻塞已经补过一轮
2. 相关文件包括：
   - `app/src/components/dashboard/draft-detail.tsx`
   - `app/src/components/dashboard/draft-video-panels.tsx`
   - `app/src/components/merchant/consultation-workspace.tsx`
3. 现在更值得花时间的是 Supabase env 补齐、知识库 smoke、向量化、LLM planner 化和真实视频验收

结论：

- 不要再把时间花在同一批 lint 清障上
- 先继续完成 brief 的 Completion Gate

### 11.5 你接下来最应该做的事

不要散着修，直接按这个顺序往前推：

1. 先补本地或 staging 的 Supabase public env，让内容中心 / 历史页不再显示环境变量错误
2. 跑知识库 UI/API smoke：上传文本、确认 `indexed`、咨询发问看 `knowledge.retrieved`
3. 跑咨询 agent loop smoke：确认 loop/tool/knowledge/completed 事件都落库
4. 再补 embedding / pgvector 向量召回，替换当前 lexical recall 保底
5. 将 consultation planner 升级为外部 LLM tool-call planner
6. 再决定是否把知识入库迁到独立 worker
7. 然后在 staging worker 上真实跑一条 `video_edit_jobs`
8. 最后补录屏或等价验收记录

### 11.6 继续实现时优先看的代码入口

如果你要继续写：

- 咨询链路入口：
  - `app/src/server/api/consultation-service.ts`
  - `app/src/lib/db/consultation-repository.ts`
- 图文 / 视频草稿入口：
  - `app/src/server/api/content-generation-service.ts`
  - `app/src/lib/db/content-draft-repository.ts`
- 商家端页面入口：
  - `app/src/components/merchant/consultation-workspace.tsx`
  - `app/src/components/merchant/article-workbench.tsx`
  - `app/src/components/merchant/video-workbench.tsx`
- 平台设置入口：
  - `app/src/components/platform-admin/platform-settings-editor.tsx`
  - `app/src/lib/db/platform-admin-repository.ts`
- 知识库入口：
  - `app/src/components/platform-admin/platform-knowledge-manager.tsx`
  - `app/src/server/api/knowledge-service.ts`
  - `app/src/lib/db/knowledge-repository.ts`
  - `app/src/app/api/platform-admin/knowledge/documents/route.ts`
- 视频 worker 入口：
  - `workers/video-worker/openstoryline/app/main.py`
  - `workers/video-worker/worker/app/processor.py`

### 11.7 如果只剩一轮上下文，先做哪一件

优先级最高的是：

- 补 Supabase env 后，对知识库闭环与 agent loop 做 smoke

原因：

1. 文本类上传、入库 job、管理台列表、咨询 lexical recall 和 agent loop 已有代码闭环
2. 本地 build/start 与商家端页面渲染已经恢复，下一步最缺的是 API 数据 smoke 和事件表证明
3. 证明闭环后，再把保底检索升级为 embedding / pgvector 才最稳

### 11.8 完成后别忘了补文档

如果你继续完成了新的链路，结束前至少要更新：

- `docs/progress/2026-04-24-cloud-demo-execution-progress.md`
- 本 handoff，或者新增下一份 handoff

不要把新的真实状态只留在聊天里。

## 12. 2026-04-24 续跑补充：本地 demo fallback 已跑通

### 12.1 本轮新增事实

主目录本地仍没有 Supabase `.env.local`，所以本轮补了本地 demo fallback，而不是阻塞在云端配置上。

当前行为：

- 有真实 Supabase env：继续走 Supabase
- 无 Supabase env：使用内存态 demo user / merchant / consultation / knowledge / draft / video job store
- localhost + 无 Supabase env：平台 API 与平台页面允许本地 smoke
- 非 localhost 或真实环境：仍不应把本地 demo 当正式后台权限体系

### 12.2 本轮新增 / 修改文件

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

### 12.3 最新验证结论

已通过：

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm lint`
- `pnpm build`
- `pnpm start`

API smoke 已通过：

- 平台设置读取：`GET /api/platform-admin/settings -> 200`
- 知识上传入库：`POST /api/platform-admin/knowledge/documents -> 201 / indexed`
- 咨询会话创建：`POST /api/consultation/sessions -> 201`
- agent loop：消息发送后事件包含 `knowledge.retrieved`
- 图文草稿：`POST /api/content/article-drafts -> 201`
- 视频脚本：`POST /api/content/video-scripts -> 201`
- 视频任务：`POST /api/video-edit-jobs -> 201`
- 历史聚合：`GET /api/history/records?limit=10 -> 200`

浏览器 smoke 已通过：

- `/dashboard/article`
- `/dashboard/video`
- `/dashboard/content`
- `/dashboard/history`
- `/platform-admin/knowledge`
- `/platform-admin/settings`

当前生产服务仍在运行：

- `http://localhost:3000`

### 12.4 还差什么

这轮解决的是“本地无 Supabase env 也能继续验收”的问题，不等于最终 Completion Gate。

继续优先级：

1. 补真实 Supabase/staging env，跑同一套 smoke，确认不是只在内存 fallback 里成立
2. 给知识库补 embedding / pgvector，替换当前 lexical recall 保底
3. 把 consultation planner 升级为外部 LLM tool-call planner
4. 在真实 DB + worker 环境跑一条 `video_edit_jobs`，确认真实 MP4 产物链路
5. 补逐页截图或录屏验收记录
