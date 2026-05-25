# Phase 3D Remove Supabase Storage From Current Contracts

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Goal

Remove `supabase_storage` from current app contracts and forward database constraints.

This batch intentionally does not rewrite historical data or historical migration archives. Existing rows must be cleaned or migrated by an operator before the new forward migration can be applied.

## Changes

- `app/src/contracts/media.ts`
  - `MediaStorageProvider` now allows only `aliyun_oss` and `tencent_cos`.
  - `tencent_cos` remains a deprecated runtime compatibility value; `supabase_storage` is no longer a current contract value.
- `app/src/contracts/knowledge.ts`
  - `KnowledgeStorageProvider` no longer includes `supabase_storage`.
  - Current values remain `inline_seed`, `aliyun_oss`, and the temporary compatibility value `tencent_cos`.
- `app/src/server/api/video-job-public-dto.ts`
  - Removed `historicalPayloadStorageProvider`.
  - Missing, unknown, or explicit historical `supabase_storage` result payload providers now normalize to the current default `aliyun_oss`.
  - This preserves public DTO shape while avoiding a current app response that re-legitimizes `supabase_storage`.
- `app/src/server/api/video-job-public-dto.test.ts`
  - Updated historical payload coverage to expect `aliyun_oss` for explicit old `supabase_storage` payloads.
- `app/src/server/api/video-job-payload.test.ts`
  - Updated the unsupported provider negative case to use `legacy_unknown` instead of `supabase_storage`, because `supabase_storage` is no longer part of the current contract.
- `app/db/migrations/202605250002_remove_supabase_storage_provider.sql`
  - Added a forward migration with preflight guards for `public.asset_objects` and `public.knowledge_documents`.
  - If either table still contains `storage_provider = 'supabase_storage'`, the migration raises an exception and asks for historical data cleanup first.
  - Rebuilds `asset_objects_storage_provider_check` to allow only `tencent_cos` and `aliyun_oss`.
  - Rebuilds `knowledge_documents_storage_provider_check` to allow null, `tencent_cos`, `aliyun_oss`, and `inline_seed`.
- `app/src/server/api/storage-provider-phase-3d-contract.test.mjs`
  - Added source contract coverage for current provider values, video DTO normalization, the forward migration preflight guard, and the media complete schema rejection.

## Provider Default Decision

For video job public DTO result assets, missing, unknown, and explicit historical `supabase_storage` payload providers now default to `aliyun_oss`.

Reason: result assets are public DTOs for current consumers, and returning `supabase_storage` would keep exposing it as a valid current runtime value. Skipping the asset would risk hiding generated results. Normalizing to the current object-storage default is the least disruptive current behavior, while the migration preflight still prevents silent DB acceptance of historical `supabase_storage` rows.

## Deliberately Left Alone

- Historical migration files under `app/db/migrations/*` were not edited.
- `app/supabase/migrations` was not touched.
- Historical docs, handoff, and progress files may still mention Supabase.
- `tencent_cos` remains as an explicit runtime compatibility provider.
- COS provider code, COS route naming, `cosKey` / `thumbCosKey` / `sourceCosKey`, and worker storage were not changed in this batch.

## Validation

Passed:

```bash
cd app && node --test src/server/api/storage-provider-phase-3d-contract.test.mjs
cd app && node --test src/server/api/video-job-public-dto.test.ts src/lib/media-upload-contract.test.ts
cd app && npm run lint -- src/contracts/media.ts src/contracts/knowledge.ts src/server/api/video-job-public-dto.ts src/server/api/video-job-public-dto.test.ts src/lib/media-upload-contract.test.ts src/server/api/storage-provider-phase-3d-contract.test.mjs
cd app && npm run typecheck -- --pretty false
rg -n -S "supabase_storage" app/src app/scripts --glob '!**/*.test.*' --glob '!**/*contract.test.mjs'
git diff --check
```

Additional validation because `app/src/server/api/video-job-payload.test.ts` was updated:

```bash
cd app && npm run lint -- src/server/api/video-job-payload.test.ts
```

The final runtime/source `rg` returned no matches.
