# 2026-05-17 P0 Repository Migration Batch 6: Import Repository

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 5 platform admin management.

This batch migrates `import-repository.ts` write/read paths from Supabase Admin to self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, import jobs, source items, and imported comments can be created,
updated, listed, deduplicated, and read without Supabase Admin.
```

This is import repository persistence only. It is not material library, OSS, worker, credits, or real external scraping provider validation.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD before this batch:

```text
6d44f6d feat: add selfhost platform admin management
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -4
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-17-selfhost-platform-admin-management.md
docs/handoff/2026-05-17-selfhost-platform-admin-management-handoff.md
docs/progress/2026-05-16-full-supabase-exit-audit.md
```

Inspect before editing:

```text
app/src/lib/db/import-repository.ts
app/src/server/import-jobs/service.ts
app/src/app/api/import-jobs/**
app/src/app/api/source-items/**
app/src/lib/server-db/postgres.ts
app/db/migrations/202605130001_domestic_core_baseline.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

Use ordinary PostgreSQL when the app is in self-hosted PostgreSQL mode.

Use the existing helper pattern already used in this branch:

```text
isAppPostgresPreferred()
isAppPostgresConfigured()
queryAppDb()
withAppDbTransaction()
mapPostgresError()
```

If the current repository already uses `isPostgresVideoChainEnabled()` for partial read paths, either keep it if semantically equivalent or replace it with the app PostgreSQL helper pattern. Do not create a third preference rule.

Keep Supabase Admin fallback for legacy/staging paths.

Do not introduce in-memory fallback for import data unless it already exists.

### 4.2 Required functions

In:

```text
app/src/lib/db/import-repository.ts
```

Implement self-hosted PostgreSQL paths for:

```text
createImportJob
getImportJobById
listImportJobs
countRunningImportJobs
updateImportJob
upsertSourceItems
ensureSourceItemForComments
upsertImportedComments
listSourceItems
getSourceItemById
listImportedComments
```

Expected behavior:

- `import_jobs` create/list/get/update remains merchant-scoped.
- `countRunningImportJobs` returns both merchant-running and global-running counts.
- `finished=true` sets `finished_at`.
- `source_items` upsert keeps current dedupe behavior:
  - with `external_item_id`: conflict on `(merchant_id, platform, external_item_id)`
  - without `external_item_id`: conflict on `(merchant_id, source_url)`
- `imported_comments` upsert keeps current behavior:
  - with `external_comment_id`: conflict on `(source_item_id, external_comment_id)`
  - without `external_comment_id`: insert as distinct comments
- `ensureSourceItemForComments` still creates a detail source item for comment imports.
- JSON fields round-trip:
  - `input_payload`
  - `log_payload`
  - `engagement_snapshot`
  - `structure_summary`
  - `trace_payload`
- Existing DTO shape does not change.

### 4.3 Transaction guidance

Use transactions where consistency matters, especially when a smoke or service-level path creates an import job and immediately writes source items/comments.

Do not add new schema unless a proven mismatch blocks the migration. If schema is missing something, prefer documenting it and adding a small additive migration only if required.

### 4.4 API/service boundaries

The import service may call external providers. This batch should not require real Apify/TikHub/Xiaohongshu provider calls.

Use controlled fake `NormalizedSourceItem` and `NormalizedComment` data in smoke tests.

If testing API routes, prefer routes that exercise repository persistence without relying on real external provider credentials.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
material-library-repository.ts
material_workbench_references
daily-content-task-repository.ts
content-draft-repository.ts
media-repository.ts
merchant credits/usage accounting
Aliyun OSS adapter
storage provider abstraction changes
worker / FireRed / OpenStoryline / TTS
pgvector / vector RPC
main merge
```

Do not require:

```text
real external scraping provider calls
real model call
real embedding call
real file upload
normal FireRed
voiceover/TTS
```

## 6. Smoke Script

Add a focused self-hosted smoke, suggested:

```text
app/scripts/check-domestic-import-repository-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required tables exist:
  - `import_jobs`
  - `source_items`
  - `imported_comments`
  - `merchant_profiles`
  - `app_users`
- create a merchant/user fixture or reuse a safe existing fixture
- create import job
- get/list import job by merchant
- count running jobs before/after status update
- update import job to running/succeeded/failed-style fields and `finished_at`
- upsert source item with external ID, then upsert same external ID again and prove dedupe/update
- upsert source item without external ID using source URL conflict
- ensure source item for comments
- upsert imported comments with external IDs and prove dedupe/update
- insert comments without external IDs as distinct comments
- list source items
- get source item by id
- list imported comments ordered by sort score
- merchant scoping blocks cross-merchant access
- cleanup removes temporary import jobs/source items/comments/merchant fixture
- rerun is safe

If practical, support `--base-url` for a small HTTP smoke through source-items/comment routes using an app-owned merchant session. DB-level smoke is acceptable if real import-job API would call external providers.

## 7. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-import-repository-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Run the new smoke against a local ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Singapore validation:

- Confirm live `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new import repository smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - platform admin management smoke, or
  - agent admin writes smoke, or
  - knowledge repository smoke.

Do not require normal FireRed, TTS/voiceover, OSS, or pgvector in this batch.

## 8. Guardrails

Do not write:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark `.codex/long-task/active.json` complete.

Do not merge to `main`.

Do not print secrets, provider tokens, database URLs, or user passwords.

If any runtime env on Singapore is changed, record exactly what changed without revealing secret values.

## 9. Deliverables

Commit code and docs locally on `codex/domestic-infra-migration`.

Expected docs:

```text
docs/progress/2026-05-17-selfhost-import-repository.md
docs/handoff/2026-05-17-selfhost-import-repository-handoff.md
```

The final response should include:

- final HEAD commit
- changed files
- local validation result
- Singapore validation result
- whether pushed to Gitee
- whether worktree is clean
- residual risks
- recommended next batch

