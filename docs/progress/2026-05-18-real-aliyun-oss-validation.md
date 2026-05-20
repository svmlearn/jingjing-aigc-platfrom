# 2026-05-18 Real Aliyun OSS Validation

## Scope

Batch 9B-V attempted to validate the Batch 9B app-side Aliyun OSS SDK path against real Aliyun OSS resources before any worker storage migration.

Required validation target:

```text
STORAGE_PROVIDER=aliyun_oss
real Aliyun OSS server put/read/delete roundtrip
real signed PUT upload validation
Tencent COS regression still passing
```

Result:

```text
Aliyun OSS real validation: blocked
blocker: real Aliyun OSS env was not available locally or on the Singapore rehearsal runtime inspected in this batch
Tencent COS regression: passed
worker/TTS/FireRed: not touched
```

## Official References Checked

Alibaba Cloud official OSS references used for this validation checklist:

- CORS: https://www.alibabacloud.com/help/en/oss/user-guide/configure-cross-origin-resource-sharing
- Pre-signed URL upload: https://www.alibabacloud.com/help/en/oss/user-guide/upload-files-using-presigned-urls
- RAM policy overview: https://www.alibabacloud.com/help/en/oss/user-guide/ram-policy/

Key validation implications:

- Browser signed PUT requires the request `Content-Type` to match the header used when generating the pre-signed URL.
- OSS CORS for frontend upload must allow `PUT` and expose `ETag` / `x-oss-request-id` if the browser needs to read them.
- RAM permissions should follow least privilege and cover only the required bucket/prefixes.

## Pre-work Gitee Backup

Before validation work, the requested backup was pushed:

```text
gitee/codex/domestic-infra-migration = 025fa33db35e13f9a29265c2b65661ce2e6fd7c1
```

Command result:

```text
git push gitee codex/domestic-infra-migration: pushed 5e9218c..025fa33
git rev-parse HEAD: 025fa33db35e13f9a29265c2b65661ce2e6fd7c1
git rev-parse gitee/codex/domestic-infra-migration: 025fa33db35e13f9a29265c2b65661ce2e6fd7c1
```

## Aliyun Env Availability

Expected local-only env file:

```text
/tmp/jingjing-aliyun-oss-validation.env
```

Observed:

```text
env file exists: false
current shell STORAGE_PROVIDER: missing
ALIYUN_OSS_ACCESS_KEY_ID: missing
ALIYUN_OSS_ACCESS_KEY_SECRET: missing
ALIYUN_OSS_BUCKET: missing
ALIYUN_OSS_REGION: missing
ALIYUN_OSS_ENDPOINT: missing
ALIYUN_OSS_READ_URL_TTL_SECONDS: missing
MEDIA_UPLOAD_MAX_BYTES: missing
```

Singapore rehearsal env inspection:

```text
/etc/jingjing/app.env: missing
real Aliyun OSS runtime env: not found
```

No access key or secret value was printed or committed.

## Bucket / Region / Endpoint

Real Aliyun OSS bucket details were not available in this batch.

```text
bucket: pending
region: pending
endpoint: pending
```

## CORS Summary

Actual bucket CORS could not be inspected because no real bucket/env was available.

Required before signed PUT browser validation:

```text
Allowed origins:
- local validation origin, if testing local browser/app
- http://43.160.208.189, if testing Singapore IP-stage app
- future production domain after ICP/domain cutover

Allowed methods:
- PUT
- GET
- HEAD

Allowed headers:
- Content-Type
- or *

Expose headers:
- ETag
- x-oss-request-id

Vary Origin:
- enabled when multiple origins or wildcard origins are used
```

## RAM Permission Summary

Actual RAM policy could not be inspected because no real Aliyun credentials/env were available.

Minimum permission target for validation:

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta or equivalent metadata/head operation if required
```

Recommended prefix scope:

```text
app-storage-provider-smoke/*
source-assets/*
draft-inputs/*
knowledge/*
```

Do not start Batch 9C worker migration until the app-side Aliyun OSS validation passes with scoped permissions.

## Aliyun Smoke Results

Non-roundtrip missing-env check:

```text
command: STORAGE_PROVIDER=aliyun_oss node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss
result: status=pending, code=OSS_NOT_CONFIGURED
missing:
- ALIYUN_OSS_ACCESS_KEY_ID
- ALIYUN_OSS_ACCESS_KEY_SECRET
- ALIYUN_OSS_BUCKET
- ALIYUN_OSS_REGION
- ALIYUN_OSS_ENDPOINT
roundtrip=pending
```

Roundtrip missing-env check:

```text
command: STORAGE_PROVIDER=aliyun_oss node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss --roundtrip
result: status=missing_environment, code=OSS_NOT_CONFIGURED, exit_code=2
```

Real Aliyun server put/read/delete roundtrip:

```text
status: blocked
reason: missing real Aliyun OSS env
```

Signed PUT upload validation:

```text
status: blocked
reason: missing real Aliyun OSS env, so no uploadUrl could be generated against a real bucket
```

Route-level `/api/media/upload-intents` validation:

```text
status: pending
reason: blocked behind real Aliyun OSS env and signed PUT validation
```

## Cleanup

Aliyun OSS cleanup:

```text
not required; no Aliyun object was created
```

Tencent COS cleanup:

```text
real Singapore COS roundtrip uploaded one object and deleted it successfully
deleted=true
```

Database fixture cleanup:

```text
merchant credits/usage smoke cleanup: status=ok
material library smoke cleanup: status=ok
```

## Tencent Regression

Local Tencent adapter smoke with dummy env:

```text
status=ok
provider=tencent_cos
bucket=jj-healthcheck-1250000000
region=ap-guangzhou
signedReadUrlGenerated=true
roundtrip=skipped
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

Singapore real Tencent COS roundtrip:

```text
status=ok
bucket=jj-content-staging-1341668543
region=ap-singapore
signedDownloadStatus=200
bytes=32
signedDownloadMatched=true
deleted=true
```

Singapore app preflight through SSH tunnel:

```text
status=ok
database connected=true
requiredTablesPresent=true
STORAGE_PROVIDER=tencent_cos
```

Singapore DB non-regression through SSH tunnel:

```text
check-domestic-merchant-credits-usage-smoke.mjs: status=ok
check-domestic-material-library-smoke.mjs: status=ok
```

## Decision

App-side Aliyun OSS is not ready to unblock Batch 9C worker migration yet.

Blocking condition:

```text
real Aliyun OSS server roundtrip and signed PUT validation have not passed
```

Next required operator action:

```text
Create /tmp/jingjing-aliyun-oss-validation.env or provide equivalent runtime env with real Aliyun OSS credentials, bucket, region, endpoint, read URL TTL, and media upload limit.
Configure bucket CORS and RAM policy per the checklist above.
Rerun Batch 9B-V validation before starting worker storage migration.
```
