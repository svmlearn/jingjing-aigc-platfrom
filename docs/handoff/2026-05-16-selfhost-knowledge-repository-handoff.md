# 2026-05-16 Self-hosted Knowledge Repository Handoff

## Current Goal

完成 P0 repository migration Batch 3：把 `knowledge-repository.ts` 迁到 self-hosted PostgreSQL path，并保证普通 PostgreSQL + `embedding_json` + lexical fallback 可用。

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Required pre-work backup: pushed `36ddc87` to `gitee/codex/domestic-infra-migration`
- Final implementation commit: the commit containing this handoff; exact SHA should be read from branch tip / final response.

## Completed

- `knowledge-repository.ts` now prefers self-hosted PostgreSQL when app PostgreSQL mode is configured.
- Supabase Admin fallback remains for legacy/staging paths.
- in-memory fallback remains only when neither self-hosted PostgreSQL nor Supabase Admin is configured.
- PostgreSQL paths added for:
  - document list/get/create/update/delete
  - ingestion job create/update
  - chunk replace/list
  - search
  - chunk count stats
  - latest ingestion job stats
- `replaceKnowledgeChunks` writes `embedding_json` and does not require pgvector.
- `searchKnowledgeChunks` works without vector RPC and uses lexical scoring/fallback.
- Added required smoke script:
  - `app/scripts/check-domestic-knowledge-repository-smoke.mjs`

## Changed Files

- `app/src/lib/db/knowledge-repository.ts`
- `app/scripts/check-domestic-knowledge-repository-smoke.mjs`
- `docs/progress/2026-05-16-selfhost-knowledge-repository.md`
- `docs/handoff/2026-05-16-selfhost-knowledge-repository-handoff.md`

## Validation

Local passed:

- `node --check app/scripts/check-domestic-knowledge-repository-smoke.mjs`
- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- fresh local PostgreSQL DB-level smoke with baseline + foundation migrations only
- fresh local PostgreSQL + production app/API smoke on `127.0.0.1:34022`

Local app/API smoke result:

- login `303`
- merchant memory create/list/patch/retry/delete: `201 / 200 / 200 / 200 / 200`
- `embedding_json` storage passed
- platform lexical search passed
- merchant lexical search passed
- `documentIds` filter passed
- no-positive lexical fallback passed
- delete cascade passed
- cleanup ok

Singapore passed:

- live `GET /api/health`
- live app env preflight
- branch-specific temp app on `127.0.0.1:34023`
- temp app health
- temp app env preflight
- new knowledge repository smoke through temp app
- consultation/strategy smoke as non-regression

Singapore cleanup:

- temp container removed
- temp release directory removed
- temp source archive removed
- smoke fixture counts confirmed `0`

## Not Completed / Out Of Scope

- Agent Console repository was not migrated.
- OSS / worker / FireRed / OpenStoryline / TTS were not touched.
- `platform-admin-repository.ts` full admin-user management was not migrated.
- No main merge.
- No post-work push.

## Notes For Next Agent

- The current merchant knowledge API can create/list/update/retry/delete memory documents on self-hosted PostgreSQL.
- File upload still goes through the existing COS helper path and was not the Batch 3 validation focus.
- Platform knowledge APIs should now use the same PostgreSQL repository path, but the smoke focused on repository and merchant memory API surfaces to avoid COS dependency.
- Singapore optional pgvector migration is still not required for this path.

## Recommended Next Batch

Choose the next repository explicitly from the remaining P0 list. Keep Agent Console, OSS, worker and TTS out unless the new task scopes them in.
