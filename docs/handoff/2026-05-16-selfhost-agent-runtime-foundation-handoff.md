# 2026-05-16 Self-hosted Agent Runtime Foundation Handoff

## Current Goal

Complete P0 repository migration Batch 4A: Agent Runtime Foundation.

The goal is to let the seeded foundation data in self-hosted PostgreSQL drive platform settings, Agent Console runtime reads, consultation default routing, runtime snapshots, and debug test-run persistence.

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Required pre-work backup: pushed `0a29743` to `gitee/codex/domestic-infra-migration`
- Final implementation commit: the commit containing this handoff; exact SHA should be read from branch tip / final response.

## Completed

- `platform-admin-repository.ts` now has a self-hosted PostgreSQL path for:
  - `getPlatformSettings`
  - `updatePlatformSettings`
  - internal platform admin event recording
- `agent-console-repository.ts` now has a self-hosted PostgreSQL runtime/foundation path for:
  - agent config list/get/detail
  - prompt version list/active
  - soul version list/active
  - skill list and bindings
  - knowledge set list/get/detail/document links
  - agent knowledge set bindings
  - route bindings and consultation default route binding
  - foundation state aggregation
  - runtime snapshots
  - debug test runs
- Added focused smoke script:
  - `app/scripts/check-domestic-agent-runtime-smoke.mjs`
- Supabase fallback remains for legacy paths.
- In-memory demo fallback remains only when neither self-hosted PostgreSQL nor Supabase Admin is configured.

## Changed Files

- `app/src/lib/db/platform-admin-repository.ts`
- `app/src/lib/db/agent-console-repository.ts`
- `app/scripts/check-domestic-agent-runtime-smoke.mjs`
- `docs/progress/2026-05-16-selfhost-agent-runtime-foundation.md`
- `docs/handoff/2026-05-16-selfhost-agent-runtime-foundation-handoff.md`

## Validation

Local passed:

- `node --check app/scripts/check-domestic-agent-runtime-smoke.mjs`
- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- `git diff --check`
- fresh local PostgreSQL DB-level smoke with baseline + foundation migrations only
- fresh local PostgreSQL + production app/API smoke on `127.0.0.1:34024`

Local app/API smoke result:

- settings GET `200`
- agents GET `200`
- agent detail GET `200`
- knowledge set detail GET `200`
- settings API update/restore passed
- merchant login `303`
- experts GET `200`
- consultation session create `201`
- seeded agent container present
- debug test run `201`
- debug test run persisted
- cleanup ok

Singapore passed:

- live `GET /api/health`
- live app env preflight
- branch-specific temp app build inside `node:22-bookworm-slim`
- branch-specific temp app on `127.0.0.1:34025`
- temp app health
- temp app env preflight
- new Agent Runtime smoke through temp app
- existing Knowledge Repository smoke through temp app as non-regression

Singapore cleanup:

- temp container removed
- temp release directory removed
- temp source archive removed
- Agent Runtime smoke fixture counts confirmed `0`
- Knowledge smoke fixture counts confirmed `0`

## Not Completed / Out Of Scope

- Full Agent Console admin edit/write paths were not migrated.
- Credits and usage were not migrated.
- OSS, worker, FireRed, OpenStoryline, and TTS were not touched.
- No main merge.
- No post-work push.
- No task-forbidden completion marker was written.

## Notes For Next Agent

- Consultation runtime should now resolve the seeded `consultation_default` route binding from self-hosted PostgreSQL.
- The default seeded agent can provide prompt, soul, skill, and knowledge-set binding data to `/api/consultation/experts` and consultation session creation.
- Agent Console list/detail read surfaces can read foundation data from PostgreSQL, but admin edit actions are still a later batch.
- `recordAgentTestRun` and `recordAgentRuntimeSnapshot` now persist to PostgreSQL in self-hosted mode.

## Recommended Next Batch

Choose Batch 4B only if the next task explicitly scopes full Agent Console admin edit/write behavior. Keep credits/usage, OSS, worker, FireRed/OpenStoryline, and TTS out unless the task brief includes them.
