# 2026-05-17 Storage Provider App Adapter

## Scope

Batch 9A moved app-side storage calls behind a provider-neutral adapter while keeping Tencent COS as the default runtime provider.

Implemented:

- `app/src/server/storage/` provider interface and factory.
- Tencent COS provider using existing `COS_*` env and current COS SDK/STS behavior.
- Aliyun OSS provider shell with separate `ALIYUN_OSS_*` env validation and explicit pending errors for browser upload, server upload, and signed URL until SDK wiring is done in a later batch.
- App media upload/complete, knowledge upload, result preview, Dify image preview helper, and health check moved to the adapter shape.
- Contracts/schema/migration now allow `aliyun_oss` alongside `tencent_cos` and legacy `supabase_storage`.
- Storage smoke script for Tencent COS adapter checks and Aliyun pending checks.

Out of scope remained untouched:

- worker / TTS / FireRed / OpenStoryline
- worker storage provider selection
- real Aliyun OSS SDK integration or production roundtrip
- import/material/credits behavior beyond non-regression smoke
- main merge
- completion marker files

## Files Changed

```text
app/.env.example
app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql
app/scripts/check-domestic-app-env.mjs
app/scripts/check-domestic-storage-provider-smoke.mjs
app/src/app/api/health/route.ts
app/src/app/api/media/cos-preview/route.ts
app/src/contracts/knowledge.ts
app/src/contracts/media.ts
app/src/lib/ui/video-workflow.ts
app/src/server/api/content-generation-batch-service.ts
app/src/server/api/cos.ts
app/src/server/api/knowledge-service.ts
app/src/server/api/media-service.ts
app/src/server/api/schemas.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/server/storage/aliyun-oss-provider.ts
app/src/server/storage/index.ts
app/src/server/storage/object-storage.ts
app/src/server/storage/tencent-cos-provider.ts
deploy/domestic/env/app.env.example
docs/progress/2026-05-17-storage-provider-app-adapter.md
docs/handoff/2026-05-17-storage-provider-app-adapter-handoff.md
```

## Adapter Notes

- Default remains `STORAGE_PROVIDER=tencent_cos` when unset.
- Existing Tencent env names remain valid:
  - `COS_SECRET_ID`
  - `COS_SECRET_KEY`
  - `COS_BUCKET`
  - `COS_REGION`
  - `COS_STS_DURATION_SECONDS`
  - `COS_READ_URL_TTL_SECONDS`
  - `MEDIA_UPLOAD_MAX_BYTES`
- Aliyun uses separate env names only:
  - `ALIYUN_OSS_ACCESS_KEY_ID`
  - `ALIYUN_OSS_ACCESS_KEY_SECRET`
  - `ALIYUN_OSS_BUCKET`
  - `ALIYUN_OSS_REGION`
  - `ALIYUN_OSS_ENDPOINT`
  - `ALIYUN_OSS_STS_ROLE_ARN`
  - `ALIYUN_OSS_STS_DURATION_SECONDS`
  - `ALIYUN_OSS_READ_URL_TTL_SECONDS`
- No `COS_*` env is overloaded with Aliyun values.
- No real Aliyun OSS env was available in this round, so Aliyun roundtrip is recorded as pending only.

## Local Validation

Static/build checks:

```text
node --check app/scripts/check-domestic-storage-provider-smoke.mjs: passed
node --check app/scripts/check-domestic-app-env.mjs: passed
pnpm --dir app typecheck: passed
pnpm --dir app lint: passed
pnpm --dir app build: passed
git diff --check: passed
```

Storage smoke:

```text
COS_SECRET_ID=dummy COS_SECRET_KEY=dummy COS_BUCKET=jj-healthcheck-1250000000 COS_REGION=ap-guangzhou STORAGE_PROVIDER=tencent_cos node app/scripts/check-domestic-storage-provider-smoke.mjs --provider tencent_cos
```

Result:

```text
status=ok
provider=tencent_cos
keyPrefixCompatible=true
signedReadUrlGenerated=true
roundtrip=skipped
aliyunOssRoundtrip=pending_no_real_env
```

Aliyun pending smoke:

```text
STORAGE_PROVIDER=aliyun_oss node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss
```

Result:

```text
status=pending
provider=aliyun_oss
reason=aliyun_oss_env_missing
expectedErrorCode=OSS_NOT_CONFIGURED
roundtrip=pending
```

Fresh local PostgreSQL validation:

- Temporary PostgreSQL 17 cluster on `/tmp`, database `jj_batch9a`.
- Applied, in order:
  - `202605130001_domestic_core_baseline.sql`
  - `202605160001_selfhost_p0_foundation.sql`
  - `202605170001_selfhost_merchant_credits_usage.sql`
  - `202605170002_selfhost_storage_provider_aliyun_oss.sql`

Constraint check:

```text
asset_objects_storage_provider_check includes tencent_cos, aliyun_oss, supabase_storage
knowledge_documents_storage_provider_check includes tencent_cos, aliyun_oss, supabase_storage
```

Local DB smoke:

```text
check-domestic-app-env.mjs: status=ok, requiredTablesPresent=true
check-domestic-merchant-credits-usage-smoke.mjs: status=ok
check-domestic-material-library-smoke.mjs: status=ok
check-domestic-knowledge-repository-smoke.mjs: status=ok
```

## Singapore Validation

Pre-change backup:

```text
gitee/codex/domestic-infra-migration = c9c8bcd8e10a283793e3577574fdc4b52b59eaa3
```

Applied the additive migration to Singapore self-hosted PostgreSQL:

```text
app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql
```

Result:

```text
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
```

Singapore constraint check:

```text
asset_objects_storage_provider_check includes tencent_cos, aliyun_oss, supabase_storage
knowledge_documents_storage_provider_check includes tencent_cos, aliyun_oss, supabase_storage
```

Singapore health:

```text
GET http://43.160.208.189/api/health
ok=true
database.provider=postgres
cos.status=configured
cos.bucket=jj-content-staging-1341668543
cos.region=ap-singapore
```

Singapore real Tencent COS roundtrip through the running app container:

```text
status=ok
region=ap-singapore
signedDownloadStatus=200
signedDownloadMatched=true
deleted=true
```

Singapore DB non-regression through SSH tunnel:

```text
check-domestic-app-env.mjs: status=ok
check-domestic-merchant-credits-usage-smoke.mjs: status=ok
check-domestic-material-library-smoke.mjs: status=ok
check-domestic-knowledge-repository-smoke.mjs: status=ok
```

Singapore note:

- I did not deploy this branch to replace the live Singapore app.
- Live app health/COS roundtrip therefore validates the existing Tencent COS runtime remains healthy, while local build/typecheck validates this branch's adapter code.
- Aliyun OSS remains pending because no real Aliyun env was supplied and Batch 9A intentionally does not wire the real SDK.
