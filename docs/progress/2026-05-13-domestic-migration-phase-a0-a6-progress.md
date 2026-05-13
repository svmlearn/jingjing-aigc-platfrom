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
- `import-repository.ts` 的 source item 读取侧：
  - `listSourceItems`
  - `getSourceItemById`
  - `listImportedComments`

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
- `workers/video-worker/docker-compose.yml` 已显式传入 `WORKER_DATABASE_URL`、`WORKER_COS_*`、`WORKER_COS_RESULT_PREFIX`，同时保留 `SUPABASE_DB_URL` / shared `COS_*` fallback。
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
- `retry` 语义已调整为失败后人工确认重跑：`failed_retryable` 和 `failed_manual` 均可重新置为 `pending`；PG 分支会写入 `manual_rerun_requested_at` / `manual_rerun_requested_by_user_id`。
- `real_io_smoke.py` 已改为优先检查 `WORKER_DATABASE_URL`。
- `real_io_smoke.py` 已补齐 worker COS env 优先级：`WORKER_COS_SECRET_ID` / `WORKER_COS_SECRET_KEY` / `WORKER_COS_BUCKET` / `WORKER_COS_REGION` 优先，shared `COS_*` 保留 fallback。
- `workers/video-worker/.env.example` 已改为国内 PostgreSQL / 国内 COS 示例。

### A7 上机验证辅助

- 新增 app 侧环境自检脚本：`app/scripts/check-domestic-app-env.mjs`。
  - 可读取当前环境或 `--env-file <path>`。
  - 只输出 key 是否存在、DB 是否可连、核心表是否齐，不打印密钥值。
  - 检查核心表：`app_users`、`user_sessions`、`merchant_profiles`、`merchant_team_members`、`source_items`、`content_drafts`、`content_variants`、`asset_objects`、`video_edit_jobs`。
- 新增 app 侧 COS roundtrip 脚本：`app/scripts/check-domestic-cos-roundtrip.mjs`。
  - 可读取当前环境或 `--env-file <path>`。
  - 真实 COS 资源到位后执行 put object -> signed GET -> delete object。
  - 输出 bucket / region / key / bytes / match 结果，不输出密钥或签名 URL。
- 新增 app 侧视频主链路 API smoke 脚本：`app/scripts/check-domestic-video-chain-api-smoke.mjs`。
  - 可读取当前环境或 `--env-file <path>`。
  - 使用测试账号登录后调用 test draft、media complete、video job create。
  - 只输出状态、ID、`renderMode` 和 `inputAssetCount`，不输出密码或 cookie。
  - 明确不替代真实 COS 字节上传、worker 生成、`final.mp4` 和手机浏览器 e2e。
- 新增健康检查接口：`app/src/app/api/health/route.ts`。
  - app 进程状态：固定返回 `nodejs`。
  - PostgreSQL：要求配置 `APP_DATABASE_URL` / `DATABASE_URL`，并执行 `select 1`。
  - COS：复用现有 `getCosConfig()` 校验 `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION`。
- 新增最小 seed 示例：`app/db/seeds/domestic_minimal_seed.example.sql`。
  - 可插入或复用 1 个 `app_users`。
  - 可插入或复用 1 个 `merchant_profiles`。
  - 可插入或复用 1 条 owner `merchant_team_members`。
- 新增视频链路 fixture seed：`app/db/seeds/domestic_video_chain_fixture.example.sql`。
  - 在最小 owner 账号下创建 `source_items`、`content_drafts` 和已确认 `content_variants.video_script`。
  - 输出 `draft_storage_key_prefix`，便于后续调用 `/api/media/complete`。
- `app/db/README.md` 已补充 migration + seed 命令。
- 新增真实资源验证 runbook：`docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md`。

### A8 视频工作台测试草稿入口

- 补齐前端已调用但后端缺失的 `POST /api/content/video-scripts/test-draft`。
- 新增 `createVideoChainTestDraftForUser`，复用现有 `createManualSourceItem` / `createDraftWithVariants`，因此在 PostgreSQL 模式下会真实写入：
  - `source_items`
  - `content_drafts`
  - `content_variants`
- route 继续受 `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED` 控制：
  - 非 production 默认可用
  - production / 国内 IP 验证环境需要显式设置 `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1`
- API 响应会把测试 fixture 的三段 `productionScenes` 挂回 selected variant，手机页面可直接显示三段素材上传槽位；数据库 schema 仍保持当前 baseline，不新增结构化 scenes 字段。

## 3. 验证结果

已通过：

```bash
cd app && pnpm exec tsc --noEmit --pretty false
cd app && pnpm lint
cd app && pnpm build
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline /private/tmp/jj-domestic-worker-venv/bin/python -m unittest discover -s workers/video-worker/tests
python3 -m compileall workers/video-worker/openstoryline/app workers/video-worker/worker/app
docker compose -f workers/video-worker/docker-compose.yml config --quiet
docker compose -f workers/video-worker/docker-compose.yml -f workers/video-worker/docker-compose.firered.yml --profile firered config --quiet
git diff --check
node app/scripts/create-domestic-password-hash.mjs test-password | wc -c
node app/scripts/check-domestic-app-env.mjs
node app/scripts/check-domestic-cos-roundtrip.mjs
node --check app/scripts/check-domestic-video-chain-api-smoke.mjs
node app/scripts/check-domestic-video-chain-api-smoke.mjs
/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55432 -d postgres -v ON_ERROR_STOP=1 -f app/db/migrations/202605130001_domestic_core_baseline.sql
APP_DATABASE_URL=postgres://wy@127.0.0.1:55432/postgres DATABASE_PROVIDER=postgres COS_SECRET_ID=dummy COS_SECRET_KEY=dummy COS_BUCKET=jj-healthcheck-1250000000 COS_REGION=ap-guangzhou node app/scripts/check-domestic-app-env.mjs
HASH="$(node app/scripts/create-domestic-password-hash.mjs test-password)"; /opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 55432 -d postgres -v ON_ERROR_STOP=1 -v user_email='owner@example.com' -v password_hash="$HASH" -v display_name='Domestic Test Owner' -v merchant_name='Domestic Test Merchant' -f app/db/seeds/domestic_minimal_seed.example.sql
/opt/homebrew/opt/postgresql@17/bin/psql -q -At -F '|' -h 127.0.0.1 -p 55432 -d postgres -v ON_ERROR_STOP=1 -v user_email='owner@example.com' -f app/db/seeds/domestic_video_chain_fixture.example.sql
curl -sS -i http://127.0.0.1:3107/api/health
curl -sS -i -X POST http://127.0.0.1:3107/api/auth/merchant-login -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode 'email=owner@example.com' --data-urlencode 'password=test-password' --data-urlencode 'next=/dashboard'
curl -sS -i -b /private/tmp/jj-domestic-cookie.txt http://127.0.0.1:3107/api/media/complete -H 'Content-Type: application/json' --data '<fixture content_draft COS payload>'
curl -sS -i -b /private/tmp/jj-domestic-cookie.txt http://127.0.0.1:3107/api/video-edit-jobs -H 'Content-Type: application/json' --data '<fixture content_variant payload>'
curl -sS -i -b /private/tmp/jj-domestic-cookie.txt 'http://127.0.0.1:3107/api/video-edit-jobs?status=pending&limit=5'
curl -sS -i -b /private/tmp/jj-domestic-source-cookie.txt 'http://127.0.0.1:3107/api/source-items?platform=douyin&limit=5'
curl -sS -i -b /private/tmp/jj-domestic-source-cookie.txt 'http://127.0.0.1:3107/api/source-items/<sourceItemId>'
curl -sS -i -b /private/tmp/jj-domestic-source-cookie.txt 'http://127.0.0.1:3107/api/source-items/<sourceItemId>/comments?limit=5'
curl -sS -b /private/tmp/jj-testdraft-cookie.txt -X POST 'http://127.0.0.1:3112/api/content/video-scripts/test-draft'
```

结果：

- TypeScript：通过
- ESLint：通过
- Next build：通过
- worker Python tests：`48 tests OK`
- worker compileall：通过
- worker compose config：通过。校验时临时复制 `workers/video-worker/.env.example` 为 `.env`，校验后已删除。
- diff whitespace：通过
- password hash script：可输出 hash
- app env check 缺环境失败路径：通过，退出码 `1`，只输出缺失 key 名
- app env check 临时 PostgreSQL + 假 COS 配置成功路径：通过，退出码 `0`
- app COS roundtrip 缺环境失败路径：通过，退出码 `2`，只输出缺失 key 名
- video chain API smoke 脚本语法检查：通过
- video chain API smoke 缺参数失败路径：通过，退出码 `2`，只输出缺失参数名
- video chain API smoke 临时 PostgreSQL + `next start` 成功路径：通过，退出码 `0`，返回 `status=ok`、`jobStatus=pending`、`renderMode=asset_driven`、`inputAssetCount=1`
- PostgreSQL 17 临时空库执行 baseline：通过
- 最小 seed 示例首次执行和重复执行：通过
- 视频链路 fixture seed：通过
- `/api/health` 在 `next start` + 临时 PostgreSQL + 假 COS 配置下返回 `200 OK`
- `/api/auth/merchant-login` 使用 seed 账号返回 `303`，写入 `jingjing_session`，并在 `user_sessions` 中新增 session
- `/api/media/complete` 使用 fixture `content_draft` 返回 `201`，写入 `asset_objects`
- `/api/video-edit-jobs` 使用 fixture `content_variant` 返回 `201`，写入 `video_edit_jobs.pending`
- 新建 job 的 `inputPayload.render_mode=asset_driven`，且 `input_assets[0]` 指向刚写入的 Tencent COS asset metadata
- `GET /api/video-edit-jobs?status=pending&limit=5` 可查回该 pending job
- `GET /api/source-items?platform=douyin&limit=5` 在 PostgreSQL 模式下返回 `200`
- `GET /api/source-items/<sourceItemId>` 在 PostgreSQL 模式下返回 `200`
- `GET /api/source-items/<sourceItemId>/comments?limit=5` 在 PostgreSQL 模式下返回 `200`
- `POST /api/content/video-scripts/test-draft` 在 PostgreSQL 模式 + domestic session 下返回 `201`
- test draft 响应包含 `draft.id`、已确认 `selectedVariant.id`、`reviewStatus=approved`、`productionScenes.length=3`
- 已串联验证 test draft -> `/api/media/complete` -> `/api/video-edit-jobs`：
  - 登录：`303`
  - test draft：`201`
  - media complete：`201`
  - job create：`201`
  - job 状态：`pending`
  - `inputPayload.render_mode=asset_driven`
  - `inputPayload.input_assets.length=1`
- 已验证混合 env 容错：在 `DATABASE_PROVIDER=postgres` + `APP_DATABASE_URL` 存在，同时残留 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 的 `next start` 环境下，test draft -> media complete -> video job 仍返回 `201 / 201 / 201`，且 job 仍为 `asset_driven`。

备注：

- 为补齐空库验证，本机安装了 Homebrew `postgresql@17 17.9`，没有注册 `brew services` 常驻服务。
- Docker CLI 仍存在但 Docker daemon 未启动，本轮没有用 Docker 验证。
- Homebrew 安装时 PostgreSQL 已成功落盘，最后 cleanup 阶段出现 Homebrew 自身 API 异常，未影响 `psql` / `postgres` 使用。
- 已检查 `app/.env*`、`workers/video-worker/.env*` 和当前进程环境：未发现真实国内 PostgreSQL / COS / worker key。

## 4. 剩余风险

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
