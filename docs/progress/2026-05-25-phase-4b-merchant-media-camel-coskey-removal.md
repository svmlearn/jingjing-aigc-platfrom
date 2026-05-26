# 2026-05-25 Phase 4B Merchant Media Camel COS Key Removal

## Scope

This batch removes the current TypeScript/API/DTO/runtime contract use of legacy camelCase COS key fields in merchant media:

- Removed `sourceCosKey` from current merchant media asset contracts.
- Removed `cosKey` from current private media clip contracts.
- Removed `thumbCosKey` from current private media clip contracts.
- Current app code now uses `sourceStorageKey`, `storageKey`, and `thumbStorageKey`.

This batch deliberately does not rename database columns. PostgreSQL still stores merchant media object keys in the existing columns:

- `source_cos_key`
- `cos_key`
- `thumb_cos_key`

Those column names remain repository-internal compatibility details until a future DB-column migration is explicitly planned.

## Changed Runtime Files

- `app/src/lib/merchant-media-library-contract.ts`
  - Made `sourceStorageKey` required for `MerchantMediaAssetRecord`.
  - Removed `sourceCosKey`.
  - `getMerchantMediaAssetStorageKey()` now reads only `sourceStorageKey`.

- `app/src/lib/private-media-pexels-adapter.ts`
  - Made `storageKey` required for `PrivateMediaClipRecord`.
  - Removed `cosKey` and `thumbCosKey`.
  - Search/Pexels response code now relies on provider-neutral fields.

- `app/src/lib/merchant-media-repository-contract.ts`
  - Removed legacy alias normalization for `sourceCosKey`, `cosKey`, and `thumbCosKey`.
  - InMemory repository and shared ready-clip assertions now accept only provider-neutral storage keys.
  - Added explicit `thumbStorageKey` validation for ready clips.

- `app/src/lib/merchant-media-manifest.ts`
  - Manifest request/result contracts now accept only `sourceStorageKey`, `storageKey`, and `thumbStorageKey`.
  - Removed legacy conflict-resolution logic because legacy camelCase fields are no longer accepted.
  - Error messages now use storage-key wording.

- `app/src/lib/db/merchant-media-repository.ts`
  - Row mappers output only provider-neutral key fields.
  - Inserts/upserts read provider-neutral fields and still write existing snake_case DB columns.

- `app/src/lib/private-media-download-service-core.ts`
- `app/src/lib/private-media-pexels-service-core.ts`
- `app/src/lib/private-media-fixture-repository.ts`
- `app/src/lib/media-processing-contract.ts`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/schemas.ts`
  - Updated consumers and schemas to use only provider-neutral current fields.

## Tests Updated

- `app/src/lib/merchant-media-repository-contract.test.ts`
- `app/src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs`
- `app/src/server/api/merchant-media-manifest-service.test.ts`
- `app/src/lib/private-media-download-service-core.test.ts`
- `app/src/lib/private-media-doctor.test.ts`
- `app/src/lib/private-media-pexels-adapter.test.ts`
- `app/src/server/api/video-job-payload.test.ts`
- `app/src/lib/media-processing-contract.test.ts`
- Related private-media fixture/service tests touched by type coverage.

The tests now cover current storage-key contracts instead of legacy alias conflict compatibility.

## Validation

Passed:

```bash
cd app && node --test \
  src/lib/merchant-media-repository-contract.test.ts \
  src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs \
  src/server/api/merchant-media-manifest-service.test.ts \
  src/lib/private-media-download-service-core.test.ts \
  src/lib/private-media-doctor.test.ts \
  src/lib/private-media-pexels-adapter.test.ts \
  src/server/api/video-job-payload.test.ts \
  src/lib/media-processing-contract.test.ts
```

Result: 71 passed, 0 failed.

Passed:

```bash
cd app && npm run lint -- \
  src/lib/merchant-media-library-contract.ts \
  src/lib/private-media-pexels-adapter.ts \
  src/lib/merchant-media-repository-contract.ts \
  src/lib/merchant-media-manifest.ts \
  src/lib/db/merchant-media-repository.ts \
  src/lib/private-media-download-service-core.ts \
  src/lib/private-media-pexels-service-core.ts \
  src/lib/private-media-fixture-repository.ts \
  src/lib/media-processing-contract.ts \
  src/server/api/video-job-payload.ts \
  src/server/api/schemas.ts
```

Passed:

```bash
cd app && npm run typecheck -- --pretty false
```

Passed:

```bash
rg -n -S "sourceCosKey|thumbCosKey|\bcosKey\b" app/src app/scripts --glob '!**/*.test.*' --glob '!**/*contract.test.mjs'
```

Result: no runtime camelCase legacy COS key field matches.

## Explicitly Deferred

- No DB column rename in this batch.
- No migration added.
- No worker changes.
- No historical docs/handoff/progress cleanup.
- Existing snake_case DB columns remain intentionally as internal repository mappings.

Not pushed. Not deployed. Main worktree was not touched.
