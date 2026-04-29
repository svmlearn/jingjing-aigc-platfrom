# 2026-04-24 Staging Full Deploy Current Target Progress

## 本轮目标

按 `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/docs/handoff/2026-04-24-staging-full-deploy-runbook-for-next-ai.md`，把当前目标代码部署到 staging 的三层环境：

- Supabase
- Vercel
- 腾讯云轻量服务器 worker

本轮约束：

- 不碰 `openclaw`
- 不使用 `/Users/wy/Documents/wy.pem`
- 部署完成后补新的 `progress / handoff`

## 关键执行说明

主目录 `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台` 仍受 iCloud dataless 文件影响，`.git/HEAD`、`.git/objects`、部分 `workers/video-worker` 与 `.vercel` 文件读取会阻塞。因此本轮没有在主目录强行执行 `git status / git rev-parse` 或直接用主目录 `.vercel` 部署。

本轮采用的实际策略：

- Vercel：从完整的 staging worker worktree 复制 `app` 基底，再叠加主目录当前可读 `app` 文件，生成干净部署快照。
- Supabase：通过已登录 Supabase Dashboard 浏览器会话调用 Supabase Management API 执行 migration。
- Worker：使用已完整存在部署脚本的 `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap` 更新远端 worker。

本轮没有打印、落盘或写入任何 Supabase / Vercel / COS / SSH 密钥。

## 1. Supabase 部署结果

目标项目：

- Project Ref: `jrveaabguddromjtibbs`
- URL: `https://jrveaabguddromjtibbs.supabase.co`

本轮处理的 migration：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`

执行前检查：

- 已存在：`platform_settings`
- 已存在：`video_edit_jobs`
- 已存在：`asset_objects`
- 缺失：`consultation_sessions`
- 缺失：`consultation_messages`
- 缺失：`consultation_events`
- 缺失：`knowledge_documents`
- 缺失：`knowledge_chunks`
- 缺失：`knowledge_ingestion_jobs`

执行过程：

- 先尝试通过 worker 侧 `video_worker` 数据库角色执行 migration，失败。
- 失败原因：`psycopg.errors.InsufficientPrivilege: must be owner of table platform_settings`
- 结论：worker 角色权限符合预期，不能拿它做 schema migration。
- 后通过 Supabase Management API 执行 migration 成功。
- Management API 认证来自浏览器中已登录的 Supabase Dashboard 会话，token 没有输出到日志或文档。

执行后验证：

- `consultation_sessions = consultation_sessions`
- `consultation_messages = consultation_messages`
- `consultation_events = consultation_events`
- `knowledge_documents = knowledge_documents`
- `knowledge_chunks = knowledge_chunks`
- `knowledge_ingestion_jobs = knowledge_ingestion_jobs`
- `platform_settings` 中已存在 `category = consultation_agent, key = consultation`
- `platform_settings` 中已存在 `category = knowledge_runtime, key = knowledge`

## 2. Vercel 部署结果

目标项目：

- Project: `jingjing-content-platform-staging`
- Team: `neveraloofwy-4960s-projects`
- 主域名: `https://jingjing-content-platform-staging.vercel.app`

本轮干净部署快照：

- `/tmp/jingjing-staging-deploy-20260424-135650`

快照构建方式：

- 基底：`/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/app`
- 叠加：主目录当前可读的 `app` 文件
- 排除：`node_modules`、`.next`、`.vercel`
- 叠加文件数：`146`

本地验证：

- `pnpm install --frozen-lockfile`：通过
- `pnpm exec tsc --noEmit --pretty false`：通过
- `pnpm lint`：通过
- `pnpm build`：通过

Vercel 执行结果：

- `vercel link --yes --project jingjing-content-platform-staging --team neveraloofwy-4960s-projects`：通过
- `vercel deploy --prod --yes --force`：通过
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/6inP9HL1XuAmDZMF3n2bezmkPy92`
- Production Deployment URL: `https://jingjing-content-platform-staging-2e5ut4575.vercel.app`
- 主域名已 alias 到最新 deployment：`https://jingjing-content-platform-staging.vercel.app`

Vercel smoke：

- `GET /`：返回 `307`，实际跳转到 `/dashboard`
- `GET /dashboard`：返回 `200`
- `GET /dashboard/article`：返回 `200`，HTML 中包含 `图文工作台`
- `GET /platform-admin/knowledge`：未登录时跳转到 `/platform-admin-login`，页面 bundle 中包含 `知识库管理`
- `GET /api/platform-admin/knowledge/documents`：返回 `401 UNAUTHORIZED`，说明路由已部署并受 `ADMIN_SETUP_SECRET` 保护
- `GET /api/consultation/sessions`：返回 `401 UNAUTHENTICATED`，说明路由已部署并要求商家登录

说明：

- Runbook 旧预期写的是 `/` 跳到 `/dashboard/import`。
- 当前实际部署代码的首页行为是 `/` 跳到 `/dashboard`，这与最新商家端主界面切到咨询页的代码一致。

## 3. 腾讯云轻量服务器 worker 部署结果

目标服务器：

- 实例名：`openstoryline-test-sg`
- IP：`43.160.208.189`
- SSH 用户：`ubuntu`
- 远端根目录：`/srv/jingjing-video-worker`

连接约束验证：

- 使用 SSH key：`~/.ssh/id_ed25519`
- 未使用：`/Users/wy/Documents/wy.pem`
- 未碰：`openclaw`
- 远端检查输出包含：`VM-0-4-ubuntu`、`/home/ubuntu`、`staging-worker-ok`

本轮使用的部署工作区：

- `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap`

部署命令：

- `./workers/video-worker/scripts/deploy.sh update`

执行结果：

- `openstoryline-engine` 已 rebuild / restart
- `video-worker` 已 rebuild / restart
- `openstoryline-engine` 状态：`Up ... (healthy)`
- `video-worker` 状态：`Up`
- worker 日志显示 poll loop 已启动，healthcheck 正常

## 4. Worker smoke 结果

第一次 smoke：

- Job ID: `32263f94-f269-4b2a-805b-7f92a1219a2c`
- 结果：失败
- 原因：复用了旧 COS input key，但该对象已不存在，COS 返回 `NoSuchResource`
- 结论：这是测试数据失效，不是本轮 worker 部署失败

第二次 smoke：

- 新上传 COS input object：`draft-inputs/6f6a3aca-6bbe-48cc-93b7-f3481307c3cc/2f8432db-16b1-4b1d-8c0b-bc1c715c4210/post-deploy-smoke-20260424.mp4`
- 输入对象大小：`69 bytes`
- Job ID: `d163e088-b0ae-4850-a476-4ce591a7124f`
- 结果：成功

Job 最终状态：

- `status = succeeded`
- `current_stage = completed`
- `progress_pct = 100`
- `uploaded_count = 3`
- `failure = null`

输出对象：

- cover：`video-covers/.../d163e088-b0ae-4850-a476-4ce591a7124f/cover.jpg`
- subtitle：`video-subtitles/.../d163e088-b0ae-4850-a476-4ce591a7124f/subtitles.srt`
- video：`video-outputs/.../d163e088-b0ae-4850-a476-4ce591a7124f/final.mp4`

worker 日志结论：

- 已认领 job `d163e088-b0ae-4850-a476-4ce591a7124f`
- 已从 COS 下载新输入对象
- `POST http://openstoryline-engine:8000/v1/runs` 返回 `200`
- 已上传 `final.mp4 / cover.jpg / subtitles.srt`
- 已完成 video job

## 5. 本轮未完成 / 剩余风险

- 主目录 `.git` 与部分文件仍可能是 iCloud dataless，后续如果要在主目录提交或精确读 commit，需要先确认 iCloud 已完整下载。
- 主目录 `workers/video-worker/scripts/deploy.sh` 当前不可用或缺失，本轮 worker 依赖 staging worker bootstrap worktree 完成部署。
- 本轮没有创建新的 git commit，也没有 push / merge。
- 本轮没有做真实登录后的平台管理台浏览器端完整表单 smoke，只做了路由级与后端鉴权 smoke。
- 旧失败 smoke job `32263f94-f269-4b2a-805b-7f92a1219a2c` 仍会作为失败记录留在 staging 数据库中，如需干净演示可后续单独清理或标注。

## 当前结论

截至 `2026-04-24`，staging 三层环境已经完成本轮部署：

- Supabase schema 已补齐咨询 / 知识库基础表与平台配置。
- Vercel 主域名已部署到最新快照代码。
- 腾讯云轻量服务器 worker 已更新并通过新 smoke job 验证。
