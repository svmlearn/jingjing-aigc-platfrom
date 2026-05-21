# 2026-05-17 P0 Repository Migration Batch 5: Platform Admin Management

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 4B Agent Console admin writes.

This batch migrates the remaining `platform-admin-repository.ts` operational management paths from Supabase Admin to self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, platform admin can manage platform admin users,
merchant signup invitation codes, and merchant list/detail/status/plan
without Supabase Admin.
```

This is platform admin management only. It is not import/material, credits/usage, OSS, worker, or TTS.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD before this batch:

```text
04e20f7 feat: add selfhost agent admin writes
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -4
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-16-selfhost-platform-admin-session.md
docs/progress/2026-05-16-selfhost-agent-runtime-foundation.md
docs/progress/2026-05-16-selfhost-agent-admin-writes.md
docs/handoff/2026-05-16-selfhost-agent-admin-writes-handoff.md
```

Inspect before editing:

```text
app/src/lib/db/platform-admin-repository.ts
app/src/lib/auth/platform-admin-session.ts
app/src/lib/db/postgres-video-chain-repository.ts
app/src/lib/db/merchant-repository.ts
app/src/lib/server-db/postgres.ts
app/src/contracts/platform-admin.ts
app/src/contracts/merchant.ts
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

Use ordinary PostgreSQL when the app is in self-hosted PostgreSQL mode.

Use the existing helper pattern already present in this branch:

```text
isAppPostgresPreferred()
isAppPostgresConfigured()
queryAppDb()
withAppDbTransaction()
mapPostgresError()
```

Keep Supabase Admin fallback for legacy/staging paths.

Keep demo fallback only when neither app PostgreSQL nor Supabase Admin is configured.

### 4.2 Platform admin users

In:

```text
app/src/lib/db/platform-admin-repository.ts
```

Implement self-hosted PostgreSQL paths for:

```text
listPlatformAdminUsers
createPlatformAdminUser
updatePlatformAdminUser
getPlatformAdminUserById internal helper
countActiveSuperAdmins internal helper
```

Expected behavior:

- Self-hosted `platform_admin_users` does not use Supabase Auth.
- For DTO compatibility, `authUserId` can be mapped from the same `platform_admin_users.id` in app-owned mode.
- `createPlatformAdminUser` inserts `password_hash` using the same PBKDF2 convention as `platform-admin-session.ts`.
- Reuse/export `createPlatformAdminPasswordHash` if already available; do not duplicate incompatible hashing logic.
- `created_by_admin_id` should use the actor when available.
- `updatePlatformAdminUser` keeps the "at least one active super admin" guard.
- When disabling an admin, revoke that admin's active app-owned sessions in `platform_admin_sessions`.
- Writes create `platform_admin_events` rows.
- Do not print passwords or password hashes.

### 4.3 Invitation code management

Implement self-hosted PostgreSQL paths for:

```text
listPlatformInvitationCodes
createPlatformInvitationCode
updatePlatformInvitationCode
getPlatformInvitationCodeById internal helper
```

Expected behavior:

- Reads/writes use `invitation_codes`.
- Filtering behavior remains compatible with current `filterPlatformInvitationCodes`.
- Creation should keep existing generated-code behavior and constraints.
- If existing `createInvitationCode()` is already self-hosted aware, it may be reused; otherwise add the PostgreSQL path here.
- Status transitions remain compatible:
  - only active can be disabled
  - only disabled can be re-enabled
- Writes create `platform_admin_events` rows.

### 4.4 Merchant admin management

Implement self-hosted PostgreSQL paths for:

```text
listPlatformMerchants
getPlatformMerchantById
updatePlatformMerchant
countByMerchant internal helper
countMerchantRows internal helper
```

Expected behavior:

- Reads use `merchant_profiles`.
- Counts use ordinary PostgreSQL over `import_jobs` and `content_drafts`.
- Updating merchant `status` and `plan` works.
- DTO shape remains compatible.
- Writes create `platform_admin_events` rows.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
import-repository.ts write path
material-library-repository.ts
material_workbench_references beyond what this repository needs
merchant credits/usage accounting
ensureMerchantCreditAccount
recordMerchantUsageEvent
updateMerchantUsageEvent
consumeMerchantCredits
Aliyun OSS adapter
storage provider abstraction changes
worker / FireRed / OpenStoryline / TTS
pgvector / vector RPC
main merge
```

Do not require:

```text
real model call
real embedding call
normal FireRed
voiceover/TTS
real file upload
```

## 6. Smoke Script

Add a focused self-hosted smoke, suggested:

```text
app/scripts/check-domestic-platform-admin-management-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required tables exist:
  - `platform_admin_users`
  - `platform_admin_sessions`
  - `platform_admin_events`
  - `invitation_codes`
  - `merchant_profiles`
  - `import_jobs`
  - `content_drafts`
- create/list/update platform admin user
- disabling admin revokes that admin's sessions
- last active super admin guard still works
- create/list/disable/reactivate invitation code
- create or reuse a test merchant fixture
- list merchants includes fixture
- get merchant detail includes import/draft counts
- update merchant status/plan and restore
- audit events are written
- cleanup removes temporary admin, sessions, invitation code, merchant fixture, and related rows
- rerun is safe

If practical, support `--base-url` to verify platform admin HTTP routes through a branch-built temp app. DB-level smoke plus a small HTTP check is acceptable if the UI/API routes are broad.

## 7. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-platform-admin-management-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Run the new smoke against a local ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Singapore validation:

- Confirm live `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new platform-admin-management smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - Agent admin writes smoke, or
  - Agent runtime foundation smoke, or
  - Knowledge repository smoke.

Do not require normal FireRed, TTS/voiceover, OSS, or pgvector in this batch.

## 8. Guardrails

Do not write:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark `.codex/long-task/active.json` complete.

Do not merge to `main`.

Do not print secrets, passwords, password hashes, or database URLs.

If any runtime env on Singapore is changed, record exactly what changed without revealing secret values.

## 9. Deliverables

Commit code and docs locally on `codex/domestic-infra-migration`.

Expected docs:

```text
docs/progress/2026-05-17-selfhost-platform-admin-management.md
docs/handoff/2026-05-17-selfhost-platform-admin-management-handoff.md
```

The final response should include:

- final HEAD commit
- changed files
- local validation result
- Singapore validation result
- whether pushed to Gitee
- whether worktree is clean
- residual risks
- recommended next batch

