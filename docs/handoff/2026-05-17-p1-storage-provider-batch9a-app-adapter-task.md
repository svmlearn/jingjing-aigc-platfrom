# 2026-05-17 P1 Storage Provider Batch 9A: App Storage Adapter

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 8 merchant credits / usage accounting.

This batch introduces an app-side object storage provider abstraction so the current Tencent COS implementation can later switch to Aliyun OSS without rewriting media, knowledge, preview, and video payload call sites.

The goal is:

```text
App storage call sites use a provider-neutral adapter interface.
Tencent COS remains the default and passes existing Singapore regression.
Aliyun OSS is represented in contracts, env examples, constraints, and adapter shape,
but must not be claimed as production-verified until real Aliyun OSS credentials pass smoke.
```

This is the storage abstraction/app-side batch. It is not worker storage migration, TTS, FireRed/OpenStoryline, payment billing, or data backfill.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD before this batch:

```text
c9c8bcd feat: add selfhost merchant credits usage
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -7
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/架构规范/2026-05-16-storage-provider-adapter-plan.md
docs/progress/2026-05-17-selfhost-merchant-credits-usage.md
docs/handoff/2026-05-17-selfhost-merchant-credits-usage-handoff.md
docs/progress/2026-05-16-full-supabase-exit-audit.md
```

Inspect before editing:

```text
app/src/server/api/cos.ts
app/src/server/api/media-service.ts
app/src/server/api/knowledge-service.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/server/api/video-job-payload.ts
app/src/app/api/media/cos-preview/route.ts
app/src/lib/ui/video-workflow.ts
app/src/contracts/media.ts
app/src/contracts/knowledge.ts
app/src/server/api/schemas.ts
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
deploy/domestic/env/app.env.example
app/.env.example
```

Useful current facts:

- `asset_objects.storage_provider` currently allows only `tencent_cos | supabase_storage`.
- `knowledge_documents.storage_provider` currently allows only `tencent_cos | supabase_storage`.
- `MediaStorageProvider` currently allows only `tencent_cos | supabase_storage`.
- Browser upload code currently assumes Tencent COS SDK fields.
- Worker currently accepts only `tencent_cos`; do not change that in this batch.

## 4. Implementation Scope

### 4.1 Add provider-neutral app storage module

Introduce a small app-side storage layer, suggested location:

```text
app/src/server/storage/
```

Suggested files:

```text
app/src/server/storage/object-storage.ts
app/src/server/storage/tencent-cos-provider.ts
app/src/server/storage/aliyun-oss-provider.ts
app/src/server/storage/index.ts
```

The interface should cover the current app needs:

```text
provider name: tencent_cos | aliyun_oss
build upload key for media
build upload key for knowledge files
issue browser upload intent
put server-side object
create signed read URL
assert writable object ref / bucket / key prefix
read provider config with clear errors
```

Keep `app/src/server/api/cos.ts` as a compatibility wrapper if that minimizes churn, but new/changed call sites should move toward the provider-neutral layer.

### 4.2 Keep Tencent COS behavior unchanged

Tencent COS must remain the default provider unless explicitly configured otherwise:

```text
STORAGE_PROVIDER=tencent_cos
```

If `STORAGE_PROVIDER` is absent, behavior should stay compatible with current Singapore rehearsal.

Existing Tencent env names must keep working:

```text
COS_SECRET_ID
COS_SECRET_KEY
COS_BUCKET
COS_REGION
COS_STS_DURATION_SECONDS
COS_READ_URL_TTL_SECONDS
MEDIA_UPLOAD_MAX_BYTES
```

Existing upload intent response fields should remain backward compatible for the browser:

```text
bucket
region
cosKey
TmpSecretId
TmpSecretKey
Token
StartTime
ExpiredTime
expiredTime
```

You may add provider-neutral aliases, but do not remove these legacy fields in this batch.

### 4.3 Add Aliyun OSS as a gated provider

Add Aliyun OSS provider support in code/config, but keep it disabled unless explicitly selected:

```text
STORAGE_PROVIDER=aliyun_oss
```

Target env names:

```text
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
ALIYUN_OSS_BUCKET
ALIYUN_OSS_REGION
ALIYUN_OSS_ENDPOINT
ALIYUN_OSS_STS_ROLE_ARN
ALIYUN_OSS_STS_DURATION_SECONDS
ALIYUN_OSS_READ_URL_TTL_SECONDS
```

Rules:

- Do not overload `COS_*` with Aliyun values.
- If Aliyun OSS env is incomplete, fail with a clear `OSS_NOT_CONFIGURED` / equivalent app error.
- If real Aliyun credentials are not available in this round, implement compile-safe adapter/config surfaces and mark real OSS roundtrip as pending, not passed.
- If adding a Node SDK dependency, use the official Aliyun OSS SDK after checking current official docs/package usage. Update lockfile consistently.
- Do not commit secrets or real bucket names unless they are already non-secret placeholders.

### 4.4 Contract and schema updates

Update app contracts and schemas so storage providers can represent Aliyun OSS:

```text
MediaStorageProvider = "tencent_cos" | "aliyun_oss" | "supabase_storage"
KnowledgeDocumentDto.storageProvider supports "aliyun_oss"
mediaCompleteSchema accepts "aliyun_oss"
```

If upload intent DTO is extended, keep old Tencent fields and add neutral fields such as:

```text
provider
bucket
region
endpoint
storageKey
uploadKey
credentials
```

Do not break existing browser COS upload behavior.

### 4.5 Database migration

Add one additive migration, suggested name:

```text
app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql
```

It should update constraints to allow:

```text
asset_objects.storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage')
knowledge_documents.storage_provider in ('tencent_cos', 'aliyun_oss', 'supabase_storage')
```

If the migration needs to drop/recreate existing check constraints, keep it additive and safe for already-created Singapore DBs.

Do not backfill existing rows.

### 4.6 App call site migration

Move these app paths to provider-neutral calls where practical:

```text
app/src/server/api/media-service.ts
app/src/server/api/knowledge-service.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/app/api/media/cos-preview/route.ts
```

Expected behavior:

- `/api/media/upload-intents` still works for Tencent COS.
- `/api/media/complete` validates provider/bucket/key prefix using selected provider.
- Knowledge file upload uses the selected storage provider for new file objects.
- Video result preview redirects through provider-neutral signed read URL for supported providers.
- Old `/api/media/cos-preview` route can remain for compatibility, but the underlying signing should use the provider abstraction where possible.

Do not change worker input acceptance yet:

- `app/src/server/api/video-job-payload.ts` may keep rejecting non-`tencent_cos` for video worker input.
- If you add provider fields there, keep `aliyun_oss` rejected with a clear message until Batch 9B worker storage migration.

### 4.7 Frontend upload compatibility

Keep existing COS direct upload working in:

```text
app/src/lib/ui/video-workflow.ts
```

If you add provider-neutral intent parsing, it must preserve old COS fields.

Do not implement browser Aliyun direct upload unless the scope stays small and real env/CORS assumptions are documented. If this gets broad, leave browser Aliyun upload to a later batch.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
workers/video-worker storage client
worker input asset provider acceptance
worker output upload provider selection
FireRed / OpenStoryline / TTS
voiceover
data migration from Tencent COS to Aliyun OSS
bucket creation / CORS policy mutation / RAM policy mutation
payment provider / invoices / billing callbacks
main merge
completion marker
```

Do not claim:

```text
Aliyun OSS production verified
domestic Phase 1 complete
worker supports aliyun_oss
old Tencent COS assets can be removed
```

unless those were actually verified in a later batch.

## 6. Smoke Script

Add a focused app storage smoke, suggested:

```text
app/scripts/check-domestic-storage-provider-smoke.mjs
```

It should support at least:

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider tencent_cos
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss
```

Expected Tencent checks:

- provider factory resolves `tencent_cos` by default
- required COS env validation works
- upload key prefix remains compatible
- signed read URL generation works
- server-side put/read/delete roundtrip can delegate to or reuse existing COS roundtrip logic if env is present
- existing `check-domestic-cos-roundtrip.mjs` still passes

Expected Aliyun checks:

- provider factory resolves `aliyun_oss` only when explicitly selected
- incomplete env fails with clear error and no secret output
- if real Aliyun OSS env is present, run put/read/delete signed URL or direct SDK roundtrip
- if real env is absent, report `aliyunOssRoundtrip: "pending"` or similar; do not mark as passed

If HTTP checks are practical:

- run `/api/media/upload-intents` against branch-built local app with Tencent COS configured
- validate response keeps old COS fields and includes any new neutral fields
- run `/api/media/complete` with `tencent_cos`
- verify `aliyun_oss` is rejected or gated unless selected and configured

## 7. Required Validation

Local validation:

```bash
node --check app/scripts/check-domestic-storage-provider-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local database validation:

```text
fresh ordinary PostgreSQL
baseline migration
selfhost foundation migration
merchant credits/usage migration
new storage provider migration
storage provider smoke
```

Singapore validation:

```text
live /api/health
app preflight
new storage provider migration applied additively to Singapore DB
Tencent COS roundtrip against Singapore env
Batch 8 merchant credits/usage non-regression smoke
Batch 7 material library non-regression smoke if cheap
```

If Aliyun OSS real env is not available, record it as pending. This is acceptable for Batch 9A.

## 8. Documentation To Add

Add:

```text
docs/progress/2026-05-17-storage-provider-app-adapter.md
docs/handoff/2026-05-17-storage-provider-app-adapter-handoff.md
```

Progress must include:

- exact migration file
- exact new storage adapter files
- exact call sites moved to the adapter
- whether Tencent COS behavior changed
- whether Aliyun OSS real roundtrip was skipped or passed
- validation results
- remaining risks

Handoff must include:

- branch/worktree
- starting commit
- final commit
- changed files
- validation commands
- push/merge state
- next recommended batch

## 9. Completion Conditions

This batch is complete only when:

- current `c9c8bcd` was pushed to Gitee before editing
- Tencent COS default behavior still passes local/Singapore checks
- provider abstraction exists and is used by app storage call sites
- schema/contracts can represent `aliyun_oss`
- migration applies on fresh local PostgreSQL
- migration applies additively on Singapore self-hosted PostgreSQL
- typecheck/lint/build pass
- worktree is clean
- final commit exists
- no main merge
- no forbidden completion marker

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

## 10. Recommended Final Reply Shape

When done, report:

```text
Completed Batch 9A app storage provider adapter.

Final HEAD:
<hash> <message>

Changed files:
...

Validation:
...

Aliyun OSS:
pending / passed, with exact reason and evidence.

Gitee:
...

Out of scope:
worker storage, TTS, FireRed/OpenStoryline, COS->OSS data backfill, main merge, completion marker.

Recommended next batch:
Batch 9B worker storage client + aliyun_oss input/output support, after app adapter is stable.
```
