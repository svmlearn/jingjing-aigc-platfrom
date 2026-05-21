# 2026-05-17 P0 Repository Migration Batch 7: Material Library

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 6 import repository.

This batch migrates `material-library-repository.ts` and `material_workbench_references` from Supabase Admin to self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, material library items and workbench references can be
created, listed, deduplicated, ranked, queued, consumed, and read without Supabase Admin.
```

This is material repository persistence only. It is not OSS/storage adapter work, worker, credits, or real external provider validation.

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
0c84a36 feat: add selfhost import repository
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
docs/progress/2026-05-17-selfhost-import-repository.md
docs/handoff/2026-05-17-selfhost-import-repository-handoff.md
docs/progress/2026-05-16-full-supabase-exit-audit.md
```

Inspect before editing:

```text
app/src/lib/db/material-library-repository.ts
app/src/server/api/material-library-service.ts
app/src/server/api/content-generation-service.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/lib/material-retrieval.ts
app/src/lib/material-routing.ts
app/src/contracts/material.ts
app/src/lib/server-db/postgres.ts
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

Use ordinary PostgreSQL when the app is in self-hosted PostgreSQL mode.

Use the existing helper pattern:

```text
isAppPostgresPreferred()
isAppPostgresConfigured()
queryAppDb()
withAppDbTransaction()
mapPostgresError()
```

Keep Supabase Admin fallback for legacy/staging paths.

Keep in-memory demo fallback only when neither app PostgreSQL nor Supabase Admin is configured.

### 4.2 Material library items

In:

```text
app/src/lib/db/material-library-repository.ts
```

Implement self-hosted PostgreSQL paths for:

```text
listMaterialLibraryItems
getMaterialLibraryItemById
createMaterialLibraryItem
listCachedMaterialProviderItems
upsertMaterialLibraryItemsFromProvider
findExistingMaterialByUrl internal helper
markMaterialSelectedForRewrite internal helper
```

Expected behavior:

- Material items continue to be stored in `source_items`.
- Material rows are identified by `trace_payload.materialLibrary = true`.
- `createMaterialLibraryItem` writes:
  - `structure_summary.materialType`
  - `structure_summary.materialStatus`
  - `structure_summary.materialSourceKind`
  - `structure_summary.materialUsageType`
  - `structure_summary.retrievalTargets`
  - `trace_payload.materialLibrary = true`
  - `trace_payload.materialAnalysis`
  - `trace_payload.createdByUserId`
- URL duplicate handling stays compatible:
  - duplicate `source_url` for same merchant returns the existing material where current behavior does so.
- Provider cache reads filter by:
  - `platform`
  - `created_at >= cutoff`
  - `trace_payload.materialProvider`
  - `trace_payload.materialProviderCacheKey`
- Provider upsert keeps existing dedupe behavior:
  - with `external_item_id`: match/update by merchant + platform + external ID
  - with `source_url`: match/update by merchant + source URL
  - otherwise insert
- Ranking behavior remains delegated to `rankMaterialLibraryItemsForRetrieval`.
- Existing DTO shape does not change.

### 4.3 Workbench references

Implement self-hosted PostgreSQL paths for:

```text
createMaterialWorkbenchReference
getMaterialWorkbenchReference
listMaterialWorkbenchReferencesByDraft
consumeMaterialWorkbenchReference
appendTracePayloadReferenceConsumption internal helper, if still needed for legacy fallback
```

Expected behavior:

- Primary self-hosted path uses `material_workbench_references`.
- Creating a reference validates the material belongs to the merchant and is a material-library item.
- Creating a reference marks the material `is_selected_for_rewrite = true`.
- Consuming a reference sets:
  - `status = consumed`
  - `draft_id`
  - `consumed_at`
- `target_workbench` remains constrained to `article | video`.
- Merchant scoping is enforced on all reads/updates.
- The old trace-payload fallback can remain only for legacy missing-table scenarios, but it must not be the primary self-hosted path now that the foundation migration creates `material_workbench_references`.

### 4.4 API/service boundaries

Do not require real benchmark provider calls.

Use controlled fake provider/material data in smoke tests.

If testing API routes, prefer routes that exercise repository persistence without relying on real external provider credentials.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
import-repository.ts further changes unless needed for compatibility
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
real external benchmark/provider calls
real model call
real embedding call
real file upload
normal FireRed
voiceover/TTS
```

## 6. Smoke Script

Add a focused self-hosted smoke, suggested:

```text
app/scripts/check-domestic-material-library-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required tables exist:
  - `source_items`
  - `material_workbench_references`
  - `merchant_profiles`
  - `app_users`
  - `content_drafts` if testing consumed reference with draft
- create a merchant/user fixture or reuse a safe existing fixture
- create manual material item
- list material items
- get material item by id
- ranking/filtering by retrieval target and query works
- duplicate URL returns or updates consistently with current contract
- provider cache write/read works
- provider upsert by external ID dedupes/updates
- provider upsert by source URL dedupes/updates
- create workbench reference for article
- create workbench reference for video
- get reference by id
- list references by draft after consume
- consume reference with draft id
- selected-for-rewrite flag is updated
- merchant scoping blocks cross-merchant access
- cleanup removes temporary references, source_items, drafts, merchant/user fixture
- rerun is safe

If practical, support `--base-url` for small HTTP checks:

- `GET /api/materials`
- `POST /api/materials`
- `POST /api/materials/[materialId]/send-to-workbench`

Avoid routes that require real external provider credentials.

## 7. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-material-library-smoke.mjs
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
- Run the new material library smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - import repository smoke, or
  - platform admin management smoke, or
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
docs/progress/2026-05-17-selfhost-material-library.md
docs/handoff/2026-05-17-selfhost-material-library-handoff.md
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

