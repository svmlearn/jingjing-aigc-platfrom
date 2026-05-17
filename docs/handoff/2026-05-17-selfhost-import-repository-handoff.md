# 2026-05-17 Self-hosted Import Repository Handoff

## Current Goal

Complete P0 repository migration Batch 6: `import-repository.ts` read/write paths.

Goal achieved locally:

```text
On self-hosted PostgreSQL, import jobs, source items, and imported comments can be created,
updated, listed, deduplicated, and read without Supabase Admin.
```

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Pre-work backup pushed to Gitee: `6d44f6d70cd0e11443f04e773c868dc47cdb7f6a`

## Completed

- Added PostgreSQL paths in `app/src/lib/db/import-repository.ts` for:
  - `createImportJob`
  - `getImportJobById`
  - `listImportJobs`
  - `countRunningImportJobs`
  - `updateImportJob`
  - `upsertSourceItems`
  - `ensureSourceItemForComments`
  - `upsertImportedComments`
  - `listSourceItems`
  - `getSourceItemById`
  - `listImportedComments`
- Kept Supabase Admin fallback.
- Added Batch 6 smoke:
  - `app/scripts/check-domestic-import-repository-smoke.mjs`
- Added progress:
  - `docs/progress/2026-05-17-selfhost-import-repository.md`

## Changed Files

```text
app/src/lib/db/import-repository.ts
app/scripts/check-domestic-import-repository-smoke.mjs
docs/progress/2026-05-17-selfhost-import-repository.md
docs/handoff/2026-05-17-selfhost-import-repository-handoff.md
```

## Validation

Local passed:

```bash
node --check app/scripts/check-domestic-import-repository-smoke.mjs
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
cleanup.status=ok
```

Singapore passed:

- live `/api/health`: `ok=true`, DB provider `postgres`, COS configured
- live `jingjing-selfhost-app` preflight: `status=ok`
- new Batch 6 import repository smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`
- platform admin management non-regression smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`

Singapore note:

- I did not replace the live app with this branch.
- Singapore route-level Batch 6 behavior was not tested against a branch temp container.
- Local route-level Batch 6 behavior was tested through a branch-built production app.
- No real external scraping provider was called.

## Not Done / Out Of Scope

- No material repository migration.
- No `material_workbench_references` migration.
- No credits / usage migration.
- No OSS/COS adapter changes.
- No worker / FireRed / OpenStoryline / TTS changes.
- No pgvector/vector RPC changes.
- No real Apify/TikHub/provider validation.
- No main merge.
- No completion marker write.

## Push / Merge State

- `6d44f6d` backup was pushed to Gitee before editing.
- New Batch 6 commit is local unless the user asks to push.
- `main` was not merged.

## Residual Risks

- Singapore Batch 6 route-level validation was not run on a branch-built Singapore temp container; only DB-level Batch 6 smoke ran against Singapore.
- Existing live Singapore app was intentionally not replaced.
- Real provider execution remains out of scope, so this validates repository persistence and read routes, not external scraping provider behavior.

## Next Recommended Batch

Next batch should explicitly choose one of:

1. `material-library-repository.ts` plus `material_workbench_references` migration.
2. merchant credits/usage migration as a separate accounting batch.
3. formal app-owned registration / invite redemption path cleanup.

Keep OSS adapter and worker/TTS as later isolated batches.
