# 2026-05-18 Aliyun OSS Resource Setup And Validation Task

## 1. Goal

Unblock `codex/domestic-infra-migration` Batch 9B-V by preparing real Aliyun OSS resources and rerunning real validation.

Current blocker:

```text
Batch 9B app code is wired to ali-oss, but no real ALIYUN_OSS_* env exists locally or on the Singapore rehearsal runtime.
Therefore real Aliyun OSS server roundtrip and signed PUT upload are blocked.
```

Do not start Batch 9C worker migration until this task passes.

## 2. Current Branch State

Migration worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Current local HEAD:

```text
0c7c9af Batch 9B-V record Aliyun OSS validation blocker
```

Before doing new work, push this docs-only blocker commit to Gitee:

```bash
git status --short --branch
git log --oneline --decorate -8
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Operator Setup Checklist

Create or confirm an Aliyun OSS bucket.

Recommended:

```text
bucket ACL: private
region: same region as the future Aliyun ECS/RDS if possible
public-read: disabled
```

Create a RAM user or RAM role for app storage validation.

Minimum permissions for validation and current app prefixes:

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta or equivalent HEAD/object metadata permission if required
```

Recommended resource scope:

```text
app-storage-provider-smoke/*
source-assets/*
draft-inputs/*
knowledge/*
```

If a broad policy is used temporarily to debug setup, record that it must be narrowed before production.

Configure bucket CORS for signed PUT browser upload.

Minimum CORS:

```text
Allowed Origins:
- local validation app origin, for example http://127.0.0.1:<port>
- Singapore rehearsal origin, if testing IP-stage: http://43.160.208.189
- later production domain after ICP/domain switch

Allowed Methods:
- PUT
- GET
- HEAD

Allowed Headers:
- Content-Type
- or *

Expose Headers:
- ETag
- x-oss-request-id
```

Do not make the bucket public to bypass CORS or signed URL issues.

## 4. Secret-Safe Env File

Create a local-only env file outside Git:

```text
/tmp/jingjing-aliyun-oss-validation.env
```

Template:

```bash
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_ACCESS_KEY_ID=<secret>
ALIYUN_OSS_ACCESS_KEY_SECRET=<secret>
ALIYUN_OSS_BUCKET=<bucket>
ALIYUN_OSS_REGION=<region>
ALIYUN_OSS_ENDPOINT=<endpoint>
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

Rules:

- Do not commit this file.
- Do not paste access keys into docs or chat.
- Final replies may mention bucket/region/endpoint if they are not secret, but never keys/secrets.

## 5. Validation Commands

Run from the migration worktree.

### 5.1 Real Aliyun SDK roundtrip

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs \
  --env-file /tmp/jingjing-aliyun-oss-validation.env \
  --provider aliyun_oss \
  --roundtrip
```

Expected:

```text
status=ok
provider=aliyun_oss
signedDownloadStatus=200
signedDownloadMatched=true
deleted=true
```

If this fails, classify the failure:

```text
credentials
endpoint
bucket/region mismatch
RAM policy
SDK/code bug
network
```

Do not proceed to worker migration while this fails.

### 5.2 Signed PUT validation

If possible, validate the Batch 9B browser upload intent path:

```text
start branch-built app with STORAGE_PROVIDER=aliyun_oss and real env
call /api/media/upload-intents for a safe fixture owner
PUT a small file to uploadUrl
call /api/media/complete
verify asset_objects.storage_provider = aliyun_oss
verify readback through signed URL
cleanup DB fixture and OSS object
```

If route fixture setup is too broad, run a smaller provider-level signed PUT validation and record route-level validation as pending.

If browser upload fails but server roundtrip passes, likely cause is CORS or `Content-Type` mismatch. Record exact cause and required CORS/header fix.

### 5.3 Tencent regression

Also rerun:

```text
Singapore /api/health
Singapore real Tencent COS roundtrip
Singapore app preflight
merchant credits/usage smoke
material library smoke
```

Tencent COS must remain healthy until Aliyun cutover is intentionally made.

## 6. Expected Output Docs

If validation passes or fails with a clearer blocker, update:

```text
docs/progress/2026-05-18-real-aliyun-oss-validation.md
docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
```

Record:

```text
bucket/region/endpoint: allowed
access keys/secrets: never
CORS summary
RAM permission scope summary
roundtrip result
signed PUT result
Tencent regression result
cleanup result
whether Batch 9C worker can start
```

Commit the updated validation docs.

## 7. Completion Gate For Starting Batch 9C

Batch 9C worker storage migration can start only if:

```text
Aliyun OSS server roundtrip: passed
signed PUT validation: passed or route-level blocker is explicitly non-worker-related and accepted
Tencent COS regression: passed
no secrets committed
validation docs committed
worktree clean
```

If Aliyun OSS remains blocked, do not write new worker code yet.

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

