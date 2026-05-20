# 2026-05-16 Self-hosted Platform Admin Session Progress

## Scope

本轮只做 P0 repository migration Batch 1 中的平台管理后台登录 / 会话路径。

已包含：

- `platform_admin_users` 作为平台管理员身份来源。
- `platform_admin_sessions` 作为平台管理员会话来源。
- 首个超管 bootstrap 走普通 PostgreSQL 表。
- 平台管理员密码使用本地 PBKDF2 单向哈希格式。
- 登录后写入 `platform_admin_session` httpOnly cookie。
- 受保护平台后台 API 从 cookie 读取 app-owned session，不再依赖 Supabase Auth。
- Logout / 清理会话时撤销 app-owned session。
- 新增平台后台 session smoke 脚本。

未包含：

- 未迁移 consultation / RAG / Agent / material / import / OSS / worker / TTS。
- 未迁移 `platform-admin-repository.ts` 中完整后台用户管理写路径。
- 未合并 main。
- 未写国内化完成标记。

## Files

Updated:

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/app/platform-admin-login/page.tsx`

Added:

- `app/scripts/check-domestic-platform-admin-session-smoke.mjs`

## Implementation Notes

- PostgreSQL self-hosted mode优先级：
  - 当 `APP_DATABASE_URL` / `DATABASE_URL` / `LOCAL_REAL_CHAIN_DB_URL` 存在，且 PostgreSQL 被当前 app runtime 选中时，平台后台 Auth 优先走 app-owned session。
  - Supabase Auth 路径保留为 fallback。
- 修正了一个验证中发现的问题：
  - 旧 local-demo shortcut 在无 Supabase env 时会先于 app-owned session 返回 demo 管理员。
  - 已调整为 app-owned PostgreSQL session 优先，避免 self-hosted 环境无 cookie 也能进后台。
- 修正了 app-owned session 查询：
  - `platform_admin_sessions` join `platform_admin_users` 时，用户列使用 `u.` 显式限定，避免 `id` 歧义导致有效 cookie 被 401。

## Smoke Script

新增脚本：

```bash
node app/scripts/check-domestic-platform-admin-session-smoke.mjs
```

能力：

- 检查 `platform_admin_users` / `platform_admin_sessions` 表存在。
- 创建临时平台管理员。
- 按 app 侧 PBKDF2 规范生成并验证密码哈希。
- 创建 session token，并按 SHA-256 token hash 写入 session 表。
- 查询有效 session。
- 撤销 session 并确认失效。
- 如传入 `--base-url`，会额外验证：
  - 无 cookie 访问 `/api/platform-admin/agents` 返回 `401`。
  - 有效 `platform_admin_session` cookie 返回 `200`。
  - 撤销后同一 cookie 返回 `401`。
- 默认清理临时平台管理员与 session。

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-platform-admin-session-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

Local full smoke:

- 启动临时 PostgreSQL 17 空库。
- 应用：
  - `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- 启动本地 production `next start` 临时端口。
- 运行：

```bash
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  node app/scripts/check-domestic-platform-admin-session-smoke.mjs \
  --base-url http://127.0.0.1:34017
```

Result:

- `status=ok`
- required tables present
- password hash convention passed
- admin create/find passed
- session create/lookup passed
- logout invalidation passed
- unauthenticated API status: `401`
- authenticated API status: `200`
- revoked-cookie API status: `401`
- temporary admin cleanup: ok

## Singapore Validation

Live baseline checks:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, database provider `postgres`, COS configured.
- Existing live app preflight in `jingjing-selfhost-app`: passed, database select ok, required tables present.

Branch-specific validation:

- Created an isolated temporary release from the existing app container.
- Patched only this branch's changed files into the temp release.
- Started a temporary app container on `127.0.0.1:34018`.
- Live app on port `3002` was not replaced.

Temp app checks:

- `GET http://127.0.0.1:34018/api/health`: passed.
- `node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`: passed.
- `node scripts/check-domestic-platform-admin-session-smoke.mjs --base-url http://127.0.0.1:34018`: passed.

Platform admin smoke result on Singapore temp app:

- `status=ok`
- `unauthenticatedStatus=401`
- `authenticatedStatus=200`
- `authenticatedAgentCount=1`
- `revokedStatus=401`
- temporary admin cleanup: ok
- follow-up query confirmed `platform-admin-smoke-%@example.test` rows count is `0`.

Existing non-regression smoke:

- `node scripts/check-domestic-video-chain-api-smoke.mjs --base-url http://127.0.0.1:34018 --with-upload-intent`: passed.
- Result:
  - login `303`
  - test draft `201`
  - upload intent `201`
  - media complete `201`
  - video job create `201`
  - `renderMode=asset_driven`
  - `inputAssetCount=1`
  - upload intent missing fields: none
- Contract-only video job `82d581e4-80b6-4988-bf48-c21c5d2106ab` was marked `failed_manual` after evidence capture to avoid worker retry noise.

Additional observation:

- Attempted `check-domestic-main-integration-smoke.mjs` on the same temp app.
- Team invite APIs passed, but generated content jobs ended `failed_manual`.
- Batch `130b9940-722c-49bc-995b-017dfda6b8e7` ended `completed_with_errors`.
- This was not counted as the required non-regression pass; video-chain API smoke was used instead.

Cleanup:

- Temporary app container `jj-pa-session-smoke` stopped and removed.
- Temporary release directory removed with `sudo rm -rf`.

## Push / Merge

- Pre-work Gitee backup: pushed current branch tip `12a880f` to `gitee/codex/domestic-infra-migration`.
- Post-work push: not done.
- Merge to main: not done.
