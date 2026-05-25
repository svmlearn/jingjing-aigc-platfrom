# 2026-05-25 Supabase / COS Removal Final Audit

## Context

- Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`
- Branch: `codex/remove-supabase-cos-legacy-longrun`
- Audit date: 2026-05-26 Asia/Shanghai
- Current head before this audit document: `14c284a fix: rename merchant media storage key columns`

This is a readiness audit only. No runtime code was changed in this batch.

## Phase Summary

### Auth / Session

- `316b0de fix: remove supabase auth fallback`
- `8d166ed fix: revoke merchant session when profile check fails`

Auth/session now uses app-owned / domestic sessions. Merchant/member/platform login paths no longer use Supabase Auth fallback, and failed merchant profile checks revoke the just-created domestic session.

### Repository Supabase Fallback Removal

- `a1a45cf docs: map repository supabase fallback removal`
- `f73ae00 fix: remove supabase fallback from content repositories`
- `f772473 fix: persist production scenes in postgres content variants`
- `7d5203a fix: remove supabase fallback from merchant repository`
- `b883310 fix: remove supabase fallback from merchant strategy assets`
- `47d0fbb fix: remove supabase fallback from material library repository`
- `6cdb87d fix: remove supabase fallback from knowledge repository`
- `a2e7804 fix: remove supabase fallback from platform admin repository`
- `88d73ad fix: remove supabase fallback from voice profile repository`
- `8df03a9 fix: preserve local demo voice profile creation`
- `5e069f9 fix: remove supabase fallback from content generation repository`
- `cde9041 fix: remove supabase fallback from consultation repository`
- `b59f55d fix: remove supabase fallback from import repository`
- `ad23f3b fix: remove supabase fallback from agent console repository`
- `fca31b7 fix: remove supabase fallback from merchant media repository`
- `b9351cd fix: enforce merchant media ready clip contract`
- `9c67105 fix: remove supabase gate from video edit service`

Repository/service runtime paths now use PostgreSQL app DB helpers. Supabase admin client fallback and Supabase `.from(...)` / RPC paths have been removed from the repository batches covered by this long-running branch.

### App Supabase Helper / Package Cleanup

- `7b8c108 fix: remove app supabase helpers and dependencies`
- `13e20dd fix: remove worker supabase database env fallback`

The app runtime no longer keeps Supabase client shims, Supabase package dependencies, or Supabase env examples. The worker database connection path uses `WORKER_DATABASE_URL` only.

### Storage Provider Cleanup

- `edb0d00 docs: map storage cos oss legacy cleanup`
- `a4a3f97 fix: stop new supabase storage provider writes`
- `6d1f30a fix: reject supabase storage in media complete schema`
- `ce72026 fix: remove supabase storage from current contracts`
- `a35ac93 refactor: make object preview the primary media route`
- `b44ae4c refactor: route private media through object storage`
- `5567682 feat: add storage key aliases to merchant media`
- `2b19472 refactor: propagate storage key aliases in private media`
- `00740ae fix: merge private media storage key aliases`
- `86396cf refactor: use object storage naming in video workflow uploads`
- `00008be fix: normalize upload intent legacy key alias`
- `670a5fa fix: make upload intents storage key first`
- `11695af fix: remove app tencent cos storage provider`
- `5e25a98 fix: remove app script tencent cos leftovers`
- `caad88d fix: remove worker tencent cos storage support`

Current app and worker runtime storage provider support is Aliyun OSS / object storage. `supabase_storage` and `tencent_cos` are no longer current contract/provider values. Tencent COS runtime providers and package dependencies were removed from app and worker non-vendor runtime paths.

### COS Key Naming Cleanup

- `bb4c640 fix: remove upload intent cos key alias`
- `a5ed097 fix: remove merchant media camel cos key aliases`
- `14c284a fix: rename merchant media storage key columns`

Current TypeScript/API/DTO fields use provider-neutral key names:

- `sourceStorageKey`
- `storageKey`
- `thumbStorageKey`

Merchant-media repository SQL now uses DB columns:

- `source_storage_key`
- `storage_key`
- `thumb_storage_key`

Historical table-creation migration files still show earlier COS column names, followed by forward rename migration `202605250004_rename_merchant_media_storage_key_columns.sql`.

## Runtime Surface Scan

Command:

```bash
rg -n -S "Supabase|supabase|SUPABASE|@supabase|supabase_storage|tencent_cos|Tencent COS|COS_|cos://|cos-preview|cos-nodejs-sdk-v5|qcloud|WORKER_COS|cos_client|sourceCosKey|thumbCosKey|\bcosKey\b|source_cos_key|thumb_cos_key|\bcos_key\b" \
  app/src app/scripts app/package.json app/pnpm-lock.yaml app/.env.example workers/video-worker \
  --glob '!workers/video-worker/openstoryline/**' \
  --glob '!**/*.test.*' \
  --glob '!**/*contract.test.mjs'
```

Result: no matches.

Conclusion: no runtime-source blocker found for Supabase client/runtime, Supabase storage provider, Tencent COS provider/runtime, worker COS env fallback, COS preview route, or current camel/snake COS key fields.

## Historical Residual Matrix

Historical/document/migration scan command:

```bash
rg -n -S "Supabase|supabase|SUPABASE|supabase_storage|tencent_cos|Tencent COS|COS_|cos://|cos-preview|source_cos_key|thumb_cos_key|\bcos_key\b" \
  docs app/db app/supabase workers/video-worker \
  --glob '!workers/video-worker/openstoryline/**'
```

The command returns historical matches. They are categorized below.

| Area | Classification | Examples | Blocking? | Decision |
| --- | --- | --- | --- | --- |
| `docs/handoff/**` | historical handoff | old Supabase/COS staging runbooks and task briefs | No | Keep. These record past work and should not be scrubbed in readiness audit. |
| `docs/progress/**` | historical progress plus cleanup evidence | old Supabase/COS progress, plus new cleanup progress files | No | Keep. New cleanup docs intentionally mention removed terms as evidence. |
| `docs/test/**`, `docs/探索/**`, `docs/架构规范/**` | historical plans/tests/architecture notes | old staging COS/Supabase acceptance plans and design docs | No | Keep unless a separate docs-modernization task is opened. |
| `docs/README.md`, `docs/历史架构与非当前口径索引.md` | current documentation that explicitly marks old architecture as historical | current docs say Supabase/COS are old/historical or legacy | No | Keep; useful guardrail for future agents. |
| `app/supabase/migrations/**` | historical migration archive | old staging Supabase migrations with `supabase_storage`, `tencent_cos`, and COS column names | No | Keep as archive. User explicitly canceled deleting this directory. |
| old `app/db/migrations/**` | migration history | baseline/foundation migrations contain old provider/column names | No | Keep. Later forward migrations remove `supabase_storage`, `tencent_cos`, and rename merchant-media storage key columns. |
| `app/db/migrations/202605250002_remove_supabase_storage_provider.sql` | forward cleanup migration | preflight guard for `supabase_storage`, rebuilt constraints | No | Required cleanup evidence. |
| `app/db/migrations/202605250003_remove_tencent_cos_provider.sql` | forward cleanup migration | preflight guard for `tencent_cos`, rebuilt constraints | No | Required cleanup evidence. |
| `app/db/migrations/202605250004_rename_merchant_media_storage_key_columns.sql` | forward cleanup migration | renames old merchant-media DB columns to storage-key names | No | Required cleanup evidence. |
| `workers/video-worker` non-vendor | runtime worker code/docs/examples | scan returned no matches outside excluded vendor path | No | Clean for this audit. |
| `workers/video-worker/openstoryline/**` | vendor directory excluded by command | historical/vendor code may use COS-like strings | No | Not modified by this project cleanup unless a separate vendor-fork task is created. |

## Validation

Passed:

```bash
cd app && node --test \
  src/lib/auth/postgres-auth-p0-contract.test.mjs \
  src/server/storage/app-storage-provider-phase-3k-contract.test.mjs \
  src/server/storage/upload-intent-phase-3j-contract.test.mjs \
  src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs \
  src/lib/merchant-media-repository-contract.test.ts \
  src/server/api/merchant-media-manifest-service.test.ts \
  src/server/api/video-job-payload.test.ts
```

Result: 61 passed, 0 failed.

Passed:

```bash
cd app && npm run typecheck -- --pretty false
```

Passed:

```bash
python3 -m py_compile \
  workers/video-worker/worker/app/config.py \
  workers/video-worker/worker/app/models.py \
  workers/video-worker/worker/app/main.py \
  workers/video-worker/worker/app/processor.py \
  workers/video-worker/worker/app/real_io_smoke.py \
  workers/video-worker/worker/app/object_storage_client.py
```

Passed:

```bash
git diff --check
```

`git status --short --branch` before this audit document was clean on `codex/remove-supabase-cos-legacy-longrun`.

## Merge Readiness

Recommendation: this branch is ready for local code review and, if review accepts the scope, a local merge/cherry-pick back to `main`.

No runtime blockers were found by the required scan. The minimum regression suite passed.

## Merge / Deployment Risks

1. Real database migration execution was not performed in this audit. Before deployment, an operator should verify real DB data for guarded migrations:
   - `storage_provider = 'supabase_storage'`
   - `storage_provider = 'tencent_cos'`
   - merchant media table column state before applying `202605250004_rename_merchant_media_storage_key_columns.sql`

2. This audit did not run a full app lint/test suite or real end-to-end smoke. It ran the requested minimum regression set plus TypeScript typecheck and worker Python compile.

3. Historical docs and migrations still contain Supabase/COS terminology by design. They are not runtime blockers and should not be interpreted as current architecture.

4. `app/supabase/migrations/**` remains as a historical archive. It was intentionally not moved or deleted.

## Final Status

- Runtime Supabase dependency: removed.
- App Supabase packages/client shims/env examples: removed.
- Auth/session Supabase fallback: removed.
- Repository Supabase admin fallback: removed across the cleaned batches.
- Worker `SUPABASE_DB_URL` fallback: removed.
- Current `supabase_storage` contract/write path: removed.
- App and worker Tencent COS runtime provider: removed.
- Current `tencent_cos` provider support: removed.
- Current `cosKey` / `sourceCosKey` / `thumbCosKey` TypeScript/API fields: removed.
- Merchant-media DB current repository columns: `source_storage_key`, `storage_key`, `thumb_storage_key`.

No push. No deployment. Did not switch to or modify main.
