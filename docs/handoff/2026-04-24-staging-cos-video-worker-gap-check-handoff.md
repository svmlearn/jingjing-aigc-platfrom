# 2026-04-24 staging COS / Video Worker Gap Check Handoff

## 当前目标

基于 `2026-04-24-staging-cos-video-worker-zero-memory-handoff.md` 继续复核：

1. 现在到底是不是还缺“轻量服务器方案”
2. 当前真正未完成的是哪几层
3. 下一步应该先做什么

## 本轮已完成

### 1. 已确认本地部署物料齐全

已复核 `workers/video-worker/`，确认以下文件已在仓库：

- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/.env.example`
- `workers/video-worker/openstoryline/**`
- `workers/video-worker/worker/**`
- `workers/video-worker/README.md`

结论：

- 当前不是缺“轻量服务器方案”
- 当前缺的是外部环境落地

### 2. 已确认 Supabase migration 最短路径

已确认：

- migration 文件已存在：
  - `app/supabase/migrations/202604230001_v01_staging_cos_video_schema.sql`
- 当前机器没有 `supabase` CLI
- 当前机器也没有 `psql`
- 仓库里没有 `app/supabase/config.toml`

结论：

- 最快路径是 `Supabase Dashboard -> SQL Editor`
- 这轮不建议默认走 `supabase db push`

### 3. 已修正文档中的旧桶名误导

已把 staging 真实桶名对齐到以下文件：

- `workers/video-worker/.env.example`
- `workers/video-worker/README.md`
- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`

当前统一以这个真实桶名为准：

- `jj-content-staging-1341668543`

### 4. 已补执行记录

新增：

- `docs/progress/2026-04-24-staging-cos-video-worker-gap-check.md`

## 当前未完成

真正还没完成的是：

1. 在 staging Supabase 执行视频链路 migration
2. SSH 到轻量服务器并把 `workers/video-worker/` 部署上去
3. 填 worker `.env`
4. 启动 compose
5. 跑 smoke checklist

## 下一步建议

建议严格按这个顺序继续：

1. 打开 Supabase SQL Editor，执行 `202604230001_v01_staging_cos_video_schema.sql`
2. 拿到轻量服务器公网 IP / SSH 入口
3. 同步 `workers/video-worker/` 到 `/srv/jingjing-video-worker`
4. 在服务器填 `.env`
5. 执行 `docker compose up -d --build`
6. 按 `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md` 联调

## 外部阻塞项

下一位继续前，需要准备好这些真实输入：

- 轻量服务器公网 IP 或 SSH Host
- 服务器登录方式
- staging Supabase 的 Postgres 连接串
- `staging-cos-video-worker` 子账号的 `SecretId / SecretKey`
- `OPENAI_API_KEY` 或当前实际使用的视频 provider key

## 改动文件

- `workers/video-worker/.env.example`
- `workers/video-worker/README.md`
- `docs/progress/2026-04-23-staging-cos-video-worker-manual-setup.md`
- `docs/test/2026-04-23-staging-cos-video-worker-smoke-checklist.md`
- `docs/progress/2026-04-24-staging-cos-video-worker-gap-check.md`
- `docs/handoff/2026-04-24-staging-cos-video-worker-gap-check-handoff.md`

## 工作区状态

- 当前分支：`main`
- 本轮未创建 commit
- 本轮未 push
- 本轮未 merge

补充：

- 工作区里还存在与本轮无关的已有脏改动：
  - `app/src/contracts/knowledge.ts`
  - `app/src/server/api/cos.ts`
- 工作区里还存在未跟踪文件：
  - `docs/handoff/2026-04-24-staging-cos-video-worker-zero-memory-handoff.md`
- 本轮没有处理这些文件的内容
