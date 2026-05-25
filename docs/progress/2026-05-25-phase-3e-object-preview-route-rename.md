# Phase 3E Object Preview Route Rename

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Make `/api/media/object-preview` the primary provider-neutral preview implementation, while keeping `/api/media/cos-preview` as a legacy alias for old Dify/COS payloads.

This batch only renames the route ownership. It does not remove Tencent COS runtime compatibility, COS helpers, COS provider code, `cosKey` fields, worker storage, or database constraints.

## Changes

- `app/src/app/api/media/object-preview/route.ts`
  - Now owns the real `GET` implementation.
  - Keeps the same preview behavior:
    - `http://` and `https://` paths redirect directly.
    - `oss://` paths map to `aliyun_oss`.
    - `cos://` paths map to `tencent_cos`.
    - no-scheme paths continue as raw storage keys.
    - signed redirects still use `getObjectStorageProvider(...).createSignedReadUrl(...)`.
  - Error text now uses object preview wording instead of image/COS-oriented wording.
- `app/src/app/api/media/cos-preview/route.ts`
  - Reduced to a thin legacy re-export:
    - `export { GET, runtime } from "../object-preview/route";`
  - Comment marks it as a legacy alias for old Dify/COS payloads.
- `app/src/app/api/media/object-preview-route-phase-3e-contract.test.mjs`
  - Added source contract coverage that object-preview owns the implementation.
  - Added coverage that cos-preview is only the alias.
  - Added coverage for `oss://`, `cos://`, and raw storage-key parsing branches.
  - Added coverage that the primary object-preview route no longer carries the old legacy-route comment.

## Deliberately Left Alone

- `app/src/server/api/cos.ts`
- `createCosSignedReadUrl`
- `getCosConfig`
- private media download
- merchant media manifest
- `tencent_cos`
- COS provider code
- `cosKey` / `thumbCosKey` / `sourceCosKey`
- worker storage
- database migrations

## Validation

Passed:

```bash
cd app && node --test src/app/api/media/object-preview-route-phase-3e-contract.test.mjs
cd app && npm run lint -- src/app/api/media/object-preview/route.ts src/app/api/media/cos-preview/route.ts src/app/api/media/object-preview-route-phase-3e-contract.test.mjs
cd app && npm run typecheck -- --pretty false
rg -n -S "object-preview|cos-preview|parseDifyStoragePath|getObjectStorageProvider" app/src/app/api/media app/src/server/api/dify-final-json-mapper.ts
git diff --check
```
