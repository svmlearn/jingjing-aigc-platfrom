# 2026-05-25 Phase 4A Upload Intent CosKey Removal

## Scope

Phase 4A only removed the legacy `cosKey` browser upload intent alias from the current app upload path. It did not touch merchant-media `sourceCosKey` / `cosKey` / `thumbCosKey`, DB columns such as `source_cos_key` / `cos_key` / `thumb_cos_key`, worker code, provider deletion work, historical migrations, or historical docs.

## Changes

- Removed `MediaUploadIntentDto.cosKey` from `app/src/contracts/media.ts`.
- Updated the object-storage upload intent key helper to return only `storageKey` and `uploadKey`.
- Kept Aliyun OSS browser upload intents on the shared `storageKey` / `uploadKey` helper without emitting `cosKey`.
- Updated frontend `createUploadIntent()` to read only `storageKey` / `storage_key` / `uploadKey` / `upload_key`.
- Updated domestic video-chain smoke scripts to require `storageKey` or `uploadKey`, removing the old `cosKey` fallback and `storageKey|uploadKey|cosKey` shape message.
- Updated upload intent contract tests to assert the DTO, object-storage helper, provider method, and frontend parsing no longer use the removed legacy key alias.

## Preserved

- `storageKey` and `uploadKey` remain required current upload intent fields.
- Aliyun OSS remains the only app runtime object storage provider.
- Merchant-media compatibility fields and database columns with COS names remain intentionally untouched for later batches.

## Validation

- `cd app && node --test src/server/storage/upload-intent-phase-3j-contract.test.mjs src/server/storage/app-storage-provider-phase-3k-contract.test.mjs src/lib/ui/video-workflow-phase-3i-contract.test.mjs src/lib/media-upload-contract.test.ts` passed: 18 tests passed.
- `cd app && npm run lint -- src/contracts/media.ts src/server/storage/object-storage.ts src/server/storage/aliyun-oss-provider.ts src/server/storage/upload-intent-phase-3j-contract.test.mjs src/server/storage/app-storage-provider-phase-3k-contract.test.mjs src/lib/ui/video-workflow.ts src/lib/ui/video-workflow-phase-3i-contract.test.mjs src/lib/media-upload-contract.test.ts scripts/check-domestic-video-chain-api-smoke.mjs scripts/check-domestic-video-chain-worker-smoke.mjs` passed.
- `cd app && npm run typecheck -- --pretty false` passed.
- `git diff --check` passed.
- `rg -n -S "cosKey|cos_key" app/src/contracts/media.ts app/src/server/storage app/src/lib/ui/video-workflow.ts app/scripts/check-domestic-video-chain-api-smoke.mjs app/scripts/check-domestic-video-chain-worker-smoke.mjs` returned no matches.

## Remaining Items

- Merchant media DTO/repository aliases remain as a separate compatibility cleanup surface.
- DB column renames remain out of scope.
- No push, deploy, merge, or main-worktree changes were performed.
