# 2026-05-16 Self-hosted Platform Admin Session Handoff

## Current Goal

完成 P0 repository migration Batch 1：平台管理后台 Auth / session 从 Supabase Auth 迁到 app-owned PostgreSQL runtime。

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Base backup pushed before work: `12a880f` to `gitee/codex/domestic-infra-migration`
- Final implementation commit: the commit containing this handoff; exact SHA should be read from branch tip / final response.

## Completed

- `platform-admin-session.ts` now supports app-owned PostgreSQL platform admin auth:
  - bootstrap initial super admin in `platform_admin_users`
  - store one-way PBKDF2 password hashes
  - authenticate by email/password from `platform_admin_users`
  - create sessions in `platform_admin_sessions`
  - read current admin from `platform_admin_session` cookie
  - revoke current app-owned session on logout
  - keep Supabase Auth fallback for non-self-hosted legacy path
- Platform admin login page error copy no longer refers only to Supabase Auth.
- Added required smoke script:
  - `app/scripts/check-domestic-platform-admin-session-smoke.mjs`
- Fixed two issues found during validation:
  - app-owned PostgreSQL auth now takes precedence over local-demo bypass.
  - app-owned session lookup qualifies joined user columns to avoid ambiguous `id`.

## Changed Files

- `app/src/lib/auth/platform-admin-session.ts`
- `app/src/app/platform-admin-login/page.tsx`
- `app/scripts/check-domestic-platform-admin-session-smoke.mjs`
- `docs/progress/2026-05-16-selfhost-platform-admin-session.md`
- `docs/handoff/2026-05-16-selfhost-platform-admin-session-handoff.md`

## Validation

Local passed:

- `node --check app/scripts/check-domestic-platform-admin-session-smoke.mjs`
- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- Local temp PostgreSQL + local production app smoke:
  - unauthenticated platform admin API: `401`
  - valid app-owned session cookie: `200`
  - revoked cookie: `401`
  - temporary smoke admin cleaned up

Singapore passed:

- Live `GET /api/health`
- Live app env preflight
- Branch-specific temporary app on `127.0.0.1:34018`:
  - `GET /api/health`
  - app env preflight
  - platform-admin session smoke
  - video-chain API smoke with upload intent

Singapore cleanup:

- Contract-only video job `82d581e4-80b6-4988-bf48-c21c5d2106ab` marked `failed_manual`.
- Temp app container removed.
- Temp release directory removed.
- Query confirmed no leftover `platform-admin-smoke-%@example.test` users.

## Not Completed / Out Of Scope

- `platform-admin-repository.ts` full admin-user management write path remains Supabase-backed / fallback-only.
- Agent console repository remains Supabase-backed except existing demo fallback.
- Consultation, RAG, material, import, OSS, worker, FireRed/OpenStoryline, TTS were not migrated in this round.
- Team/Dify smoke was attempted but not counted as pass because generation jobs ended `failed_manual`; see progress log.

## Push / Merge

- Initial backup push: yes, before implementation.
- Post-work push: no.
- Merge to main: no.

## Next Step

Recommended next batch:

- Migrate `platform-admin-repository.ts` admin-user list/create/update paths to app-owned PostgreSQL if the platform admin user-management pages must be fully operational in self-hosted mode.
