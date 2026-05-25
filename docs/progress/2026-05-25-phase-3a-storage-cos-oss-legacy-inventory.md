# Phase 3A Storage / COS / OSS Legacy Inventory

Date: 2026-05-25
Branch: `codex/remove-supabase-cos-legacy-longrun`
Worktree: `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d`

## Scope

This batch is inventory-only. No runtime code, test code, schema, worker, package, lockfile, or migration file was changed.

Phase 2J was explicitly cancelled. `app/supabase/migrations` is treated as a historical migration archive, not current runtime dependency. Supabase words in `docs/progress`, `docs/handoff`, historical README files, and `app/supabase/migrations` are not cleanup blockers unless a current runtime path imports or reads them.

## Overall Conclusion

The app has already moved its current upload default to Aliyun OSS, but storage cleanup is not a single delete. The remaining storage/COS/OSS surface splits into five different buckets:

1. **Current object-storage abstraction with legacy provider support.** `app/src/server/storage/*`, app upload flows, worker config, and video payload code still intentionally accept both `aliyun_oss` and `tencent_cos`. This is runtime behavior, not just naming.
2. **Deprecated compatibility fields.** `cosKey`, `thumbCosKey`, and `sourceCosKey` still exist in browser upload DTOs, merchant media manifests, private media contracts, smoke scripts, and DB columns. Some are now generic object keys under old names. They cannot be blindly removed without coordinated contract/schema/UI changes.
3. **Historical provider values.** `supabase_storage` remains in app contracts, API schema, DB check constraints, and fallback DTO normalization. It is mostly historical-data compatibility, but there are still current source/smoke paths that write or default to it.
4. **True Tencent COS runtime provider.** `tencent-cos-provider.ts`, `server/api/cos.ts`, `/api/media/cos-preview`, worker `cos_client.py`, and `WORKER_COS_*` / `COS_*` env handling still provide real Tencent COS support.
5. **Tests/docs/history noise.** Many hits are fixtures, historical progress docs, handoff docs, or tests that intentionally cover legacy payloads.

The safe next step is not deletion. First remove the remaining current `supabase_storage` write/default paths, then introduce provider-neutral naming around preview/upload/private-media contracts, then decide whether Tencent COS runtime support remains as read-only legacy compatibility or is fully removed.

## Scan Commands And Results

Runtime and schema scan:

```bash
rg -n -S "supabase_storage|tencent_cos|cosKey|thumbCosKey|sourceCosKey|cos_key|thumb_cos_key|source_cos_key|COS_|cos-preview|createCosSignedReadUrl|getCosConfig|tencent-cos-provider|storageProvider" app/src app/db app/scripts workers/video-worker --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!openstoryline/**'
```

Result summary:

- 76 current-code files matched.
- By area: 52 under `app/src`, 6 under `app/db`, 6 under `app/scripts`, 12 under `workers/video-worker`.

Term counts in the same current-code scope:

| Pattern | Count |
| --- | ---: |
| `supabase_storage` | 15 |
| `tencent_cos` | 102 |
| `cosKey` | 78 |
| `thumbCosKey` | 44 |
| `sourceCosKey` | 31 |
| `cos_key` | 28 |
| `thumb_cos_key` | 8 |
| `source_cos_key` | 12 |
| `COS_` | 105 |
| `cos-preview` | 1 |
| `createCosSignedReadUrl` | 3 |
| `getCosConfig` | 3 |
| `tencent-cos-provider` | 2 |
| `storageProvider` | 95 |

Historical docs/archive scan:

```bash
rg -n -S "supabase_storage|tencent_cos|cosKey|thumbCosKey|sourceCosKey|cos_key|thumb_cos_key|source_cos_key|COS_|cos-preview|createCosSignedReadUrl|getCosConfig|tencent-cos-provider|storageProvider" docs app/supabase --glob '!**/node_modules/**'
```

Result summary:

- Large number of historical hits in handoff/progress/architecture docs and `app/supabase/migrations`.
- These are not runtime blockers after the Phase 2J cancellation decision.
- Current entry docs already state new writes default to `aliyun_oss` and historical `tencent_cos` / `supabase_storage` are compatibility terms.

Provider/schema scan:

```bash
rg -n -S "storage_provider in|storage_provider is null|storageProvider: z\\.enum|MediaStorageProvider|KnowledgeStorageProvider|SUPPORTED_STORAGE_PROVIDERS|allowedWorkerInputStorageProviders" app/src app/db workers/video-worker --glob '!openstoryline/**'
```

Key results:

- `app/src/contracts/media.ts` includes `MediaStorageProvider = "aliyun_oss" | "tencent_cos" | "supabase_storage"`.
- `app/src/contracts/knowledge.ts` includes `KnowledgeStorageProvider = "tencent_cos" | "aliyun_oss" | "supabase_storage" | "inline_seed"`.
- `app/src/server/api/schemas.ts` still allows media complete `storageProvider: z.enum(["tencent_cos", "aliyun_oss", "supabase_storage"])`.
- `app/db/migrations/*` still include check constraints allowing `supabase_storage` and `tencent_cos`.
- Worker code supports `SUPPORTED_STORAGE_PROVIDERS = {"tencent_cos", "aliyun_oss"}`.

Provider-branch scan:

```bash
rg -n -S "provider === \"tencent_cos\"|storageProvider === \"tencent_cos\"|storage_provider.*tencent_cos|storageProvider.*supabase_storage|return \"supabase_storage\"|storageProvider: \"supabase_storage\"" app/src app/scripts workers/video-worker --glob '!openstoryline/**'
```

Key results:

- `app/src/server/api/knowledge-service.ts` still writes merchant memory as `storageProvider: "supabase_storage"`.
- `app/src/server/api/video-job-public-dto.ts` defaults unknown payload provider to `"supabase_storage"`.
- `app/src/server/api/schemas.ts` still accepts `supabase_storage` on media complete.
- Worker and app video payloads still allow `tencent_cos` input assets.
- App services still create signed URLs for both `tencent_cos` and `aliyun_oss`.

## File-Level Matrix

| File / Area | Category | Residual | Current Role | Risk | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `app/src/contracts/media.ts` | contract | `MediaStorageProvider` includes `tencent_cos` / `supabase_storage`; upload intent still has deprecated `cosKey` | Current DTO truth source for media assets and upload intents | High | Do not delete directly. First decide historical asset read policy. New writes should remain `aliyun_oss`; `supabase_storage` should be removed from new complete schema only after DB/data check. |
| `app/src/contracts/knowledge.ts` | contract | `KnowledgeStorageProvider` includes `tencent_cos`, `supabase_storage`, `inline_seed` | Current knowledge document DTO | Medium | Keep `inline_seed`. Replace text-only memory writes away from `supabase_storage`; then decide whether historical knowledge documents still need `supabase_storage`. |
| `app/src/server/api/schemas.ts` | API schema | media complete accepts `supabase_storage`; merchant media manifest uses `sourceCosKey`, `cosKey`, `thumbCosKey` | Runtime validation for upload completion and merchant media manifests | High | Remove `supabase_storage` from `mediaCompleteSchema` after confirming no app client completes new uploads with that provider. Rename merchant-media fields only with DB/API compatibility plan. |
| `app/db/migrations/202605130001_domestic_core_baseline.sql` | DB schema historical baseline | `storage_provider in ('tencent_cos', 'supabase_storage')` | Historical app DB baseline | Medium | Do not edit historical migration in place. Add forward migration when changing current constraints. |
| `app/db/migrations/202605160001_selfhost_p0_foundation.sql` | DB schema historical migration | allows `tencent_cos` / `supabase_storage` | Historical self-host foundation | Medium | Do not edit in place; use forward migration. |
| `app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql` | DB schema current compatibility migration | allows `tencent_cos`, `aliyun_oss`, `supabase_storage` | Current compatibility constraint for asset/knowledge providers | High | Requires data check before removing `supabase_storage` / `tencent_cos`. This is the migration to supersede with a new constraint migration. |
| `app/db/migrations/202605190001_selfhost_inline_seed_knowledge_provider.sql` | DB schema current compatibility migration | allows `inline_seed` plus legacy providers | Current knowledge inline seed support | Medium | Keep `inline_seed`; remove `supabase_storage` only after data audit and source code write cleanup. |
| `app/db/migrations/202605190002_selfhost_voice_profiles.sql` | DB schema current compatibility migration | voice profile asset constraint allows `tencent_cos`, `aliyun_oss`, `supabase_storage` | Voice profile historical asset compatibility | Medium | Voice profile runtime already queries only `tencent_cos` / `aliyun_oss`; DB constraint can tighten after DB data confirmation. |
| `app/db/migrations/202605250001_merchant_media_tables.sql` | DB schema current naming | columns `source_cos_key`, `cos_key`, `thumb_cos_key` | PostgreSQL merchant media tables | High | Cannot directly rename. Needs additive migration or compatibility views/DTO mapping because repository, manifests, and tests all use these names. |
| `app/src/server/api/knowledge-service.ts` | runtime | creates merchant memory with `storageProvider: "supabase_storage"` | Current merchant memory creation path | High | First runtime fix candidate: use `inline_seed` or a provider-neutral text-only value if DB contract allows it. Avoid writing new `supabase_storage`. |
| `app/scripts/check-domestic-knowledge-repository-smoke.mjs` | script | inserts knowledge doc with `'supabase_storage'` | Smoke fixture writer | Medium | Update with same provider decision as `knowledge-service.ts`; likely `inline_seed` for text fixture. |
| `app/src/server/api/video-job-public-dto.ts` | runtime DTO mapper | unknown payload provider defaults to `supabase_storage` | Public job result DTO normalization | Medium | Replace default with explicit `legacy_unknown` behavior is not available today. Safer short term: return unknown as error/null or default only for legacy test payloads with clear docs. Needs API review. |
| `app/src/server/api/video-job-payload.ts` | runtime worker payload | accepts worker input providers `tencent_cos` / `aliyun_oss`; rejects `supabase_storage` | Video worker input contract | Medium | Keep until worker Tencent support decision. It already blocks `supabase_storage` for worker input, which is good. |
| `app/src/server/api/video-edit-jobs-service.ts` | runtime | creates signed read URLs for `tencent_cos` / `aliyun_oss` | Server-managed video input payload construction | Medium | Keep if historical Tencent assets still need video jobs. Remove `tencent_cos` only with worker and provider deletion. |
| `app/src/server/api/content-generation-batch-service.ts` | runtime | branches on `tencent_cos`; signs `tencent_cos` / `aliyun_oss` | Content generation asset URL construction | Medium | Same as above: keep until provider removal decision. |
| `app/src/server/storage/object-storage.ts` | runtime provider abstraction | provider name allows `tencent_cos` / `aliyun_oss`; default is `aliyun_oss` | Central current app storage abstraction | Medium | This is healthy compatibility. Remove `tencent_cos` here only when deleting Tencent provider. |
| `app/src/server/storage/index.ts` | runtime provider registry | imports `tencent-cos-provider` | Current provider factory | High | Deleting provider requires removing this import and all COS API/service callers in same batch. |
| `app/src/server/storage/tencent-cos-provider.ts` | runtime legacy provider | `COS_*`, `tencent_cos`, COS SDK | Real Tencent COS support | High | Do not delete until decision is made that historical Tencent reads/uploads are unsupported. If retained, rename docs as legacy provider. |
| `app/src/server/storage/aliyun-oss-provider.ts` | runtime current provider with compatibility field | returns deprecated `cosKey: input.storageKey` | Current Aliyun OSS upload intent | Low/Medium | Good early cleanup candidate: stop returning `cosKey` only after UI and smoke scripts consume `storageKey` only. |
| `app/src/server/api/cos.ts` | runtime legacy API helper | `getCosConfig`, `createCosSignedReadUrl`, Tencent-only assertions | Tencent COS compatibility helper | High | Can be renamed to `legacy-cos.ts` or replaced by object-storage APIs. Direct deletion breaks private-media download and manifest default bucket. |
| `app/src/app/api/media/cos-preview/route.ts` | runtime legacy route name | `/api/media/cos-preview`; supports `cos://` and `oss://` parsing | Historical route alias, provider-neutral implementation underneath | Low/Medium | Keep alias for old Dify payloads. New docs/code should call `/api/media/object-preview`. Later move implementation to object-preview and make cos-preview a thin re-export. |
| `app/src/app/api/media/object-preview/route.ts` | runtime current alias | re-exports from `cos-preview` | Current provider-neutral endpoint but implementation lives in old file | Low | Good rename batch: move implementation here, keep `cos-preview` as legacy re-export. |
| `app/src/app/api/private-media/download/[token]/route.ts` | runtime | imports `createCosSignedReadUrl` | Private media download route | Medium | Replace with object-storage provider signed URL based on stored provider/bucket/key. |
| `app/src/server/api/merchant-media-manifest-service.ts` | runtime | imports `getCosConfig` for default bucket | Merchant media manifest default bucket | Medium | Replace with configured object-storage provider config. Needs manifest contract review. |
| `app/src/lib/ui/video-workflow.ts` | browser runtime | loads COS JS SDK, `COS_SDK_URL`, `cosKey`, provider `tencent_cos` / `aliyun_oss` | Upload client for browser direct upload | High | Must keep until upload intent no longer returns COS credentials and UI is fully signed PUT/OSS path. Good batch for provider-neutral uploader, but test carefully. |
| `app/src/lib/media-upload-contract.ts` | runtime contract | rejects `tencent_cos` / `supabase_storage` for new upload provider | Current new-upload guard | Low | Good current state. Keep as proof that new upload contract is Aliyun OSS only. |
| `app/src/lib/merchant-media-library-contract.ts` | runtime contract | `sourceCosKey`, `cosKey`, `thumbCosKey` | Merchant private media contract | High | Do not rename without DB migration and DTO adapter. Can introduce `storageKey` aliases first. |
| `app/src/lib/merchant-media-manifest.ts` | runtime contract | same merchant media COS-key field names | Manifest validator/normalizer | High | Same as merchant-media library contract. |
| `app/src/lib/db/merchant-media-repository.ts` | runtime repository | reads/writes `source_cos_key`, `cos_key`, `thumb_cos_key` | PostgreSQL merchant media repository | High | DB-backed; field rename requires migration plus compatibility mapper. |
| `app/src/lib/private-media-download-service-core.ts` | runtime | chooses `thumbCosKey` / `cosKey` | Private media signed download core | Medium | Replace with `thumbStorageKey` / `storageKey` after merchant-media DTO introduces aliases. |
| `app/src/lib/private-media-doctor.ts` | runtime diagnostic | `cosKey`, `thumbCosKey`, `orphanCosKeys`, `COS_SECRET_` | Private media consistency doctor | Medium | Rename diagnostics after merchant media key fields are renamed. `_SERVICE_ROLE_KEY` redline is unrelated and should stay. |
| `app/src/lib/private-media-fixture-repository.ts` | local demo fixture | `cosKey`, `thumbCosKey` fixture data | Local/demo media fixtures | Low | Change with merchant-media DTO rename, not before. |
| `app/src/lib/private-media-pexels-adapter.ts` and service core | runtime/private API adapter | internal `cosKey` / `thumbCosKey`, response serialization tests ensure not leaked | Pexels-compatible private media search | Medium | Internal fields can rename after merchant-media DTO alias. Public response already avoids `cosKey`. |
| `app/scripts/check-domestic-storage-provider-smoke.mjs` | script | tests `tencent_cos` and Aliyun provider paths | Provider smoke tool | Low/Medium | Keep if Tencent compatibility remains. Remove Tencent branch when provider is deleted. |
| `app/scripts/check-domestic-cos-roundtrip.mjs` | script | COS-only smoke | Legacy Tencent COS smoke | Low | Can archive/rename as legacy once Tencent COS is no longer supported. Not runtime. |
| `app/scripts/check-domestic-video-chain-api-smoke.mjs` | script | accepts `cosKey` fallback and Tencent upload branch | Video chain smoke | Medium | Update after upload intent DTO stops returning `cosKey`. |
| `app/scripts/check-domestic-video-chain-worker-smoke.mjs` | script | accepts `cosKey` fallback and Tencent upload branch | Worker chain smoke | Medium | Same as API smoke. |
| `app/src/app/api/health/route.ts` | runtime health response | returns `cos` only when provider is `tencent_cos` | Compatibility health payload | Low | Keep until health clients no longer expect `cos`; not a mainline blocker. |
| `workers/video-worker/worker/app/config.py` | worker runtime | supports `tencent_cos`, `WORKER_COS_*`, shared `COS_*` | Worker storage config | High | Removing Tencent support requires worker storage batch. `WORKER_DATABASE_URL` cleanup is already complete; this is storage-only. |
| `workers/video-worker/worker/app/cos_client.py` | worker runtime | file/class names COS, supports Tencent and Aliyun | Worker object storage client | High | Rename to `object_storage_client.py` first if retaining Tencent. Delete Tencent branch only if product confirms no legacy Tencent jobs. |
| `workers/video-worker/worker/app/models.py` | worker runtime contract | input providers `tencent_cos` / `aliyun_oss` | Worker payload validation | Medium | Tighten to `aliyun_oss` only if app video payload no longer emits Tencent assets and old jobs are not retried. |
| `workers/video-worker/worker/app/real_io_smoke.py` | worker smoke | COS env fallbacks and Tencent branch | Real IO smoke | Medium | Update with worker storage decision. |
| `workers/video-worker/.env.example`, `firered.env.example`, `docker-compose.yml`, `README.md` | worker config/docs | `WORKER_COS_*`, `COS_*`, Tencent compatibility | Deployment/config surface | Medium | If Tencent remains, mark legacy-read compatibility. If removed, delete env and docs in same worker storage batch. |
| `workers/video-worker/tests/*` | tests | extensive `tencent_cos` fixtures | Worker contract coverage | Low/Medium | Keep until worker storage contract changes; then update fixtures to `aliyun_oss` and add one historical compatibility test only if retained. |
| `app/src/server/api/video-job-*.test.ts`, private media tests, merchant media tests | tests | `tencent_cos`, `supabase_storage`, `cosKey` fixture cases | Contract regression tests | Low/Medium | Not runtime, but they will need synchronized updates with contract/schema changes. |
| `docs/**`, `app/supabase/migrations/**` | docs-history / migrations archive | many historical COS/Supabase mentions | Historical record | Low | Ignore for runtime cleanup. Do not delete or rewrite history broadly. |

## Recommended Batches

### Phase 3B: Stop New `supabase_storage` Writes

Highest value and lowest blast radius.

- Change `app/src/server/api/knowledge-service.ts` merchant memory creation away from `supabase_storage`; likely use `inline_seed` or another current non-object provider already supported by knowledge schema.
- Change `app/scripts/check-domestic-knowledge-repository-smoke.mjs` to the same provider.
- Evaluate `app/src/server/api/video-job-public-dto.ts` fallback to `supabase_storage`; either make unknown provider explicit/nullable or document it as legacy payload fallback.
- Keep DB constraints for now; no DB data has been checked in this batch.

Suggested tests:

- Knowledge service contract around text memory provider.
- Smoke script source contract.
- Video public DTO fallback contract if changed.

### Phase 3C: Remove `supabase_storage` From Current API Input

Requires more care than Phase 3B.

- Remove `supabase_storage` from `app/src/server/api/schemas.ts` `mediaCompleteSchema`.
- Keep `MediaStorageProvider` type and DB constraints until data audit confirms no historical rows need them.
- Verify `completeMediaUploadForUser()` and `getWritableConfiguredObjectStorageProvider()` still reject unsupported providers with current object-storage wording.

Suggested tests:

- `media-upload-contract` tests.
- API schema contract tests for media complete.
- Typecheck.

### Phase 3D: Provider-Neutral Preview And Download Naming

Good cleanup after `supabase_storage` write paths are fixed.

- Move the implementation from `app/src/app/api/media/cos-preview/route.ts` to `object-preview/route.ts`.
- Keep `cos-preview` as a legacy re-export/alias only.
- Replace `createCosSignedReadUrl` usage in private media download with `getObjectStorageProvider(provider).createSignedReadUrl(...)`.
- Replace `getCosConfig()` in merchant media manifest default bucket with configured object-storage provider config.

Suggested tests:

- Object preview route contract.
- Private media download token tests.
- Merchant media manifest tests.

### Phase 3E: `cosKey` / Merchant Media Field Compatibility Plan

Do not start as a blind rename.

- Introduce `storageKey`, `thumbStorageKey`, and `sourceStorageKey` aliases in DTO/contract while still accepting old fields.
- Add DB migration only if the team wants physical column rename; safer first step is adapter-layer aliasing.
- Update UI and scripts to consume `storageKey` before dropping `cosKey`.
- Keep old fields in DB/API for one compatibility window.

Suggested tests:

- Merchant media repository contract.
- Manifest service tests.
- Private media Pexels adapter tests.
- Video payload tests.

### Phase 3F: Worker Storage Naming Cleanup

Can be split depending on Tencent support decision.

If Tencent remains as legacy read/write provider:

- Rename `workers/video-worker/worker/app/cos_client.py` to `object_storage_client.py`.
- Rename variables like `_cos_client` / `FakeCosClient` where still present.
- Keep `tencent_cos` branch but label it legacy compatibility.

If Tencent is no longer supported:

- Remove Tencent COS SDK usage.
- Set worker `SUPPORTED_STORAGE_PROVIDERS` to `{"aliyun_oss"}`.
- Delete `WORKER_COS_*` / `COS_*` env handling from worker examples and compose.
- Update all worker tests to `aliyun_oss`.

Suggested tests:

- `python3 -m py_compile` for worker app files.
- `python3 -m pytest workers/video-worker/tests/...` in a pytest-capable env.
- Worker processor contract tests.

### Phase 3G: Delete Tencent COS App Provider If Product Confirms No Legacy Reads

This is the highest-risk storage cleanup.

- Delete `app/src/server/storage/tencent-cos-provider.ts`.
- Remove Tencent branch from `app/src/server/storage/index.ts` and `object-storage.ts`.
- Remove `app/src/server/api/cos.ts` or replace with provider-neutral helpers.
- Remove Tencent-specific env checks/scripts.
- Tighten app storage provider types to `aliyun_oss` plus whatever historical DB-only values remain.

Blockers:

- Need production data check for `storage_provider = 'tencent_cos'`.
- Need answer for old Dify/COS payloads and old video job retries.
- Need decision on whether historical assets must remain viewable from the app.

## What Cannot Be Directly Deleted

- `tencent_cos` in app/worker provider logic: still real runtime support.
- `cosKey` / `thumbCosKey` / `sourceCosKey`: active merchant-media contracts, DB columns, and test fixtures depend on them.
- DB constraints containing `supabase_storage`: historical migrations should not be edited in place; current constraints need forward migration after data audit.
- `/api/media/cos-preview`: currently a legacy alias for old Dify payloads.
- Worker `WORKER_COS_*` / `COS_*`: still used by worker Tencent branch.

## What Can Move First

- Stop `knowledge-service.ts` and knowledge smoke from creating new `supabase_storage` rows.
- Move preview implementation to `object-preview` while keeping `cos-preview` as alias.
- Add provider-neutral aliases around merchant-media keys before any DB rename.
- Change smoke scripts to prefer `storageKey` and treat `cosKey` as old fallback only.
- Rename worker `cos_client.py` to object-storage naming if Tencent compatibility remains.

## Data Checks Needed Before Destructive Cleanup

No real DB was queried in this batch. Before removing provider values from DB constraints or runtime read paths, manually confirm counts similar to:

```sql
select storage_provider, count(*) from public.asset_objects group by storage_provider order by storage_provider;
select storage_provider, count(*) from public.knowledge_documents group by storage_provider order by storage_provider;
select count(*) from public.merchant_media_assets where source_cos_key is not null;
select count(*) from public.merchant_media_clips where cos_key is not null or thumb_cos_key is not null;
```

If any `tencent_cos` or `supabase_storage` rows exist and must remain viewable, runtime read compatibility must remain until a migration/backfill plan exists.

## Phase 3A Status

- Inventory complete.
- No code changes.
- No storage contract/schema/provider behavior changed.
- No worker changes.
- No package or lockfile changes.
- No push or deploy.
