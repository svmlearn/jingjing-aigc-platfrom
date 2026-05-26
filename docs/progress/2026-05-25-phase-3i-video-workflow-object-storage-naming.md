# Phase 3I Video Workflow Object Storage Naming

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Move the current frontend upload workflow toward object storage / OSS-first naming while preserving Tencent COS compatibility.

This batch only touches the app-side frontend upload chain. It does not change worker storage, database columns, object-storage providers, env names, or `tencent_cos` runtime compatibility.

## Changes

- `app/src/lib/ui/video-workflow.ts`
  - `UploadIntent` keeps `storageKey` and `uploadKey` as current primary fields.
  - `cosKey` remains only as a legacy compatibility alias for older callers.
  - `createUploadIntent(...)` now resolves object keys from `storageKey` / `uploadKey` first, then falls back to `cosKey` / `cos_key` / `key`.
  - Aliyun OSS upload path does not read or depend on `cosKey`.
  - Tencent compatibility upload path uses `getUploadObjectKey(...)` and passes the resolved object key into the Tencent browser SDK as `Key`.
  - Old user-facing messages such as "upload to COS", "COS temporary credentials", and "COS timeout" were replaced with generic object storage wording or explicit legacy Tencent compatibility wording.
  - `uploadToCos(...)` was renamed to `uploadToTencentCompatibleObjectStorage(...)`.
- `app/src/lib/ui/video-workflow-phase-3i-contract.test.mjs`
  - Added source contract coverage for upload intent key resolution order.
  - Added coverage that Aliyun OSS upload path does not depend on `cosKey`.
  - Added coverage that the Tencent compatibility branch passes a provider-neutral object key to the SDK.
  - Added coverage that old COS user-facing error phrases are gone.

## Deliberately Left Alone

- `tencent_cos` remains supported.
- Tencent browser SDK loading remains, because the compatibility provider still has runtime consumers.
- Local names tied directly to the Tencent SDK remain in the small compatibility boundary:
  - `BrowserCosClient`
  - `BrowserCosConstructor`
  - `COS_SDK_URL`
  - `window.COS`
- `cosKey` remains as an `UploadIntent` legacy alias and is returned equal to the resolved object key.
- No DB migration or column rename was performed.
- Worker storage and provider/env files were not changed.

## Validation

Passed:

```bash
cd app && node --test src/lib/ui/video-workflow-phase-3i-contract.test.mjs
cd app && npm run lint -- src/lib/ui/video-workflow.ts src/lib/ui/video-workflow-phase-3i-contract.test.mjs
cd app && npm run typecheck -- --pretty false
git diff --check
rg -n -S "上传到 COS|COS 临时凭证|COS SDK 不支持|COS 超时|cosKey" app/src/lib/ui/video-workflow.ts
```

The final `rg` returned no matches for old user-facing COS upload phrases. Remaining `cosKey` matches are the intentional legacy alias read/write points.

## Review Follow-up: Legacy `cosKey` Alias Consistency

Issue:

- `createUploadIntent(...)` previously resolved `storageKey` / `uploadKey` from provider-neutral fields first, but resolved `cosKey` from legacy `cosKey` / `cos_key` first.
- During the transition, a server response containing `storageKey = new-object-key`, `uploadKey = new-object-key`, and `cosKey = old-object-key` could return an `UploadIntent` whose legacy alias disagreed with the current object key.

Fix:

- `createUploadIntent(...)` now resolves one provider-neutral `objectKey` in this order:
  `storageKey` / `storage_key` -> `uploadKey` / `upload_key` -> `key` -> legacy `cosKey` / `cos_key`.
- Returned `storageKey`, `uploadKey`, and legacy `cosKey` are all assigned from that resolved `objectKey`.
- Legacy-only responses containing only `cosKey`, `cos_key`, or `key` remain compatible.
- Tencent compatibility upload still uses `getUploadObjectKey(...)`, and stale legacy `cosKey` values can no longer override the resolved key.

Additional validation:

```bash
cd app && node --test src/lib/ui/video-workflow-phase-3i-contract.test.mjs
cd app && npm run lint -- src/lib/ui/video-workflow.ts src/lib/ui/video-workflow-phase-3i-contract.test.mjs
cd app && npm run typecheck -- --pretty false
git diff --check
```
