# 2026-05-17 Self-hosted Import Repository

## Scope

Batch 6 migrated `import-repository.ts` persistence paths to ordinary self-hosted PostgreSQL:

- `import_jobs` create/get/list/update/count running
- `source_items` upsert/list/detail
- `imported_comments` upsert/list
- merchant-scoped import/source/comment reads
- source-item dedupe by external id or source URL
- imported-comment dedupe by external comment id

Out of scope remained untouched:

- real Apify/TikHub/provider calls
- material repository and `material_workbench_references`
- credits/usage accounting
- COS/OSS adapter
- worker / FireRed / OpenStoryline / TTS
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
- Existing DTO shapes were kept.
- `finished=true` on `updateImportJob()` sets `finished_at`.
- `upsertSourceItems()` keeps existing dedupe behavior:
  - `(merchant_id, platform, external_item_id)` when `external_item_id` exists
  - `(merchant_id, source_url)` when no `external_item_id`
- `upsertImportedComments()` keeps existing behavior:
  - comments with `external_comment_id` are upserted
  - comments without `external_comment_id` are inserted as distinct rows
- JSON fields round-trip through `jsonb`:
  - `input_payload`
  - `log_payload`
  - `engagement_snapshot`
  - `structure_summary`
  - `trace_payload`

## Changed Files

```text
app/src/lib/db/import-repository.ts
app/scripts/check-domestic-import-repository-smoke.mjs
docs/progress/2026-05-17-selfhost-import-repository.md
docs/handoff/2026-05-17-selfhost-import-repository-handoff.md
```

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-import-repository-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local smoke ran against a fresh ordinary PostgreSQL database initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

The same run started a branch-built local production app and executed:

```bash
node app/scripts/check-domestic-import-repository-smoke.mjs \
  --base-url http://127.0.0.1:34034
```

Result:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
http.status=ok
cleanup.status=ok
```

Covered checks:

- create/get/list import job
- count running jobs before and after status updates
- update job status, totals, error summary, log payload, and `finished_at`
- source item external-id dedupe/update
- source item source-URL dedupe/update
- comment source item creation semantics
- imported comment external-id dedupe/update
- imported comments without external IDs insert as distinct rows
- source item list/detail
- imported comments ordered by `sort_score`
- merchant scoping blocks cross-merchant access
- JSON round-trip

HTTP read checks covered:

- `/api/source-items`
- `/api/source-items/[id]`
- `/api/source-items/[id]/comments`
- `/api/import-jobs`
- `/api/import-jobs/[id]`
- cross-merchant source item read returns `404`

The smoke did not call real external scraping providers.

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` preflight: passed, `status=ok`, database tables present, COS env present, video-chain test entrypoint enabled.

New Batch 6 smoke against Singapore self-hosted PostgreSQL through SSH tunnel:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
importJobCreateGetList=true
runningCounts=true
importJobFinishedUpdate=true
sourceExternalDedupe=true
sourceUrlDedupe=true
ensureCommentSource=true
commentExternalDedupe=true
commentsWithoutExternalDistinct=true
listAndDetail=true
commentsOrdered=true
merchantScoping=true
jsonRoundTrip=true
cleanup.status=ok
```

Singapore non-regression:

- `check-domestic-platform-admin-management-smoke.mjs` against Singapore self-hosted PostgreSQL through SSH tunnel: `status=ok`.

Singapore note:

- I did not replace the live app with this branch.
- Singapore Batch 6 validation was DB-level against the live self-hosted PostgreSQL, plus live health/preflight.
- Route-level Batch 6 behavior was validated locally against a branch-built temp app.

## Backup / Push State

Before code changes, current `6d44f6d70cd0e11443f04e773c868dc47cdb7f6a` was pushed to Gitee:

```text
gitee/codex/domestic-infra-migration = 6d44f6d70cd0e11443f04e773c868dc47cdb7f6a
```

The new Batch 6 commit is local unless explicitly pushed later.
