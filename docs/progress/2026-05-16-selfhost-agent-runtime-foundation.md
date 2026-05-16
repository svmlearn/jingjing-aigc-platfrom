# 2026-05-16 Self-hosted Agent Runtime Foundation Progress

## Scope

This round only covers P0 repository migration Batch 4A: Agent Runtime Foundation.

Included:

- Platform settings read/update foundation path in `platform-admin-repository.ts`.
- Agent Console runtime/foundation read path in `agent-console-repository.ts`.
- Runtime snapshot and debug test-run persistence on self-hosted PostgreSQL.
- A focused smoke script for local and Singapore validation.

Not included:

- Full Agent Console admin edit/write paths.
- Credits or usage migration.
- OSS, worker, FireRed, OpenStoryline, or TTS migration.
- Main merge.
- Post-work push.
- Any task-forbidden completion marker.

## Files

Updated:

- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/agent-console-repository.ts`

Added:

- `app/scripts/check-domestic-agent-runtime-smoke.mjs`

## Implementation Notes

Repository preference follows the existing self-hosted pattern:

1. self-hosted PostgreSQL path when app PostgreSQL is configured or preferred
2. Supabase Admin fallback for legacy/staging paths
3. in-memory demo fallback only when neither self-hosted PostgreSQL nor Supabase Admin is configured

### Platform Settings

`platform-admin-repository.ts` now supports self-hosted PostgreSQL for:

- `getPlatformSettings`
- `updatePlatformSettings`
- internal `recordPlatformAdminEvent`

Behavior:

- Reads from `public.platform_settings` by stable setting keys.
- Updates all known setting rows inside one PostgreSQL transaction.
- Records a `platform_admin_events` audit row for settings updates.
- Keeps the existing DTO shape and Supabase fallback.

### Agent Runtime Foundation

`agent-console-repository.ts` now supports self-hosted PostgreSQL for runtime/foundation reads:

- `getAgentConsoleFoundationState`
- `listAgentConfigs`
- `getAgentConfigById`
- `getAgentConfigDetail`
- `listAgentPromptVersions`
- `getActiveAgentPromptVersion`
- `listAgentSoulVersions`
- `getActiveAgentSoulVersion`
- `listAgentSkills`
- `listAgentSkillBindings`
- `listKnowledgeSets`
- `getKnowledgeSetById`
- `getKnowledgeSetDetail`
- `listKnowledgeSetDocuments`
- `listAgentKnowledgeSetBindings`
- `listAgentRouteBindings`
- `getAgentRouteBinding`
- `getConsultationDefaultRouteBinding`

Persistence added:

- `recordAgentRuntimeSnapshot`
- `recordAgentTestRun`
- internal admin event recording used by test runs

Behavior:

- Seeded foundation data can drive `/api/consultation/experts`.
- Consultation session creation can resolve the seeded default route binding and include an agent container.
- Debug test runs persist to `agent_test_runs` and record an admin event.
- Runtime snapshots persist to `agent_runtime_snapshots`.

Admin edit/write paths such as create/update/copy/prompt draft/publish/rollback/skills/knowledge-set replacement remain out of scope and still use the existing Supabase-admin guarded path.

## Smoke Script

Added:

```bash
node app/scripts/check-domestic-agent-runtime-smoke.mjs
```

Direct database checks cover:

- required tables exist
- platform settings are seeded
- direct platform setting update/restore
- seeded agent config
- seeded consultation default route binding
- active prompt and soul versions
- base knowledge-set binding
- temporary knowledge document attachment
- runtime snapshot insert
- direct test-run insert
- cleanup of all temporary fixtures

With `--base-url`, the script additionally covers:

- app-owned platform admin fixture and session cookie
- app-owned merchant fixture and login
- platform settings GET
- agent list and agent detail GET
- knowledge set detail GET
- optional settings API update/restore
- consultation experts GET
- consultation session creation with seeded agent container
- platform admin debug test run persistence
- cleanup of temporary admin, merchant, document, session, snapshot, and test-run fixtures

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-agent-runtime-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

DB-level smoke:

- fresh local PostgreSQL
- applied:
  - `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- optional pgvector migration was not applied
- ran `check-domestic-agent-runtime-smoke.mjs` against direct DB only

Result:

- `status=ok`
- `platformSettingsSeeded=true`
- `directSettingsUpdateRestore=true`
- `seededAgent=true`
- `seededRouteBinding=true`
- `activePromptSoul=true`
- `knowledgeSetBinding=true`
- `runtimeSnapshotInserted=true`
- `directTestRunInserted=true`
- cleanup ok

Local app/API smoke:

- fresh local PostgreSQL with the same two migrations
- production `next start` on `127.0.0.1:34024`
- ran:

```bash
node app/scripts/check-domestic-agent-runtime-smoke.mjs \
  --base-url http://127.0.0.1:34024 \
  --with-settings-api-update
```

Result:

- `status=ok`
- settings GET `200`
- agents GET `200`
- agent detail GET `200`
- active prompt and active soul present
- knowledge binding count `1`
- knowledge set detail GET `200`
- settings API update/restore passed
- merchant login `303`
- experts GET `200`
- consultation session create `201`
- consultation response included seeded agent container
- debug test run `201`
- debug test run persisted and included agent container
- cleanup ok

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- Live `jingjing-selfhost-app` preflight passed:
  - database URL present
  - required tables present
  - COS env present
  - `DATABASE_PROVIDER=postgres`
  - video-chain test entrypoint enabled

Branch-specific temporary app:

- Uploaded current branch `app/` source and scripts to the Singapore host.
- Created isolated temp release from the live app container.
- Overwrote the temp release source and scripts with this branch's current files.
- Rebuilt the temp app inside `node:22-bookworm-slim`.
- Started a temp app container on `127.0.0.1:34025`.
- Live app was not replaced.

Temp app validation:

- `GET http://127.0.0.1:34025/api/health`: passed.
- `node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`: passed.
- `node scripts/check-domestic-agent-runtime-smoke.mjs --base-url http://127.0.0.1:34025`: passed.
- `node scripts/check-domestic-knowledge-repository-smoke.mjs --base-url http://127.0.0.1:34025`: passed as non-regression.

Singapore agent runtime smoke result:

- `status=ok`
- required tables present
- platform settings direct update/restore passed
- seeded agent and route binding present
- active prompt and soul present
- knowledge set binding present
- runtime snapshot insert passed
- direct test-run insert passed
- settings GET `200`
- agents GET `200`
- agent detail GET `200`
- knowledge set detail GET `200`
- settings API update skipped in Singapore temp run
- merchant login `303`
- experts GET `200`
- consultation session create `201`
- consultation response included seeded agent container
- debug test run `201`
- debug test run persisted and included agent container
- cleanup ok

Singapore cleanup:

- temp container removed
- temp release directory removed
- temp source archive removed
- Agent Runtime smoke fixture counts confirmed `0`
- Knowledge smoke fixture counts confirmed `0`

## Current State

Batch 4A is implemented and validated locally and on Singapore in an isolated temp app. The branch remains unmerged and has not been pushed after implementation.
