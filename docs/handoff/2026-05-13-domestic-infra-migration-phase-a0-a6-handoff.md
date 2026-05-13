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
- 新增 app 侧环境自检脚本：`app/scripts/check-domestic-app-env.mjs`。
- 新增 `/api/health`，用于国内服务器 IP 阶段检查 app / PostgreSQL / COS 配置。
- 新增最小 seed 示例：`app/db/seeds/domestic_minimal_seed.example.sql`。
- 新增视频链路 fixture seed：`app/db/seeds/domestic_video_chain_fixture.example.sql`。
- progress 已写入：`docs/progress/2026-05-13-domestic-migration-phase-a0-a6-progress.md`
- completion audit 已写入：`docs/progress/2026-05-13-domestic-migration-completion-audit.md`
- phase1 e2e pending 模板已写入：`docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md`

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

追加验证：

- 已安装 Homebrew `postgresql@17 17.9`，没有启动常驻服务。
- 已在 `/private/tmp` 临时 PostgreSQL 17 空库执行 `app/db/migrations/202605130001_domestic_core_baseline.sql`，通过。
- 已运行 `node app/scripts/check-domestic-app-env.mjs` 缺环境失败路径，退出码 `1`，只输出缺失 key 名。
- 已运行 `APP_DATABASE_URL=... COS_*=dummy node app/scripts/check-domestic-app-env.mjs` 成功路径，确认 DB 可连且核心表齐全。
- 已执行 `app/db/seeds/domestic_minimal_seed.example.sql`，首次和重复执行均通过。
- 已执行 `app/db/seeds/domestic_video_chain_fixture.example.sql`，创建 source item / draft / approved video script variant，并输出 draft COS key prefix。
- 已用 `next start` + 临时 PostgreSQL + 假 COS 配置请求 `/api/health`，返回 `200 OK`。
- 已用 seed 账号请求 `/api/auth/merchant-login`，返回 `303`，写入 `jingjing_session`，并在 `user_sessions` 中新增 session。
- 已用 fixture draft 调用 `/api/media/complete`，返回 `201`，写入 Tencent COS asset metadata。
- 已用 fixture video script 调用 `/api/video-edit-jobs`，返回 `201`，创建 `pending` job。
- 新建 job 的 `inputPayload.render_mode=asset_driven`，且 `input_assets[0]` 指向刚写入的 asset metadata。
- 已用 `GET /api/video-edit-jobs?status=pending&limit=5` 查回 pending job。
- 已检查 `app/.env*`、`workers/video-worker/.env*` 和当前进程环境，未发现真实国内 PostgreSQL / COS / worker key。

未验证：

- 国内服务器 IP、国内 PostgreSQL、国内 COS、手机浏览器完整链路都未跑。
- 浏览器直传真实国内 COS、worker 真实生成 final.mp4、重新签名下载还未跑。
- Docker daemon 仍未启动，本轮没有用 Docker 验证。

## 当前阻塞

完整 Completion Gate 还缺真实国内资源：

- 国内 PostgreSQL 连接串
- 国内 COS bucket / region / secret
- 可运行 app 和 worker 的国内服务器或等价环境
- 用于手机端 IP 访问的目标地址

在这些资源到位前，本分支只能验证到本地临时 PostgreSQL + 假 COS 配置下的 API smoke，不能声称 `final.mp4` 已生成、上传和重新签名下载。

## 下一步建议

1. 准备可用 PostgreSQL，执行：

   ```bash
   psql "$DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
   ```

2. 插入最小测试数据：

   ```bash
   HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
   psql "$DATABASE_URL" \
     -v user_email='owner@example.com' \
     -v password_hash="$HASH" \
     -v display_name='Domestic Test Owner' \
     -v merchant_name='Domestic Test Merchant' \
     -f app/db/seeds/domestic_minimal_seed.example.sql
   ```

3. 可选：创建 API smoke fixture：

   ```bash
   psql "$DATABASE_URL" \
     -v user_email='owner@example.com' \
     -f app/db/seeds/domestic_video_chain_fixture.example.sql
   ```

4. 配置 app env：
   - `DATABASE_PROVIDER=postgres`
   - `APP_DATABASE_URL` 或 `DATABASE_URL`
   - `APP_SESSION_COOKIE`
   - `COS_SECRET_ID`
   - `COS_SECRET_KEY`
   - `COS_BUCKET`
   - `COS_REGION`

5. 验证 app：
   - `node app/scripts/check-domestic-app-env.mjs --env-file app/.env.production`
   - `/api/health`
   - 登录
   - 创建 source item / content draft / video script
   - 上传素材 intent
   - `/api/media/complete` 写入 `asset_objects`
   - `/api/video-edit-jobs` 写入 `pending`

6. 配置 worker：
   - `WORKER_DATABASE_URL`
   - 国内 COS env
   - `WORKER_MAX_CONCURRENCY=1`

7. 启动 worker，验证：
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
