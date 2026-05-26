# Phase 3C Media Complete Schema Supabase Storage Removal

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Stop the current media complete API input from accepting `supabase_storage`.

This is an API input narrowing only. It does not remove historical DTO/DB compatibility, does not rewrite old rows, and does not touch Tencent COS, COS provider code, `cosKey` compatibility fields, worker storage, or `app/supabase/migrations`.

## Changes

- `app/src/server/api/schemas.ts`
  - `mediaCompleteSchema.storageProvider` now accepts only `["tencent_cos", "aliyun_oss"]`.
  - `supabase_storage` is no longer valid for current `/api/media/complete` request payloads.
- `app/src/server/api/media-complete-schema-phase-3c-contract.test.mjs`
  - Added source contract coverage that the schema accepts `aliyun_oss`.
  - Added coverage that the schema rejects `supabase_storage`.
  - Added coverage that `tencent_cos` remains schema-level compatibility only.

## Why Tencent COS Remains In This Schema

This batch is deliberately scoped to `supabase_storage`. `tencent_cos` is still a real runtime compatibility provider in app and worker storage paths. Removing it from media complete must be coupled with a broader Tencent COS decision and provider cleanup, not hidden inside the Supabase storage input cleanup.

## Deliberately Left Alone

- `app/src/contracts/media.ts` still includes `supabase_storage` for historical DTO/DB read compatibility.
- `app/src/contracts/knowledge.ts` still includes `supabase_storage`.
- `app/db/migrations/*` constraints were not changed.
- `app/src/server/api/video-job-public-dto.ts` still preserves explicit historical `supabase_storage` payloads.
- `tencent_cos`, COS provider/runtime code, `cosKey` / `thumbCosKey` / `sourceCosKey`, worker storage, and `app/supabase/migrations` were not changed.

## Validation

Passed:

```bash
cd app && node --test src/server/api/media-complete-schema-phase-3c-contract.test.mjs
cd app && node --test src/lib/media-upload-contract.test.ts
cd app && npm run lint -- src/server/api/schemas.ts src/server/api/media-complete-schema-phase-3c-contract.test.mjs src/lib/media-upload-contract.test.ts
cd app && npm run typecheck -- --pretty false
rg -n -S "storageProvider: z\\.enum\\(\\[.*supabase_storage|mediaCompleteSchema[\\s\\S]*supabase_storage" app/src/server/api/schemas.ts
git diff --check
```

The final `rg` returned no matches.
