# Phase 3F Remove Server COS Helper Consumers

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Remove app business-code consumers of the legacy `server/api/cos` helper and route them through the provider-neutral object-storage facade.

This batch reduces COS naming in app business code without deleting Tencent COS runtime compatibility, COS environment support, `tencent_cos`, or legacy `cosKey` / `sourceCosKey` fields.

## Changes

- `app/src/app/api/private-media/download/[token]/route.ts`
  - Removed the legacy COS helper import.
  - Signed private media download redirects through `getObjectStorageProvider().createSignedReadUrl(...)`.
  - Preserved the 302 signed-read redirect behavior and continued passing `bucketName`, `storageKey`, `responseContentDisposition`, and `responseContentType`.
- `app/src/server/api/merchant-media-manifest-service.ts`
  - Removed the legacy COS config helper import.
  - `defaultBucketName` now comes from `getConfiguredObjectStorageProvider().getConfig().bucket`.
  - `receiveMerchantMediaManifest(...)` contract and `cosKey` / `sourceCosKey` payload fields were not changed.
- `app/src/server/api/cos.ts`
  - Deleted after `rg` confirmed no remaining `app/src` or `app/scripts` consumers.
- `app/src/server/api/object-storage-consumer-phase-3f-contract.test.mjs`
  - Added source contract coverage that private media download and merchant media manifest use `@/server/storage`.
  - Added coverage that the legacy API helper file is removed.
  - Added coverage that `app/src/server/storage/tencent-cos-provider.ts` still exists.

## Deliberately Left Alone

- `app/src/server/storage/tencent-cos-provider.ts`
- `tencent_cos` provider branches
- COS environment support
- `cosKey` / `thumbCosKey` / `sourceCosKey`
- private media manifest contract fields
- database migrations
- worker storage
- `app/supabase/migrations`
- historical docs

## Validation

Passed:

```bash
cd app && node --test src/server/api/object-storage-consumer-phase-3f-contract.test.mjs
cd app && node --test src/lib/private-media-download-service-core.test.ts src/server/api/merchant-media-manifest-service.test.ts
cd app && npm run lint -- 'src/app/api/private-media/download/[token]/route.ts' src/server/api/merchant-media-manifest-service.ts src/server/api/object-storage-consumer-phase-3f-contract.test.mjs
cd app && npm run typecheck -- --pretty false
rg -n -S "createCosSignedReadUrl|getCosConfig|@/server/api/cos|server/api/cos" app/src app/scripts
git diff --check
```

The final `rg` returned no matches.
