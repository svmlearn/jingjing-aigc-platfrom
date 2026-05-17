# 2026-05-17 Self-hosted Platform Admin Management Handoff

## Current Goal

Complete P0 repository migration Batch 5: platform admin management paths in `platform-admin-repository.ts`.

Goal achieved locally:

```text
On self-hosted PostgreSQL, platform admins can manage platform admin users,
merchant signup invitation codes, and merchant status/plan management without Supabase Admin.
```

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Pre-work backup pushed to Gitee: `04e20f7c78f7b5f2d2aa77a97334a1de1a72d0d1`

## Completed

- Added PostgreSQL paths in `app/src/lib/db/platform-admin-repository.ts` for:
  - `listPlatformAdminUsers`
  - `createPlatformAdminUser`
  - `updatePlatformAdminUser`
  - `listPlatformInvitationCodes`
  - `createPlatformInvitationCode`
  - `updatePlatformInvitationCode`
  - `listPlatformMerchants`
  - `getPlatformMerchantById`
  - `updatePlatformMerchant`
  - internal admin user / invitation code fetch helpers
  - internal active super admin and merchant count helpers
- Kept Supabase Admin fallback.
- Reused `createPlatformAdminPasswordHash()` from `platform-admin-session.ts`.
- Added session revocation when disabling app-owned platform admins.
- Added audit events for app-owned PostgreSQL writes.
- Added Batch 5 smoke:
  - `app/scripts/check-domestic-platform-admin-management-smoke.mjs`
- Added progress:
  - `docs/progress/2026-05-17-selfhost-platform-admin-management.md`

## Changed Files

```text
app/src/lib/db/platform-admin-repository.ts
app/scripts/check-domestic-platform-admin-management-smoke.mjs
docs/progress/2026-05-17-selfhost-platform-admin-management.md
docs/handoff/2026-05-17-selfhost-platform-admin-management-handoff.md
```

## Validation

Local passed:

```bash
node --check app/scripts/check-domestic-platform-admin-management-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local full smoke passed against fresh ordinary PostgreSQL plus branch-built local `next start` app:

```text
status=ok
direct.status=ok
http.status=ok
last super admin guard returned 409 / LAST_SUPER_ADMIN_REQUIRED
cleanup.status=ok
```

Singapore passed:

- live `/api/health`: `ok=true`, DB provider `postgres`, COS configured
- live `jingjing-selfhost-app` preflight: `status=ok`
- new Batch 5 platform-admin-management smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`
- Agent Admin Writes non-regression smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`

Singapore note:

- I did not replace the live app with this branch.
- Singapore route-level Batch 5 behavior was not tested against a branch temp container.
- Local route-level Batch 5 behavior was tested through a branch-built production app.

## Not Done / Out Of Scope

- No import repository migration.
- No material repository migration.
- No credits / usage migration.
- No OSS/COS adapter changes.
- No worker / FireRed / OpenStoryline / TTS changes.
- No pgvector/vector RPC changes.
- No main merge.
- No completion marker write.

## Push / Merge State

- `04e20f7` backup was pushed to Gitee before editing.
- New Batch 5 commit is local unless the user asks to push.
- `main` was not merged.

## Residual Risks

- Singapore Batch 5 route-level validation was not run on a branch-built Singapore temp container; only DB-level Batch 5 smoke ran against Singapore.
- Existing live Singapore app was intentionally not replaced.
- `merchant_profiles.plan` database constraint still allows historical `max`, while current platform-admin API schema accepts `free | plus | pro`; this batch kept the current contract unchanged.

## Next Recommended Batch

Next batch should explicitly choose one of:

1. `import-repository.ts` write-path migration.
2. `material-library-repository.ts` plus `material_workbench_references` migration.
3. merchant credits/usage migration as a separate accounting batch.

Keep OSS adapter and worker/TTS as later isolated batches.
