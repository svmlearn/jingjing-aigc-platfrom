# 2026-05-17 Self-hosted Platform Admin Management

## Scope

Batch 5 completed the remaining `platform-admin-repository.ts` management paths for ordinary self-hosted PostgreSQL:

- platform admin user list/create/update
- invitation code list/create/disable/reactivate
- merchant list/detail/status/plan update
- merchant import/draft counts from `import_jobs` and `content_drafts`
- audit event writes into `platform_admin_events`

Out of scope remained untouched:

- import/material repositories
- credits/usage
- COS/OSS storage
- worker / FireRed / OpenStoryline / TTS
- main merge
- completion markers

## Implementation Notes

- PostgreSQL mode follows the existing `isAppPostgresConfigured()` + `isAppPostgresPreferred()` repository pattern.
- Supabase Admin fallback remains for legacy/staging paths.
- App-owned platform admin users map `authUserId` to `platform_admin_users.id`.
- `createPlatformAdminUser` now writes `password_hash` using `createPlatformAdminPasswordHash()` from `platform-admin-session.ts`.
- `updatePlatformAdminUser` keeps the last-active-super-admin guard.
- Disabling an app-owned admin revokes active rows in `platform_admin_sessions`.
- Invitation code status transitions remain:
  - only `active` can become `disabled`
  - only `disabled` can become `active`
- Merchant admin counts use ordinary SQL over `import_jobs` and `content_drafts`.

## Changed Files

```text
app/src/lib/db/platform-admin-repository.ts
app/scripts/check-domestic-platform-admin-management-smoke.mjs
docs/progress/2026-05-17-selfhost-platform-admin-management.md
docs/handoff/2026-05-17-selfhost-platform-admin-management-handoff.md
```

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-platform-admin-management-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local smoke ran against a fresh ordinary PostgreSQL database initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

The same run started a branch-built local production app with `next start` and executed:

```bash
node app/scripts/check-domestic-platform-admin-management-smoke.mjs \
  --base-url http://127.0.0.1:34032 \
  --with-last-super-admin-guard
```

Result:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
http.status=ok
lastSuperAdminGuard.responseStatus=409
lastSuperAdminGuard.responseCode=LAST_SUPER_ADMIN_REQUIRED
cleanup.status=ok
```

Covered checks:

- admin user create/list/update
- disabling admin revokes sessions
- last active super admin guard through HTTP route
- invitation code create/list/disable/reactivate
- merchant list/detail counts
- merchant status/plan update and restore
- audit events
- cleanup

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` preflight: passed, `status=ok`, database tables present, COS env present, video-chain test entrypoint enabled.

New Batch 5 smoke against Singapore self-hosted PostgreSQL through SSH tunnel:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
adminUserCreatedAndListed=true
disablingAdminRevokedSessions=true
lastActiveSuperAdminGuardEvaluated=true
invitationCodeDisableReactivate=true
merchantCounts=true
merchantUpdateRestore=true
auditEventsWritten=true
cleanup.status=ok
```

Singapore non-regression:

- `check-domestic-agent-admin-writes-smoke.mjs` against Singapore self-hosted PostgreSQL through SSH tunnel: `status=ok`.

Singapore note:

- I did not replace the live app with this branch.
- Singapore Batch 5 validation was DB-level against the live self-hosted PostgreSQL, plus live health/preflight.
- Route-level Batch 5 behavior was validated locally against a branch-built temp app.

## Backup / Push State

Before code changes, current `04e20f7c78f7b5f2d2aa77a97334a1de1a72d0d1` was pushed to Gitee:

```text
gitee/codex/domestic-infra-migration = 04e20f7c78f7b5f2d2aa77a97334a1de1a72d0d1
```

The new Batch 5 commit is local unless explicitly pushed later.
