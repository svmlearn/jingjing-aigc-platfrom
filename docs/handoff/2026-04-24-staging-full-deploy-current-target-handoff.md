# 2026-04-24 Staging Full Deploy Current Target Handoff

## 1. 当前目标

按 `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/docs/handoff/2026-04-24-staging-full-deploy-runbook-for-next-ai.md`，把当前目标代码部署到 staging：

1. Supabase
2. Vercel
3. 腾讯云轻量服务器 worker
4. 最小 smoke 验证

本轮用户明确约束：

- 不碰 `openclaw`
- 不使用 `/Users/wy/Documents/wy.pem`
- 部署完成后补新的 `progress / handoff`

## 2. 当前分支 / worktree / commit

主工作区：

- `/Users/wy/Desktop/静境/静境4.0/小红书抖音矩阵获客平台`

辅助部署工作区：

- `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap`

commit 状态：

- 本轮没有创建新的 commit。
- 本轮没有 push / merge。
- 主工作区 Git 元信息受 iCloud dataless 影响，执行 `git status / git rev-parse` 会阻塞，因此本轮没有强行读取新的 HEAD。
- 部署来源为“主目录当前可读 app 文件”生成的快照，以及 staging worker bootstrap worktree 中完整的 worker 部署脚本。

## 3. 已完成内容

### Supabase

已在 staging Supabase project `jrveaabguddromjtibbs` 执行：

- `app/supabase/migrations/202604240001_v01_cloud_demo_consultation_foundation.sql`

已验证存在：

- `consultation_sessions`
- `consultation_messages`
- `consultation_events`
- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`
- `platform_settings` 中的 `consultation_agent / consultation`
- `platform_settings` 中的 `knowledge_runtime / knowledge`

说明：

- worker 的 `video_worker` DB role 不能执行此 migration，报错为 `must be owner of table platform_settings`，这是合理的最小权限结果。
- 最终通过 Supabase Management API 执行成功。
- 没有输出或保存 Supabase token。

### Vercel

已部署 staging 项目：

- Project: `jingjing-content-platform-staging`
- 主域名：`https://jingjing-content-platform-staging.vercel.app`
- Production Deployment URL: `https://jingjing-content-platform-staging-2e5ut4575.vercel.app`
- Inspect URL: `https://vercel.com/neveraloofwy-4960s-projects/jingjing-content-platform-staging/6inP9HL1XuAmDZMF3n2bezmkPy92`

部署前本地验证均通过：

- `pnpm install --frozen-lockfile`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm lint`
- `pnpm build`

已验证：

- `/` 实际跳转到 `/dashboard`
- `/dashboard` 返回 `200`
- `/dashboard/article` 返回 `200`
- `/api/platform-admin/knowledge/documents` 返回 `401 UNAUTHORIZED`，路由存在且受保护
- `/api/consultation/sessions` 返回 `401 UNAUTHENTICATED`，路由存在且要求登录

注意：

- Runbook 旧预期为 `/` 跳到 `/dashboard/import`。
- 最新部署结果为 `/` 跳到 `/dashboard`，这符合当前商家端主界面改造后的代码行为。

### Worker

已更新腾讯云轻量服务器 worker：

- 实例：`openstoryline-test-sg`
- IP：`43.160.208.189`
- 用户：`ubuntu`
- 远端目录：`/srv/jingjing-video-worker`

执行命令：

- 在 `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap` 运行 `./workers/video-worker/scripts/deploy.sh update`

连接与权限：

- 使用 `~/.ssh/id_ed25519`
- 没有使用 `/Users/wy/Documents/wy.pem`
- 没有进入或修改 `openclaw`

部署后状态：

- `openstoryline-engine` 为 `Up ... (healthy)`
- `video-worker` 为 `Up`
- worker poll loop 已启动

## 4. Smoke 结果

失败的一次 smoke：

- Job ID: `32263f94-f269-4b2a-805b-7f92a1219a2c`
- 原因：测试复用了旧 COS input key，该对象已不存在，COS 返回 `NoSuchResource`

成功的一次 smoke：

- Job ID: `d163e088-b0ae-4850-a476-4ce591a7124f`
- 输入 COS object：`draft-inputs/6f6a3aca-6bbe-48cc-93b7-f3481307c3cc/2f8432db-16b1-4b1d-8c0b-bc1c715c4210/post-deploy-smoke-20260424.mp4`
- `status = succeeded`
- `current_stage = completed`
- `progress_pct = 100`
- `uploaded_count = 3`

成功输出：

- `video-outputs/.../d163e088-b0ae-4850-a476-4ce591a7124f/final.mp4`
- `video-covers/.../d163e088-b0ae-4850-a476-4ce591a7124f/cover.jpg`
- `video-subtitles/.../d163e088-b0ae-4850-a476-4ce591a7124f/subtitles.srt`

## 5. 本轮改动文件

新增文档：

- `docs/progress/2026-04-24-staging-full-deploy-current-target.md`
- `docs/handoff/2026-04-24-staging-full-deploy-current-target-handoff.md`

部署快照：

- `/tmp/jingjing-staging-deploy-20260424-135650`

## 6. 下一步建议

如果继续验收 staging：

1. 用真实商家账号登录 staging，走一遍咨询、图文、视频页面。
2. 用平台管理员登录 staging，检查 `platform-admin/settings` 与 `platform-admin/knowledge` 是否能真实保存。
3. 如果要演示 worker，优先使用成功 job `d163e088-b0ae-4850-a476-4ce591a7124f` 的输出链路。
4. 如果要清理演示数据，再单独处理失败 job `32263f94-f269-4b2a-805b-7f92a1219a2c`。
5. 如果要提交本轮部署记录，先确认主目录 iCloud 文件已经完整下载，再执行 git 检查与提交。

## 7. 当前结论

staging 的三层部署已经完成，并通过最小验证：

- Supabase migration 已生效。
- Vercel 主域名已指向最新 production deployment。
- 轻量服务器 worker 已更新并通过真实 COS 输入到输出的 smoke job。
