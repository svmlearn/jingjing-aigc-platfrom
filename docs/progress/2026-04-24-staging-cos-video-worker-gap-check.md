# 2026-04-24 staging COS / Video Worker 缺口复核

## 2026-04-25 状态校正

本文件记录的是 `2026-04-24` 当时的缺口复核，下面“migration 未执行 / worker 未部署 / smoke 未跑”的判断已经被后续执行记录覆盖。

截至 `2026-04-25` 复核，当前最新状态为：

- `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql` 已在 staging Supabase 执行。
- `public.video_edit_jobs` 已存在，`idx_video_edit_jobs_status_created_at` 已存在。
- 轻量服务器 worker 已部署到 `openstoryline-test-sg`，并完成一次真实 COS 输入到输出的 smoke。
- 成功 smoke job：`d163e088-b0ae-4850-a476-4ce591a7124f`。

最新事实来源：

- `/Users/wy/.codex/worktrees/staging-video-worker-bootstrap/docs/progress/2026-04-24-staging-video-worker-server-bootstrap-and-smoke.md`
- `docs/progress/2026-04-24-staging-full-deploy-current-target.md`
- `docs/progress/2026-04-25-supabase-migration-current-state.md`

## 背景

本记录基于以下上下文继续复核当前 staging 视频链路的真实缺口：

- `docs/handoff/2026-04-24-staging-cos-video-worker-zero-memory-handoff.md`
- `docs/架构规范/2026-04-23-当前阶段技术决策-媒体存储与视频执行架构.md`
- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

目标不是重新讨论“要不要买轻量服务器”，而是确认：

1. 本地代码和部署物料是否已经齐全
2. 当前真正还差的是哪一层
3. 下一步应该先做 migration、服务器部署，还是别的补丁

## 本次已确认

### 1. 本地 worker 部署物料已齐

仓库内已经具备轻量服务器部署所需的基础物料：

- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/.env.example`
- `workers/video-worker/openstoryline/**`
- `workers/video-worker/worker/**`
- `workers/video-worker/README.md`

结论：

- 当前不是“还缺一套轻量服务器方案”
- 当前也不是“worker 目录还没准备好”
- 如果现在继续推进，重点应放在外部环境落地，而不是再补 worker 骨架

### 2. Supabase migration 当时仍然没有被执行

以下是 `2026-04-24` 当时的本地复核结果；最新状态见本文顶部“2026-04-25 状态校正”。

- migration 文件已存在：
  - `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`
- 当前机器没有 `supabase` CLI
- 当前机器也没有 `psql`
- 仓库里没有 `app/supabase/config.toml`

结论：

- 这轮最快路径仍然是 `Supabase Dashboard -> SQL Editor`
- 不应默认走本地 `supabase db push`

### 3. 服务器部署的主要缺口是“外部输入”，不是代码

要真正把 `workers/video-worker` 起在轻量服务器上，还缺这些真实输入：

- 轻量服务器公网 IP 或可用 SSH 入口
- 服务器登录方式
- staging Supabase 的真实 Postgres 连接串，用于 `SUPABASE_DB_URL`
- `staging-cos-video-worker` 子账号的 `SecretId / SecretKey`
- `OPENAI_API_KEY` 或当前实际使用的视频 provider key

这些值目前都不在仓库里，也不应落仓库。

## 本次补齐的仓库留痕

为了避免后续继续操作时再次误填旧桶名，本次已对齐以下文件中的 staging 真实桶名：

- `workers/video-worker/.env.example`
- `workers/video-worker/README.md`
- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

当前统一以这个真实桶名为准：

- `jj-content-staging-1341668543`

## 当时建议顺序

按 `2026-04-24` 当时的阻塞关系看，最稳的下一步顺序是：

1. 先在 Supabase SQL Editor 执行 `202604230001_v01_staging_cos_video_schema.sql`
2. 再 SSH 到轻量服务器，创建 `/srv/jingjing-video-worker`
3. 把 `workers/video-worker/` 同步到服务器
4. 在服务器写 `.env`
5. 执行 `docker compose up -d --build`
6. 按 smoke checklist 联调

## 当时结论

`2026-04-24` 当时缺的不是“还要不要配置轻量服务器”这个决策，而是：

1. 跑掉 staging migration
2. 拿到服务器 SSH 入口并把 worker 真正部署上去
3. 拿到 worker `.env` 所需的真实连接串和密钥
4. 跑完整条 smoke test

换句话说，方向已经定了，剩下的是外部环境落地。
