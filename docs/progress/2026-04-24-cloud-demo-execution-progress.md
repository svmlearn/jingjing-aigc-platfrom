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

## 验证结果

已通过：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app`

补充收口：

- 为通过 React 19 hook lint，本轮额外整理：
  - `app/src/components/dashboard/draft-detail.tsx`
  - `app/src/components/dashboard/draft-video-panels.tsx`
  - `app/src/components/merchant/consultation-workspace.tsx`

未完成：

- 未做真实云端 worker 端到端跑通
- 未做录屏验收

## 当前还没完成

离 brief 的 Completion Gate 还差：

1. `knowledge_documents / knowledge_ingestion_jobs` 只有 schema 和基础表，还没有上传 / 入库 / 管理 UI
2. 图文页当前是真实落库，但还没有接外部 LLM 与 RAG
3. 视频页可建真实任务，但还没有在真实环境完成一条 worker 跑通验证
4. 历史详情仍是单页内详情，不是完整独立 detail route
5. 还没有“至少 1 条完整录屏或等价验收记录”

## 当前结论

本轮已经把 cloud demo brief 最关键的第一层打通：

- 商家端主入口切换完成
- 咨询到内容生成的数据结构已落地
- 平台管理台开始真实控制咨询与知识运行参数
- 视频保底轨从“假文件”修到“真实 MP4”

但这还不是最终 Completion Gate 状态，当前更准确的状态应记为：

- `代码已改`
- `验证已通过 lint / tsc / build / Python compile`
- `已整理到可提交的阶段性 checkpoint 状态`
- `待继续接知识库与真实视频验收`
- `是否合入 main 取决于当前收口决策`
