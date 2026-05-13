# 2026-05-13 domestic infra migration phase A0-A6 handoff

## 当前目标

在不影响 `main` 的前提下，开独立分支 / worktree，开始国内化代码改造：把当前视频主链路从 `Supabase + Vercel + 新加坡服务器/COS` 逐步改造成可在国内服务器验证的 `普通 PostgreSQL + 自有 Node API + 国内 COS + video-worker` 链路。

## 分支 / worktree

- Branch：`codex/domestic-infra-migration`
- Worktree：`/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Base：`main` at `21f74ec`
- Main：未 merge，未直接改代码

## 已完成内容

- 新增普通 PostgreSQL helper：`app/src/lib/server-db/postgres.ts`
- 新增普通 PostgreSQL baseline：`app/db/migrations/202605130001_domestic_core_baseline.sql`
- 新增 baseline 说明：`app/db/README.md`
- 新增最小自有 session：`app/src/lib/auth/domestic-session.ts`
- 新增测试密码 hash 脚本：`app/scripts/create-domestic-password-hash.mjs`
- 新增视频主链路 PG repository：`app/src/lib/db/postgres-video-chain-repository.ts`
- 接入 PG 分支：
  - `merchant-repository.ts`
  - `media-repository.ts`
  - `content-draft-repository.ts`
  - `video-edit-job-repository.ts`
- 登录 / 登出 / 当前用户 / dashboard 入口支持 domestic session。
- worker 优先使用 `WORKER_DATABASE_URL`，保留 `SUPABASE_DB_URL` fallback。
- worker 增加 `worker_id`、heartbeat、timeout、failure_code 和阶段耗时日志。
- `retry` 已支持 `failed_retryable` / `failed_manual` 失败后人工确认重跑；PG 分支记录 `manual_rerun_requested_at`。
- `.env.example` 已补国内 PostgreSQL、session、国内 COS 示例。
- progress 已写入：`docs/progress/2026-05-13-domestic-migration-phase-a0-a6-progress.md`

## 验证结果

通过：

```bash
cd app && pnpm exec tsc --noEmit --pretty false
cd app && pnpm lint
cd app && pnpm build
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
git diff --check
node app/scripts/create-domestic-password-hash.mjs test-password | wc -c
```

未验证：

- `domestic_core_baseline.sql` 未在真实 PostgreSQL 空库执行。
- 原因：本机没有 `psql`，Docker daemon 未启动。
- 国内服务器 IP、国内 PostgreSQL、国内 COS、手机浏览器完整链路都未跑。

## 下一步建议

1. 准备可用 PostgreSQL，执行：

   ```bash
   psql "$DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
   ```

2. 插入最小测试数据：
   - 1 个 `app_users`
   - 1 个 `merchant_profiles`
   - 1 条 owner `merchant_team_members`

3. 配置 app env：
   - `DATABASE_PROVIDER=postgres`
   - `APP_DATABASE_URL` 或 `DATABASE_URL`
   - `APP_SESSION_COOKIE`
   - `COS_SECRET_ID`
   - `COS_SECRET_KEY`
   - `COS_BUCKET`
   - `COS_REGION`

4. 验证 app：
   - 登录
   - 创建 source item / content draft / video script
   - 上传素材 intent
   - `/api/media/complete` 写入 `asset_objects`
   - `/api/video-edit-jobs` 写入 `pending`

5. 配置 worker：
   - `WORKER_DATABASE_URL`
   - 国内 COS env
   - `WORKER_MAX_CONCURRENCY=1`

6. 启动 worker，验证：
   - claim pending job
   - heartbeat 更新
   - timeout 可扫 stale job
   - final.mp4 上传国内 COS
   - `asset_objects` 和 `video_edit_jobs.result_payload` 回写

## push / merge

- 未 push
- 未 merge main
- 未切 `ba-ba-ke.com`
- 未做备案动作
- 未动真实生产
