# 2026-05-18 P1 Storage Provider Batch 9B-V: Real Aliyun OSS Validation

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 9B app-side Aliyun OSS SDK wiring.

This is a validation / environment hardening batch. It should prove the already-implemented app Aliyun OSS SDK path against real Aliyun OSS resources before any worker migration begins.

The goal is:

```text
With real Aliyun OSS env, STORAGE_PROVIDER=aliyun_oss passes app storage roundtrip,
signed read URL, and one signed PUT browser/API-style upload validation.
```

Do not start worker storage migration until this passes.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD:

```text
025fa33 Batch 9B wire Aliyun OSS app SDK
```

The branch is expected to be ahead of Gitee by 1 commit. Before making any docs/code/env-example changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -8
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Required Real Aliyun Inputs

The user/operator must provide these as environment variables on the machine used for validation. Do not commit them and do not print secret values:

```text
STORAGE_PROVIDER=aliyun_oss
ALIYUN_OSS_ACCESS_KEY_ID=<secret>
ALIYUN_OSS_ACCESS_KEY_SECRET=<secret>
ALIYUN_OSS_BUCKET=<bucket>
ALIYUN_OSS_REGION=<region>
ALIYUN_OSS_ENDPOINT=<endpoint>
ALIYUN_OSS_READ_URL_TTL_SECONDS=3600
MEDIA_UPLOAD_MAX_BYTES=1073741824
```

`ALIYUN_OSS_STS_ROLE_ARN` is optional for this implementation because Batch 9B uses server-signed PUT URL, not STS browser credentials.

Recommended bucket posture:

```text
bucket ACL: private
public-read: off
real download must use signed read URL
```

## 4. Aliyun Console / Policy Checklist

Use Alibaba Cloud official docs as the final source of truth:

- OSS CORS documentation: <https://www.alibabacloud.com/help/en/oss/cors-12/>
- OSS pre-signed URL upload documentation: <https://www.alibabacloud.com/help/en/oss/user-guide/upload-files-using-presigned-urls>
- OSS RAM policy overview: <https://www.alibabacloud.com/help/en/oss/ram-policy-overview/>

Minimum CORS for browser signed PUT validation:

```text
Allowed Origins:
- local validation origin, if using local browser/app
- Singapore rehearsal origin, if testing through http://43.160.208.189
- later production domain after ICP/domain cutover

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

Vary Origin:
- enabled if available
```

Minimum RAM/object permissions for the validation key prefix:

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta or equivalent metadata/head operation if required by SDK/smoke
```

Restrict resources to the validation/application bucket and object prefixes where possible, for example:

```text
<bucket>/app-storage-provider-smoke/*
<bucket>/source-assets/*
<bucket>/draft-inputs/*
<bucket>/knowledge/*
```

Do not grant broad admin permissions unless temporarily unavoidable for setup; if broader permissions are used for the first test, record that they must be narrowed before production.

## 5. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-18-storage-provider-aliyun-oss-sdk.md
docs/handoff/2026-05-18-storage-provider-aliyun-oss-sdk-handoff.md
docs/架构规范/2026-05-16-storage-provider-adapter-plan.md
```

Inspect before running validation:

```text
app/scripts/check-domestic-storage-provider-smoke.mjs
app/src/server/storage/aliyun-oss-provider.ts
app/src/lib/ui/video-workflow.ts
app/src/server/api/media-service.ts
deploy/domestic/env/app.env.example
app/.env.example
```

## 6. Validation Steps

### 6.1 Secret-safe env setup

Create a local-only env file outside Git or use the server's runtime env location. Suggested local-only file:

```text
/tmp/jingjing-aliyun-oss-validation.env
```

Never place real secrets into:

```text
docs/
app/.env.example
deploy/domestic/env/*.example
git-tracked files
chat final replies
```

### 6.2 App SDK roundtrip

Run:

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
put/read/delete passed
signedDownloadStatus=200
signedDownloadMatched=true
deleted=true
no secret values printed
```

If this fails:

- classify whether it is credentials, endpoint, bucket, RAM policy, CORS, SDK, or code.
- do not proceed to browser signed PUT until server roundtrip passes.

### 6.3 Signed PUT upload validation

Prefer the smallest validation that exercises Batch 9B's browser upload intent shape.

Option A, if a branch-built app can be started safely:

```text
start local production app with STORAGE_PROVIDER=aliyun_oss and real env
create or reuse isolated merchant/user/owner fixture
call /api/media/upload-intents
PUT a small file to uploadUrl
call /api/media/complete
verify asset_objects row has storage_provider=aliyun_oss and expected storage_key
verify signed read URL fetch can read the object
cleanup object and DB fixture
```

Option B, if route fixture setup is too broad:

```text
call provider issueBrowserUploadIntent through a focused script/smoke
PUT a small file to uploadUrl with Content-Type
read back through signed read URL
delete object
record route-level validation as pending
```

If CORS blocks browser upload, record exact CORS failure and required CORS change. Do not bypass by making the bucket public.

### 6.4 Tencent regression

Run existing Tencent regression so Batch 9B-V does not accidentally break Singapore rehearsal:

```text
Singapore /api/health
Singapore real Tencent COS roundtrip
Batch 8 merchant credits/usage smoke
Batch 7 material library smoke
```

## 7. Expected Outputs

Add validation docs:

```text
docs/progress/2026-05-18-real-aliyun-oss-validation.md
docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
```

Only make code changes if validation exposes a real Batch 9B bug. If only env/CORS/RAM needed adjustment, prefer docs-only commit.

Progress must include:

- Aliyun bucket/region/endpoint values, but no access keys/secrets
- CORS settings summary
- RAM permission scope summary
- exact roundtrip command and redacted result
- signed PUT result
- cleanup result
- Tencent regression result
- remaining blocker, if any

Handoff must include:

- branch/worktree
- starting commit
- final commit
- changed files
- whether `025fa33` was pushed to Gitee before validation
- whether final validation commit was pushed
- whether app Aliyun OSS is ready for Batch 9C worker migration

## 8. Completion Conditions

This validation batch is complete only when:

- current `025fa33` was pushed to Gitee before work
- real Aliyun OSS server roundtrip passes, or a precise external blocker is recorded
- signed PUT upload validation passes, or a precise CORS/RAM/code blocker is recorded
- Tencent COS regression still passes
- no secrets are committed or printed in docs/final reply
- worktree is clean
- final commit exists, at least docs/progress + handoff
- no main merge
- no forbidden completion marker

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

## 9. Recommended Final Reply Shape

When done, report:

```text
Completed Batch 9B-V real Aliyun OSS validation.

Final HEAD:
<hash> <message>

Aliyun OSS:
server roundtrip passed / blocked
signed PUT passed / blocked
bucket/region/endpoint redacted-safe summary

Tencent regression:
...

Changed files:
...

Gitee:
...

Out of scope:
worker storage, TTS, FireRed/OpenStoryline, COS->OSS backfill, main merge, completion marker.

Recommended next batch:
Batch 9C worker storage client + aliyun_oss input/output support, only if app Aliyun OSS validation passed.
```
