# 2026-05-13 domestic migration phase A0-A6 progress

## 1. 状态

- 分支：`codex/domestic-infra-migration`
- worktree：`../jingjing-domestic-infra-migration`
- main：未在主工作区做代码改造
- 生产 / 域名 / 备案：未触碰
- Dify results：未触碰

本阶段完成的是国内化代码底座，不是国内服务器真实验收。

## 2. 已完成内容

### A0 worktree

- 已从 `main` 创建独立 worktree。
- 主目录仍保留 Dify 相关未跟踪文件，本分支未继承也未修改。

### A1 普通 PostgreSQL 访问层

- 新增 `app/src/lib/server-db/postgres.ts`。
- 支持 `APP_DATABASE_URL`、`DATABASE_URL`，兼容旧 `LOCAL_REAL_CHAIN_DB_URL`。
- 支持 `APP_DATABASE_SSL` / `DATABASE_SSL`、连接池上限和 transaction helper。

### A2 普通 PostgreSQL baseline

- 新增 `app/db/migrations/202605130001_domestic_core_baseline.sql`。
- 从 Supabase migration 中迁出第一阶段核心表：
  - `app_users`
  - `user_sessions`
  - `merchant_profiles`
  - `merchant_team_members`
  - `merchant_team_invitation_codes`
  - `source_items`
  - `content_drafts`
  - `content_variants`
  - `asset_objects`
  - `video_edit_jobs`
  - `merchant_memberships`
  - `daily_content_tasks`
- 已去掉 Supabase-only 内容：
  - `auth.users`
  - RLS policies
  - `service_role` grants
  - Supabase Auth 密码假设
- `video_edit_jobs` 增加 worker 可靠性字段：
  - `worker_id`
  - `claimed_at`
  - `heartbeat_at`
  - `timeout_at`
  - `failure_code`
  - `manual_rerun_requested_at`
  - `manual_rerun_requested_by_user_id`

### A3 视频主链路 repository PG 分支

优先接入了以下 repository 的 PostgreSQL 分支，Supabase 分支保留：

- `merchant-repository.ts`
- `media-repository.ts`
- `content-draft-repository.ts`
- `video-edit-job-repository.ts`

新增统一实现：

- `app/src/lib/db/postgres-video-chain-repository.ts`

覆盖第一阶段主链路：

- 商家资料读取和更新
- owner / member workspace 解析
- 成员邀请码接受
- manual source item
- content draft / variant 创建、查询、确认、修订
- media owner 校验
- `asset_objects` 创建和查询
- `video_edit_jobs` 创建、查询、retry、cancel

### A4 最小 Auth / Session

- 新增 `app/src/lib/auth/domestic-session.ts`。
- 使用 `app_users + user_sessions + HTTP-only cookie`。
- 验证期密码 hash 使用 `pbkdf2_sha256`，不迁 Supabase Auth 密码。
- 登录入口已接入：
  - `app/src/app/api/auth/merchant-login/route.ts`
  - `app/src/app/(auth)/login/actions.ts`
- 登出入口已接入：
  - `app/src/app/(auth)/logout/route.ts`
- 当前用户读取已接入：
  - `app/src/lib/auth/current-user.ts`
- dashboard 入口已支持 domestic session：
  - `app/src/app/dashboard/layout.tsx`
- 新增 hash 生成脚本：
  - `app/scripts/create-domestic-password-hash.mjs`

### A5 国内 COS 配置准备

- `app/.env.example` 增加国内 PostgreSQL / session 环境变量。
- `COS_REGION` 示例从 `ap-singapore` 调整为 `ap-guangzhou`。
- 继续保持长期只保存 `bucket_name + storage_key`，下载时由后端重新签名。

### A6 worker DB / COS / 可靠性改造

- worker 优先使用 `WORKER_DATABASE_URL`。
- `SUPABASE_DB_URL` 仅作为兼容 fallback。
- worker 仍强制 `WORKER_MAX_CONCURRENCY=1`，没有写成 2-3 并发。
- worker claim / update / fail / success 已写入：
  - `worker_id`
  - `claimed_at`
  - `heartbeat_at`
  - `timeout_at`
  - `failure_code`
- worker log_payload 增加：
  - `worker.id`
  - `timings_ms`
  - 各阶段耗时
- `real_io_smoke.py` 已改为优先检查 `WORKER_DATABASE_URL`。
- `workers/video-worker/.env.example` 已改为国内 PostgreSQL / 国内 COS 示例。

## 3. 验证结果

已通过：

```bash
cd app && pnpm exec tsc --noEmit --pretty false
cd app && pnpm lint
cd app && pnpm build
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
git diff --check
node app/scripts/create-domestic-password-hash.mjs test-password | wc -c
```

结果：

- TypeScript：通过
- ESLint：通过
- Next build：通过
- worker Python tests：`47 tests OK`
- worker compileall：通过
- diff whitespace：通过
- password hash script：可输出 hash

未跑通：

```bash
psql "$DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
```

原因：

- 本机没有 `psql`。
- Docker CLI 存在，但 Docker daemon 未启动，无法临时拉起 PostgreSQL 容器验证空库执行。

## 4. 剩余风险

- `domestic_core_baseline.sql` 还没有在真实 PostgreSQL 空库执行过。
- 没有国内服务器、国内 PostgreSQL、国内 COS 密钥，无法做 IP 链路验收。
- 没有真实手机浏览器验证。
- 还未验证浏览器直传国内 COS。
- 还未验证 worker 从国内库 claim 后真实生成并上传 final.mp4。
- 平台管理端、知识库、agent console 仍保留大量 Supabase Admin SDK 路径，不属于本阶段主链路迁移范围。
- `register-with-invite` 仍主要是 Supabase Auth 路径；国内验证期建议先手工插入测试 `app_users`。

## 5. 下一步

1. 在可用 PostgreSQL 环境执行 baseline SQL。
2. 插入 1 个 `app_users`、1 个 `merchant_profiles`、1 条 owner `merchant_team_members`。
3. 配置 `APP_DATABASE_URL` / `DATABASE_PROVIDER=postgres` / 国内 COS env。
4. 本地或国内服务器启动 app，验证登录、素材上传 intent、asset 写入、video job 创建。
5. 配置 `WORKER_DATABASE_URL` 和国内 COS，启动 worker，验证单并发 claim。
6. 有国内资源后再跑手机端完整链路。
