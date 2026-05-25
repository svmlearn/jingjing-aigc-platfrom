# Phase 3B Stop New Supabase Storage Provider Writes

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Stop current code from creating new `supabase_storage` provider values or defaulting missing/unknown result assets to that historical value.

This batch intentionally does not remove historical compatibility types, API schema values, DB constraints, Tencent COS support, COS key fields, worker storage code, or `app/supabase/migrations`.

## Changes

- `app/src/server/api/knowledge-service.ts`
  - `createMerchantMemoryForMerchant()` now creates text-only merchant memory documents with `storageProvider: "inline_seed"`.
  - `bucketName: null` and `storageKey: null` remain unchanged because merchant memory has no backing object-storage file.
  - Existing metadata remains unchanged: `sourceType`, `contentKind`, `chunkPolicy`, `sourceText`, and `fileSizeBytes` are preserved.
- `app/scripts/check-domestic-knowledge-repository-smoke.mjs`
  - Direct text/seed smoke fixture inserts now use `'inline_seed'` instead of the historical object-storage provider value.
- `app/src/server/api/video-job-public-dto.ts`
  - Missing or unknown payload result asset providers now default to `"aliyun_oss"`, the current object-storage mainline.
  - Explicit historical payloads with `storage_provider: "supabase_storage"` still round-trip as compatibility. This is intentionally limited to explicit payload values and no longer acts as the missing/unknown default.
- `app/src/server/api/video-job-public-dto.test.ts`
  - Added coverage for missing provider -> `aliyun_oss`.
  - Added coverage for unknown provider -> `aliyun_oss`.
  - Added coverage that explicit historical `supabase_storage` payloads are still preserved.
- `app/src/server/api/storage-provider-phase-3b-contract.test.mjs`
  - Added source contract checks for the knowledge service, knowledge smoke script, and public video DTO mapper.

## Why Unknown/Missing Defaults To Aliyun OSS

Skipping result assets with missing provider would hide completed worker outputs from users when old payloads omit provider but still include a valid storage key and bucket. Defaulting to `aliyun_oss` matches the current mainline and stops creating the old Supabase storage meaning. Explicit `supabase_storage` remains compatibility-only because historical payloads may still contain that value and the type/schema cleanup is intentionally deferred.

## Deliberately Left Alone

- `app/src/contracts/media.ts` still includes `supabase_storage`.
- `app/src/contracts/knowledge.ts` still includes `supabase_storage`.
- `app/src/server/api/schemas.ts` still accepts `supabase_storage`.
- `app/db/migrations/*` constraints were not changed.
- `tencent_cos`, COS provider/runtime code, and `cosKey` / `thumbCosKey` / `sourceCosKey` compatibility were not changed.
- Worker storage code was not changed.
- `app/supabase/migrations` remains a historical migration archive.

## Validation

Passed:

```bash
cd app && node --test src/server/api/storage-provider-phase-3b-contract.test.mjs
cd app && node --test src/server/api/video-job-public-dto.test.ts
cd app && npm run lint -- src/server/api/knowledge-service.ts src/server/api/video-job-public-dto.ts src/server/api/video-job-public-dto.test.ts src/server/api/storage-provider-phase-3b-contract.test.mjs
cd app && npm run typecheck -- --pretty false
rg -n -S "storageProvider: \"supabase_storage\"|return \"supabase_storage\"|'supabase_storage'" app/src/server/api/knowledge-service.ts app/scripts/check-domestic-knowledge-repository-smoke.mjs app/src/server/api/video-job-public-dto.ts
git diff --check
```

The final `rg` returned no matches.
