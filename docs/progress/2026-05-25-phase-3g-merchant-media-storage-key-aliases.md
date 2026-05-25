# Phase 3G Merchant Media Storage Key Aliases

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Add provider-neutral aliases for merchant media and private media object keys without deleting the legacy COS-named fields yet.

This prepares for a later COS naming cleanup while preserving current DB columns and payload compatibility.

## Changes

- `sourceCosKey` now has provider-neutral alias `sourceStorageKey`.
- `cosKey` now has provider-neutral alias `storageKey`.
- `thumbCosKey` now has provider-neutral alias `thumbStorageKey`.
- Manifest input accepts either old or new fields.
- If old and new fields are both provided with different values, the manifest/repository contract throws explicit conflict errors instead of silently choosing one:
  - `MERCHANT_MEDIA_SOURCE_KEY_CONFLICT`
  - `MERCHANT_MEDIA_CLIP_KEY_CONFLICT`
  - `MERCHANT_MEDIA_THUMB_KEY_CONFLICT`
- Output DTOs and repository mapped records now include both legacy fields and new aliases where possible.
- PostgreSQL writes still target the existing columns:
  - `source_cos_key`
  - `cos_key`
  - `thumb_cos_key`

## Files Changed

- `app/src/lib/merchant-media-manifest.ts`
  - Normalizes source/clip/thumb key aliases.
  - Accepts new alias-only input.
  - Returns old and new fields together.
- `app/src/server/api/schemas.ts`
  - Manifest API schema now allows `sourceStorageKey`, `storageKey`, and `thumbStorageKey`.
- `app/src/lib/merchant-media-library-contract.ts`
  - Validation reads provider-neutral aliases first, then legacy fields.
- `app/src/lib/merchant-media-repository-contract.ts`
  - Added shared alias normalizers and conflict checks.
  - In-memory repository normalizes aliases before storing.
- `app/src/lib/db/merchant-media-repository.ts`
  - PostgreSQL repository normalizes aliases before DB writes.
  - Row mappers add `sourceStorageKey`, `storageKey`, and `thumbStorageKey`.
- `app/src/lib/private-media-download-service-core.ts`
  - Download signing reads `storageKey` / `thumbStorageKey` first, then legacy fields.
- `app/src/lib/private-media-pexels-adapter.ts`
  - `PrivateMediaClipRecord` includes alias fields.
- `app/src/lib/private-media-pexels-service-core.ts`
  - Availability checks read alias fields first.
- Tests were updated for old input, new input, matching dual input, conflicting dual input, mapper alias output, and private download alias preference.

## Deliberately Left Alone

- DB column names were not changed.
- No migrations were changed or added.
- `tencent_cos` remains supported.
- Tencent COS runtime provider and env support remain.
- Worker storage was not touched.
- `app/supabase/migrations` and historical docs were not touched.
- Existing `cosKey` / `thumbCosKey` / `sourceCosKey` fields remain compatibility fields and are intentionally still present.

## Validation

Passed:

```bash
cd app && node --test src/lib/merchant-media-repository-contract.test.ts
cd app && node --test src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
cd app && node --test src/server/api/merchant-media-manifest-service.test.ts
cd app && node --test src/lib/private-media-download-service-core.test.ts
cd app && node --test src/lib/merchant-media-library-contract.test.ts
cd app && npm run typecheck -- --pretty false
cd app && npm run lint -- src/lib/merchant-media-manifest.ts src/server/api/schemas.ts src/lib/merchant-media-library-contract.ts src/lib/merchant-media-library-contract.test.ts src/lib/merchant-media-repository-contract.ts src/lib/merchant-media-repository-contract.test.ts src/lib/db/merchant-media-repository.ts src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs src/lib/private-media-download-service-core.ts src/lib/private-media-download-service-core.test.ts src/lib/private-media-pexels-adapter.ts src/lib/private-media-pexels-service-core.ts src/server/api/merchant-media-manifest-service.test.ts
rg -n -S "createCosSignedReadUrl|getCosConfig|@/server/api/cos|server/api/cos" app/src app/scripts
git diff --check
```

The final legacy server COS helper `rg` returned no matches.
