# 2026-05-17 Self-hosted Material Library Handoff

## Current Goal

Complete P0 repository migration Batch 7: `material-library-repository.ts` and `material_workbench_references`.

Goal achieved locally:

```text
On self-hosted PostgreSQL, material library items and workbench references can be
created, listed, deduplicated, ranked, queued, consumed, and read without Supabase Admin.
```

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Pre-work backup pushed to Gitee: `0c84a36bef7ff6eb0f3f7baf42e17cc19a5135d4`
- New Batch 7 commit: current branch HEAD after this handoff commit; exact hash is reported in the final response.

## Completed

- Added PostgreSQL paths in `app/src/lib/db/material-library-repository.ts` for:
  - `listMaterialLibraryItems`
  - `getMaterialLibraryItemById`
  - `createMaterialLibraryItem`
  - `listCachedMaterialProviderItems`
  - `upsertMaterialLibraryItemsFromProvider`
  - `createMaterialWorkbenchReference`
  - `getMaterialWorkbenchReference`
  - `listMaterialWorkbenchReferencesByDraft`
  - `consumeMaterialWorkbenchReference`
  - internal URL/provider dedupe helpers
  - internal selected-for-rewrite update helper
- Kept Supabase Admin fallback.
- Kept trace-payload fallback only for legacy missing-table Supabase scenarios.
- Added Batch 7 smoke:
  - `app/scripts/check-domestic-material-library-smoke.mjs`
- Added progress:
  - `docs/progress/2026-05-17-selfhost-material-library.md`

## Changed Files

```text
app/src/lib/db/material-library-repository.ts
app/scripts/check-domestic-material-library-smoke.mjs
docs/progress/2026-05-17-selfhost-material-library.md
docs/handoff/2026-05-17-selfhost-material-library-handoff.md
```

## Validation

Local passed:

```bash
node --check app/scripts/check-domestic-material-library-smoke.mjs
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
- new Batch 7 material library smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`
- Batch 6 import repository non-regression smoke against Singapore self-hosted DB through SSH tunnel: `status=ok`

Singapore note:

- I did not replace the live app with this branch.
- Singapore route-level Batch 7 behavior was not tested against a branch temp container.
- Local route-level Batch 7 behavior was tested through a branch-built production app.
- No real external benchmark provider was called.

## Not Done / Out Of Scope

- No credits / usage migration.
- No OSS/COS adapter changes.
- No worker / FireRed / OpenStoryline / TTS changes.
- No pgvector/vector RPC changes.
- No real TikHub/benchmark provider validation.
- No main merge.
- No completion marker write.

## Push / Merge State

- `0c84a36` backup was pushed to Gitee before editing.
- New Batch 7 commit is local unless the user asks to push.
- `main` was not merged.

## Residual Risks

- Singapore Batch 7 route-level validation was not run on a branch-built Singapore temp container; only DB-level Batch 7 smoke ran against Singapore.
- Existing live Singapore app was intentionally not replaced.
- Real benchmark provider execution remains out of scope, so this validates repository persistence and safe material API routes, not provider correctness.

## Next Recommended Batch

Next batch should explicitly choose one of:

1. merchant credits / usage accounting migration as a separate accounting batch.
2. OSS adapter and storage-provider schema expansion as a separate storage batch.
3. worker / TTS / video provider domesticization as a separate runtime batch.

Keep each one isolated; do not combine credits, storage, and worker migration in one batch.
