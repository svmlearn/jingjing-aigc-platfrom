# 2026-05-18 Aliyun App-Only Clean Release Deployment

## Scope

Batch 10A deployed only the Next.js app from clean archive release commit
`47f0345` to Aliyun ECS `8.154.28.41`.

Explicitly not performed:

- No worker / FireRed / OpenStoryline / TTS deployment.
- No DNS change.
- No ICP submission.
- No RDS public endpoint.
- No OSS public ACL change.
- No main merge.
- No `DOMESTIC_PHASE1_E2E_PASS`.
- No long-task completion mark.
- No secret value printed, recorded, or committed.

## Source And Backup

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
deployed commit: 47f0345
gitee backup: pushed codex/domestic-infra-migration to 47f0345
```

## Runtime Setup

Installed app runtime on ECS:

```text
node: v24.15.0
pnpm used for build/start: corepack pnpm@10.20.0
nginx: active
```

Clean release:

```text
release path: /srv/jingjing-domestic/releases/20260518233102-47f0345
current symlink: /srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260518233102-47f0345
app service: jingjing-domestic-app.service active
nginx: active, port 80 -> 127.0.0.1:3000
app bind: 127.0.0.1:3000
```

Env file permissions:

```text
/srv/jingjing-domestic/shared/env: 700 root:root
/srv/jingjing-domestic/shared/env/app.env: 600 root:root
```

The server `app.env` was composed from:

```text
/tmp/jingjing-aliyun-rds-validation.env
/tmp/jingjing-aliyun-oss-validation.env
```

Only field names were checked. Secret values were not printed. RDS is using
`APP_DATABASE_SSL=disable` and an `APP_DATABASE_URL` with `sslmode=disable`.
This is a Phase 1 private-network temporary stance because the current RDS
endpoint rejected `sslmode=require`. Reconfirm or enable RDS SSL before treating
this as a production security baseline.

## Health And Preflight

Nginx:

```text
GET /nginx-health: ok
nginx -t: successful
```

App health:

```text
GET /api/health: ok
database.status: ok
database.provider: postgres
storage.status: configured
storage.provider: aliyun_oss
storage.bucket: jingjing-domestic-phase1-hz
storage.region: oss-cn-hangzhou
storage.endpoint: oss-cn-hangzhou.aliyuncs.com
```

App env preflight:

```text
status: ok
database_url source: APP_DATABASE_URL
DATABASE_PROVIDER: postgres
STORAGE_PROVIDER: aliyun_oss
VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED: enabled
requiredTablesPresent: true
```

## RDS Schema Check

```text
public base table count: 45
key tables missing: none
storage provider columns present:
- asset_objects.storage_provider / bucket_name / storage_key
- knowledge_documents.storage_provider / bucket_name / storage_key
storage constraints present:
- asset_objects_storage_key_not_null
- asset_objects_storage_provider_check
- asset_objects_storage_provider_not_null
- knowledge_documents_storage_provider_check
installed extensions: pgcrypto, plpgsql
migration ledger: not present; migration state inferred from schema checks
```

## OSS Validation

Aliyun OSS server roundtrip:

```text
status: ok
provider: aliyun_oss
bucket: jingjing-domestic-phase1-hz
region: oss-cn-hangzhou
endpoint: oss-cn-hangzhou.aliyuncs.com
signedDownloadStatus: 200
signedDownloadMatched: true
deleted: true
```

Signed PUT CORS/upload smoke for app origin:

```text
status: ok
origin: http://8.154.28.41
preflightStatus: 200
preflightAllowMethods: GET, PUT, HEAD
preflightAllowHeaders: content-type
putStatus: 200
signedDownloadStatus: 200
signedDownloadMatched: true
deleted: true
```

## Business Smokes

Logs were kept on ECS at:

```text
/srv/jingjing-domestic/logs/batch10a-20260518-2335
```

Passed:

```text
platform-admin-session: ok
consultation-strategy: ok
knowledge-repository: ok
agent-admin-writes: ok
material-library: ok
import-repository: ok
merchant-credits-usage: ok
```

## Video-Chain API Contract

The repo script `check-domestic-video-chain-api-smoke.mjs` at `47f0345` still
hardcodes Tencent COS for the media complete provider, so it is not suitable for
this Aliyun OSS app deployment as-is.

A temporary Aliyun-compatible app API contract smoke was run without starting
any worker. It created a temporary account in memory, exercised app APIs, and
cleaned up the DB rows and OSS object.

Result:

```text
status: failed
loginStatus: 303
testDraftStatus: 201
uploadIntentStatus: 201
app-generated signed PUT status: 200
mediaCompleteStatus: 201
jobCreateStatus: 409
OSS cleanup: true
DB cleanup: true
```

Interpretation:

- App-side Aliyun upload intent and signed PUT path worked.
- App-side media complete with `aliyun_oss` worked.
- Video job creation still failed because current video worker input payload
  validation only accepts `tencent_cos` input assets. This matches the current
  source constraint in `app/src/server/api/video-job-payload.ts`.
- This is deferred to Batch 10B worker storage/app integration. No worker was
  started in Batch 10A.

## Guardrails Confirmed

```text
jingjing-worker-compose: inactive
jingjing-domestic-worker: inactive
docker running containers: none reported
DNS: unchanged
ICP: not submitted
RDS public access: not opened
OSS public ACL/block-public-access: not changed
main merge: no
completion marker: no
```

