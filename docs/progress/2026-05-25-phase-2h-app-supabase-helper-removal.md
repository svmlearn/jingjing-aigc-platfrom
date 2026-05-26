# Phase 2H App Supabase Helper Removal

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Remove the remaining app-level Supabase helper, package, and env-example surface after repository fallback removal. This batch is limited to app runtime helpers/dependencies and does not touch storage provider compatibility, worker, COS/OSS files, or merchant-media/video service logic.

## Changes

- Removed legacy app helper files:
  - `app/src/lib/supabase/admin.ts`
  - `app/src/lib/supabase/browser.ts`
  - `app/src/lib/supabase/server.ts`
  - `app/src/lib/db/cloud-supabase-required.ts`
- Updated `app/src/lib/db/local-real-chain-repository.ts` so local real-chain enablement depends only on explicit `LOCAL_REAL_CHAIN_DB_URL`, not Supabase admin configuration.
- Removed Supabase env examples from `app/.env.example`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Removed app dependencies:
  - `@supabase/ssr`
  - `@supabase/supabase-js`
- Updated `app/pnpm-lock.yaml` with `pnpm remove --lockfile-only @supabase/ssr @supabase/supabase-js`.
  - A normal `pnpm remove` was blocked by this worktree's symlinked `node_modules` virtual store path, so the lockfile/package update was run in lockfile-only mode.
- Updated `app/src/lib/private-media-doctor.ts` to keep the same server-only secret redline with a generic `_SERVICE_ROLE_KEY` suffix check instead of naming the removed Supabase env key.
- Updated prior source contract tests to avoid raw legacy Supabase literals inside `app/src`, so the app runtime source scan can stay clean.
- Added `app/src/lib/db/app-supabase-helper-phase-2h-contract.test.mjs`.

## Compatibility Deliberately Left Alone

- Storage-provider contract values such as `supabase_storage`, `tencent_cos`, and `cosKey` were not changed in this batch. They are part of the later storage-provider cleanup phase.
- Worker env/config, COS/OSS implementation files, and package-lock outside the app package were not touched.

## Validation

Passed:

```bash
cd app && node --test src/lib/db/app-supabase-helper-phase-2h-contract.test.mjs
cd app && npm run lint -- src/lib/db/app-supabase-helper-phase-2h-contract.test.mjs src/lib/db/local-real-chain-repository.ts src/lib/private-media-doctor.ts src/lib/private-media-doctor.test.ts src/lib/private-media-workflow-fixture.test.ts src/lib/db/agent-console-repository-phase-2e-contract.test.mjs src/lib/db/consultation-repository-phase-2d-contract.test.mjs src/lib/db/content-generation-repository-phase-2d-contract.test.mjs src/lib/db/content-video-repository-phase-2a-contract.test.mjs src/lib/db/import-repository-phase-2d-contract.test.mjs src/lib/db/knowledge-repository-phase-2c-contract.test.mjs src/lib/db/material-library-phase-2b-contract.test.mjs src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs src/lib/db/merchant-repository-domestic-contract.test.ts src/lib/db/merchant-repository-phase-2b-contract.test.mjs src/lib/db/merchant-strategy-asset-phase-2b-contract.test.mjs src/lib/db/platform-admin-repository-phase-2c-contract.test.mjs src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs src/server/api/consultation-service.test.ts src/server/api/video-edit-jobs-service-phase-2g-contract.test.mjs
cd app && npm run typecheck -- --pretty false
rg -n -S "@supabase|lib/supabase|SUPABASE_|Supabase|isSupabase|createSupabase" app/src app/package.json app/pnpm-lock.yaml app/.env.example
```

The final `rg` returned no matches.

Pending after this batch:

- `git diff --check` before commit.
- Storage provider contract cleanup remains a separate phase.
- Worker cleanup remains a separate phase.
