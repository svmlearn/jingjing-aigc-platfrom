# Phase 3J Upload Intent Storage Key Contract

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Make server-issued browser upload intents storage-key first. The current contract is `storageKey` / `uploadKey`; `cosKey` remains only as a deprecated compatibility alias for older browser clients.

This batch does not remove Tencent COS runtime support, change COS env names, touch worker storage, rename DB columns, or edit historical Supabase migrations.

## Changes

- `app/src/contracts/media.ts`
  - `MediaUploadIntentDto.storageKey` and `MediaUploadIntentDto.uploadKey` are now required.
  - `cosKey` remains optional and is explicitly documented as a deprecated legacy client alias.
- `app/src/server/storage/object-storage.ts`
  - Added `buildBrowserUploadIntentStorageKeys(storageKey)` so provider implementations emit one resolved object key as:
    - `storageKey`
    - `uploadKey`
    - deprecated `cosKey`
- `app/src/server/storage/aliyun-oss-provider.ts`
  - Browser upload intent now spreads the shared key helper.
  - Aliyun remains the OSS-first browser upload path and still returns signed PUT URL fields.
- `app/src/server/storage/tencent-cos-provider.ts`
  - Browser upload intent now spreads the shared key helper.
  - Tencent COS remains runtime compatibility and still returns temporary credential fields.
- `app/src/server/storage/upload-intent-phase-3j-contract.test.mjs`
  - Added source contract coverage that `storageKey` / `uploadKey` are required.
  - Added coverage that both providers use the shared helper and cannot hand-roll a current response containing only legacy `cosKey`.

## Deliberately Left Alone

- `tencent_cos` remains supported as a compatibility provider.
- `cosKey` remains in the response as a deprecated alias equal to the resolved storage key.
- COS env names and Tencent SDK provider files remain.
- Worker storage, DB migrations, DB column names, and `app/supabase/migrations` were not changed.

## Validation

Passed:

```bash
cd app && node --test src/lib/media-upload-contract.test.ts
cd app && node --test src/server/storage/upload-intent-phase-3j-contract.test.mjs
cd app && npm run lint -- src/contracts/media.ts src/server/storage/object-storage.ts src/server/storage/aliyun-oss-provider.ts src/server/storage/tencent-cos-provider.ts src/server/storage/upload-intent-phase-3j-contract.test.mjs
cd app && npm run typecheck -- --pretty false
git diff --check
rg -n -S "cosKey: input.storageKey|@deprecated|storageKey\\?:|uploadKey\\?:" app/src/contracts/media.ts app/src/server/storage app/src/server/api/media-service.ts
```

The final `rg` returned only the intentional deprecated alias marker in `MediaUploadIntentDto` and the Phase 3J contract test assertion. It returned no `storageKey?:`, no `uploadKey?:`, and no provider-level `cosKey: input.storageKey` hand-written response.
