# 2026-05-17 Self-hosted Material Library Repository

## Scope

Batch 7 migrated material library persistence to ordinary self-hosted PostgreSQL:

- material library item create/list/get paths in `source_items`
- provider cache read and provider item upsert paths in `source_items`
- URL, external ID, and source URL dedupe behavior
- workbench reference create/get/list/consume paths in `material_workbench_references`
- selected-for-rewrite flag update when sending material to workbench

Out of scope remained untouched:

- credits / usage accounting
- COS / OSS adapter
- worker / FireRed / OpenStoryline / TTS
- real benchmark provider calls
- pgvector / vector RPC
- main merge
- completion markers

## Implementation Notes

- PostgreSQL mode uses the existing app database helpers:
  - `isAppPostgresConfigured()`
  - `isAppPostgresPreferred()`
  - `queryAppDb()`
  - `withAppDbTransaction()`
  - `mapPostgresError()`
- Supabase Admin fallback remains for legacy/staging paths.
- Demo in-memory fallback now applies only when neither app PostgreSQL nor Supabase Admin is configured.
- Material rows are still stored in `source_items` and identified by `trace_payload.materialLibrary = true`.
- Workbench references now use `material_workbench_references` as the primary self-hosted path.
- Creating a workbench reference validates merchant-scoped material ownership and marks `source_items.is_selected_for_rewrite = true`.
- Consuming a workbench reference sets `status = consumed`, `draft_id`, and `consumed_at`.

## Changed Files

```text
app/src/lib/db/material-library-repository.ts
app/scripts/check-domestic-material-library-smoke.mjs
docs/progress/2026-05-17-selfhost-material-library.md
docs/handoff/2026-05-17-selfhost-material-library-handoff.md
```

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-material-library-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local full smoke ran against a fresh ordinary PostgreSQL database initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

The same run started a branch-built local production app and executed:

```bash
node app/scripts/check-domestic-material-library-smoke.mjs \
  --base-url http://127.0.0.1:<temp-port>
```

Result:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
http.status=ok
cleanup.status=ok
```

Covered direct checks:

- required table presence
- manual material create/list/get
- duplicate URL returns existing material
- provider cache read
- provider external ID dedupe/update
- provider source URL dedupe/update
- article and video workbench reference creation
- reference read
- reference consume with draft
- list references by draft
- selected-for-rewrite flag update
- merchant scoping blocks cross-merchant material/reference access

Covered HTTP checks:

- `POST /api/materials`
- `GET /api/materials`
- `POST /api/materials/[materialId]/send-to-workbench`
- cross-merchant send-to-workbench returns `404`

The smoke did not call real external benchmark providers.

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` preflight: passed, `status=ok`, database tables present, COS env present, video-chain test entrypoint enabled.

New Batch 7 smoke against Singapore self-hosted PostgreSQL through SSH tunnel:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
manualCreate=true
duplicateUrlReturnsExisting=true
listMaterials=true
getMaterial=true
retrievalTargetData=true
providerExternalDedupe=true
providerUrlDedupe=true
providerCacheRead=true
articleReferenceCreate=true
videoReferenceCreate=true
referenceRead=true
referenceConsume=true
listReferencesByDraft=true
selectedForRewrite=true
merchantScoping=true
cleanup.status=ok
```

Singapore non-regression:

- `check-domestic-import-repository-smoke.mjs` against Singapore self-hosted PostgreSQL through SSH tunnel: `status=ok`.

Singapore note:

- I did not replace the live Singapore app with this branch.
- New route-level Batch 7 behavior was validated locally against a branch-built production app.
- Singapore Batch 7 validation was DB-level against the live self-hosted PostgreSQL, plus live health/preflight.

## Backup / Push State

Before code changes, current `0c84a36bef7ff6eb0f3f7baf42e17cc19a5135d4` was already pushed to Gitee:

```text
gitee/codex/domestic-infra-migration = 0c84a36bef7ff6eb0f3f7baf42e17cc19a5135d4
```

The new Batch 7 commit is local unless explicitly pushed later.
