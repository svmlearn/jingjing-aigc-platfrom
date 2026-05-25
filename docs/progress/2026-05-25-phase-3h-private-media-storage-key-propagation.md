# Phase 3H Private Media Storage Key Propagation

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Continue moving current app runtime code from COS-key wording toward provider-neutral storage-key wording.

This batch propagates the aliases introduced in Phase 3G through media processing, private media doctor checks, and video job payload assembly. It does not rename database columns and does not remove Tencent COS runtime compatibility.

## Changes

- `app/src/lib/media-processing-contract.ts`
  - Added `thumbnailStorageKey` input alias for `thumbnailCosKey`.
  - Ready clips now include both `storageKey` / `thumbStorageKey` and legacy `cosKey` / `thumbCosKey`.
  - Conflicting thumbnail aliases produce an explicit processing contract error.
  - Validation text now uses thumbnail storage key wording.
- `app/src/lib/private-media-doctor.ts`
  - Added `existingStorageKeys` and `orphanStorageKeys` aliases.
  - Clip checks read `storageKey` / `thumbStorageKey` first, then legacy fields.
  - User-visible messages now say storage object / object storage key instead of COS object / COS key.
- `app/src/server/api/video-job-payload.ts`
  - Merchant media clip payload now includes `storageKey` and `thumbStorageKey`.
  - Legacy `cosKey` and `thumbCosKey` remain in payload for compatibility.
  - Search scoring reads `storageKey` first, then legacy `cosKey`.
- `app/src/lib/merchant-media-manifest.ts`
  - Replaced the remaining "server COS bucket config" message with "server object storage bucket config".

## Tests Updated

- `app/src/lib/media-processing-contract.test.ts`
  - Covers `thumbnailStorageKey` alias input, dual output fields, and conflicting thumbnail aliases.
- `app/src/lib/private-media-doctor.test.ts`
  - Covers `existingStorageKeys` / `orphanStorageKeys` aliases and alias-first clip checks.
- `app/src/server/api/video-job-payload.test.ts`
  - Covers merchant media payload `storageKey` / `thumbStorageKey` output.
  - Covers matching by provider-neutral `storageKey`.

## Deliberately Left Alone

- DB columns remain `source_cos_key`, `cos_key`, and `thumb_cos_key`.
- Compatibility fields remain in app DTOs and contracts:
  - `sourceCosKey`
  - `cosKey`
  - `thumbCosKey`
- `tencent_cos` remains a runtime compatibility provider.
- Tencent COS provider/env support remains.
- Worker storage was not touched.
- `app/supabase/migrations` and historical docs were not touched.

## Validation

Passed:

```bash
cd app && node --test src/lib/media-processing-contract.test.ts
cd app && node --test src/lib/private-media-doctor.test.ts
cd app && node --test src/server/api/video-job-payload.test.ts
cd app && node --test src/lib/merchant-media-repository-contract.test.ts src/lib/private-media-download-service-core.test.ts
cd app && npm run lint -- src/lib/media-processing-contract.ts src/lib/media-processing-contract.test.ts src/lib/private-media-doctor.ts src/lib/private-media-doctor.test.ts src/server/api/video-job-payload.ts src/server/api/video-job-payload.test.ts src/lib/merchant-media-manifest.ts
cd app && npm run typecheck -- --pretty false
git diff --check
rg -n -S "createCosSignedReadUrl|getCosConfig|@/server/api/cos|server/api/cos" app/src app/scripts
```

The legacy `server/api/cos` helper scan returned no matches.

The requested COS-key wording scan:

```bash
rg -n -S "server COS bucket config|COS object|COS key|cosKey|thumbCosKey|sourceCosKey" app/src/lib/media-processing-contract.ts app/src/lib/private-media-doctor.ts app/src/server/api/video-job-payload.ts app/src/lib/merchant-media-manifest.ts
```

now has no matches for user-visible `server COS bucket config`, `COS object`, or `COS key` wording. Remaining matches are compatibility field names only: `sourceCosKey`, `cosKey`, and `thumbCosKey`.

## Review Follow-Up

Review found that the `private-media-doctor` transition aliases were still using nullish either/or behavior:

- `existingStorageKeys` replaced `existingCosKeys` when both were supplied.
- `orphanStorageKeys` replaced `orphanCosKeys` when both were supplied.

Fix:

- `buildStorageKeySet(...)` now merges new and legacy key arrays, trims values, de-duplicates them, and returns `null` for an empty merged set.
- pending/orphan cleanup checks now merge `orphanStorageKeys` and `orphanCosKeys` before emitting issues.
- `app/src/lib/private-media-doctor.test.ts` now covers:
  - a clip whose main object is in `existingStorageKeys` and thumbnail object is in `existingCosKeys`;
  - orphan objects supplied across both new and legacy arrays, with duplicate keys de-duplicated.

Follow-up validation passed:

```bash
cd app && node --test src/lib/private-media-doctor.test.ts
cd app && npm run lint -- src/lib/private-media-doctor.ts src/lib/private-media-doctor.test.ts
cd app && npm run typecheck -- --pretty false
git diff --check
```
