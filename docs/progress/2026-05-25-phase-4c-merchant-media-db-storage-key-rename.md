# 2026-05-25 Phase 4C Merchant Media DB Storage Key Rename

## Scope

Phase 4B removed the current TypeScript/API/DTO camelCase legacy COS fields. This batch removes the remaining merchant-media database-layer COS column names from current runtime SQL.

Renamed current DB columns through a forward migration:

- `merchant_media_assets.source_cos_key` -> `source_storage_key`
- `merchant_media_clips.cos_key` -> `storage_key`
- `merchant_media_clips.thumb_cos_key` -> `thumb_storage_key`

The old table-creation migration remains historical. Current runtime repository SQL no longer reads or writes the old snake_case column names.

## Changed Files

- `app/db/migrations/202605250004_rename_merchant_media_storage_key_columns.sql`
  - Adds an idempotent forward rename migration.
  - Renames old columns only when the old column exists and the new column does not.
  - Replaces `merchant_media_assets_source_cos_key_check` with `merchant_media_assets_source_storage_key_check`.
  - New check expression uses `source_storage_key like 'merchant-media/%/originals/%/%'`.

- `app/src/lib/db/merchant-media-repository.ts`
  - `MerchantMediaAssetRow` now uses `source_storage_key`.
  - `MerchantMediaClipRow` now uses `storage_key` and `thumb_storage_key`.
  - SELECT / INSERT / UPSERT / mapper code now uses the new DB column names.
  - DTO output remains `sourceStorageKey`, `storageKey`, and `thumbStorageKey`.

- `app/src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs`
  - Asserts repository source no longer contains the old DB column names.
  - Asserts the new forward migration performs the rename and rebuilds the source storage key check.

## Validation

Passed:

```bash
cd app && node --test \
  src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs \
  src/lib/merchant-media-repository-contract.test.ts \
  src/server/api/merchant-media-manifest-service.test.ts \
  src/lib/private-media-download-service-core.test.ts \
  src/server/api/video-job-payload.test.ts
```

Result: 51 passed, 0 failed.

Passed:

```bash
cd app && npm run lint -- \
  src/lib/db/merchant-media-repository.ts \
  src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
```

Passed:

```bash
cd app && npm run typecheck -- --pretty false
```

Passed:

```bash
git diff --check
```

Passed:

```bash
rg -n -S "source_cos_key|thumb_cos_key|\bcos_key\b" app/src app/scripts
```

Result: no matches.

Confirmed new DB column names appear in the repository and forward migration:

```bash
rg -n -S "source_storage_key|thumb_storage_key|\bstorage_key\b" \
  app/src/lib/db/merchant-media-repository.ts \
  app/db/migrations/202605250004_rename_merchant_media_storage_key_columns.sql
```

## Explicitly Deferred

- No worker changes.
- No TypeScript/API reintroduction of legacy camelCase fields.
- No cleanup of historical migrations, docs, handoff, or progress.
- `app/db/migrations/202605250001_merchant_media_tables.sql` still documents the historical initial table shape and is followed by this forward rename migration.

Not pushed. Not deployed. Main worktree was not touched.
