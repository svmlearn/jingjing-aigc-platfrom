# 2026-05-18 Real Aliyun OSS Validation Handoff

## Goal

Execute Batch 9B-V from:

```text
docs/handoff/2026-05-18-p1-storage-provider-batch9b-real-aliyun-oss-validation-task.md
```

This batch validates the already-implemented app-side Aliyun OSS SDK path before any worker migration starts.

## Branch / Worktree

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
starting commit: 025fa33db35e13f9a29265c2b65661ce2e6fd7c1
final commit: branch HEAD after this handoff is committed; exact hash is reported in the final reply
```

## Backup State

The requested pre-validation backup was pushed before this docs-only validation batch:

```text
gitee/codex/domestic-infra-migration = 025fa33db35e13f9a29265c2b65661ce2e6fd7c1
```

## Completed

- Checked Batch 9B progress/handoff and storage adapter plan.
- Checked Alibaba Cloud official OSS CORS, pre-signed URL upload, and RAM policy docs.
- Verified local and Singapore environments do not currently provide real Aliyun OSS validation env.
- Ran Aliyun missing-env smoke in non-roundtrip and roundtrip modes.
- Ran Tencent COS regression locally and on Singapore.
- Ran Singapore app env preflight and DB non-regression smokes.
- Recorded the exact blocker and next required operator actions.

## Changed Files

```text
docs/progress/2026-05-18-real-aliyun-oss-validation.md
docs/handoff/2026-05-18-real-aliyun-oss-validation-handoff.md
```

No app/worker code changes were made.

## Validation Summary

Aliyun OSS:

```text
server roundtrip: blocked
signed PUT upload: blocked
blocker: no real Aliyun OSS env was available
```

Evidence:

```text
/tmp/jingjing-aliyun-oss-validation.env: missing
current shell Aliyun env: missing
Singapore /etc/jingjing/app.env: missing
non-roundtrip smoke: status=pending, code=OSS_NOT_CONFIGURED
roundtrip smoke: status=missing_environment, code=OSS_NOT_CONFIGURED, exit_code=2
```

Tencent regression:

```text
local tencent_cos adapter smoke: status=ok
Singapore /api/health: ok=true
Singapore real Tencent COS roundtrip: status=ok, signedDownloadMatched=true, deleted=true
Singapore app preflight: status=ok
Singapore merchant credits/usage smoke: status=ok
Singapore material library smoke: status=ok
```

## Push / Merge State

```text
025fa33 pushed to Gitee before validation: yes
final validation commit pushed after docs-only commit: no, unless explicitly done later
main merged: no
completion marker written: no
```

## Is App Aliyun OSS Ready For Batch 9C?

No.

Reason:

```text
Real Aliyun OSS server roundtrip and signed PUT validation have not passed.
The blocker is missing real Aliyun OSS env, not a confirmed app code failure.
```

Do not start worker storage migration until a follow-up Batch 9B-V rerun passes:

```text
node app/scripts/check-domestic-storage-provider-smoke.mjs --env-file /tmp/jingjing-aliyun-oss-validation.env --provider aliyun_oss --roundtrip
```

And a signed PUT validation against the real bucket passes.

## Next Required Inputs

Create a local-only env file outside Git:

```text
/tmp/jingjing-aliyun-oss-validation.env
```

Required keys:

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

Bucket setup required before browser signed PUT validation:

```text
ACL: private
CORS: allow PUT/GET/HEAD, allow Content-Type or *, expose ETag and x-oss-request-id
RAM: PutObject/GetObject/DeleteObject scoped to validation and app prefixes
```

## Explicitly Not Done

- No worker storage migration.
- No worker/TTS/FireRed/OpenStoryline changes.
- No COS to OSS backfill.
- No bucket CORS or RAM policy mutation.
- No main merge.
- No completion marker.
