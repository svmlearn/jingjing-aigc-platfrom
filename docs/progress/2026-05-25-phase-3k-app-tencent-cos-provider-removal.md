# Phase 3K App Object Storage Provider Removal

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Remove the app-side runtime object storage provider compatibility path so the current app mainline only supports Aliyun OSS.

This batch does not touch `workers/video-worker`, DB column names such as `cos_key`, legacy DTO aliases such as `cosKey`, or historical migration archives.

## Changes

- Removed app runtime provider implementation:
  - Deleted `app/src/server/storage/tencent-cos-provider.ts`.
  - Removed the server provider package dependencies from `app/package.json` and `app/pnpm-lock.yaml`.
  - Removed app `.env.example` entries for the removed provider env.
- Collapsed app object-storage facade to Aliyun OSS:
  - `getObjectStorageProvider(...)` validates the requested/configured provider, then returns `aliyunOssProvider`.
  - `STORAGE_PROVIDER` now only accepts `aliyun_oss`; other values fail with the current unsupported-provider error.
- Tightened current contracts/schema:
  - `MediaStorageProvider` now only allows `aliyun_oss`.
  - `KnowledgeStorageProvider` now allows `aliyun_oss` and `inline_seed`.
  - `mediaCompleteSchema.storageProvider` is now `z.literal("aliyun_oss")`.
- Removed app preview alias/runtime parsing:
  - Deleted `/api/media/cos-preview`.
  - `object-preview` now supports http(s), `oss://`, and raw storage keys; legacy provider schemes are rejected as unsupported.
- Removed app runtime signing branches:
  - `video-edit-jobs-service`, `content-generation-batch-service`, and `video-job-payload` now treat Aliyun OSS as the only current signable/provider payload path.
  - `video-job-public-dto` defaults unknown/historical payload providers to Aliyun OSS.
- Updated health and knowledge flows:
  - Health route no longer emits a `cos` compatibility field.
  - Knowledge upload fallback now catches `OSS_NOT_CONFIGURED`.
- Added forward DB migration:
  - `app/db/migrations/202605250003_remove_tencent_cos_provider.sql`
  - The migration raises before tightening constraints if current `asset_objects` or `knowledge_documents` still contain removed-provider rows.
  - It then restricts `asset_objects.storage_provider` to `aliyun_oss` and `knowledge_documents.storage_provider` to `aliyun_oss` / `inline_seed`.
- Added/updated contracts:
  - `app/src/server/storage/app-storage-provider-phase-3k-contract.test.mjs`
  - Updated previous Phase 3C/3D/3E/3F/3J contracts to reflect Aliyun-only app runtime.

## Deliberately Left Alone

- Worker storage compatibility is not changed in this batch.
- Legacy data/DTO fields remain:
  - `cosKey`
  - `sourceCosKey`
  - `thumbCosKey`
  - DB columns such as `cos_key`, `source_cos_key`, `thumb_cos_key`
- Historical docs, handoff/progress files, and `app/supabase/migrations` remain unchanged.

## Validation

Passed:

```bash
cd app && node --test src/server/storage/upload-intent-phase-3j-contract.test.mjs src/server/storage/app-storage-provider-phase-3k-contract.test.mjs
cd app && node --test src/server/api/storage-provider-phase-3d-contract.test.mjs src/app/api/media/object-preview-route-phase-3e-contract.test.mjs
cd app && node --test src/server/api/video-job-payload.test.ts
cd app && node --test src/lib/media-upload-contract.test.ts src/server/api/media-complete-schema-phase-3c-contract.test.mjs src/server/api/video-job-public-dto.test.ts src/lib/ui/video-workflow-phase-3i-contract.test.mjs
cd app && node --test src/lib/private-media-doctor.test.ts src/lib/private-media-download-service-core.test.ts src/lib/private-media-pexels-adapter.test.ts src/server/api/merchant-media-manifest-service.test.ts
cd app && node --test src/lib/db/app-supabase-helper-phase-2h-contract.test.mjs src/lib/db/voice-profile-repository-phase-2d-contract.test.mjs src/server/api/object-storage-consumer-phase-3f-contract.test.mjs
cd app && npm run lint -- $(git -C .. diff --name-only --diff-filter=ACM | sed -n 's#^app/##p' | grep -E '\\.(ts|tsx|mjs)$' | tr '\\n' ' ')
cd app && npm run typecheck -- --pretty false
git diff --check
rg -n -S "tencent_cos|COS_|Tencent COS|cos-nodejs-sdk-v5|qcloud-cos-sts|cos://|cos-preview|tencent-cos-provider|COS_NOT_CONFIGURED" app/src app/package.json app/pnpm-lock.yaml app/.env.example --glob '!**/.next/**'
```

The final `rg` returned no matches.

Additional note:

- `cd app && node --test src/lib/private-media-workflow-fixture.test.ts` still fails under direct Node execution because that existing test imports runtime files that use the project `@/` path alias. That failure predates this storage-provider change and is not used as this batch's validation gate.

## Review Follow-up: App Scripts

Issue:

- Phase 3K removed the app runtime provider and package dependencies, but `app/scripts` still had smoke scripts importing the removed server SDK and checking removed app env names.
- A clean app install would no longer have those packages, so those scripts could fail before reaching their smoke logic.

Fix:

- Deleted the old provider-specific roundtrip script:
  - `app/scripts/check-domestic-cos-roundtrip.mjs`
- Kept the existing Aliyun OSS signed PUT smoke as the current roundtrip command:
  - `app/scripts/check-aliyun-oss-signed-put-smoke.mjs`
- Updated app smoke scripts to accept only `aliyun_oss`:
  - `app/scripts/check-domestic-app-env.mjs`
  - `app/scripts/check-domestic-storage-provider-smoke.mjs`
  - `app/scripts/check-domestic-video-chain-api-smoke.mjs`
  - `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- Removed app script imports of removed provider SDKs and removed old provider/env error wording.
- Kept `cosKey` only as a legacy upload-intent alias read alongside `storageKey` / `uploadKey`.
- Updated `app/db/README.md` to describe Aliyun OSS / object storage metadata and to point to the Aliyun OSS signed PUT smoke.

Additional validation passed:

```bash
cd app && node --test src/server/storage/app-storage-provider-phase-3k-contract.test.mjs
cd app && npm run lint -- scripts/check-domestic-app-env.mjs scripts/check-domestic-storage-provider-smoke.mjs scripts/check-domestic-video-chain-api-smoke.mjs scripts/check-domestic-video-chain-worker-smoke.mjs
cd app && npm run typecheck -- --pretty false
git diff --check
rg -n -S "tencent_cos|Tencent COS|cos-nodejs-sdk-v5|qcloud-cos-sts|COS_NOT_CONFIGURED|COS_SECRET|COS_BUCKET|COS_REGION|cos://|cos-preview|domestic COS" app/scripts app/db/README.md app/package.json app/pnpm-lock.yaml app/.env.example
```

The follow-up `rg` returned no matches. Remaining `cosKey` reads in the app scripts are only legacy upload-intent alias reads alongside `storageKey` / `uploadKey`.
