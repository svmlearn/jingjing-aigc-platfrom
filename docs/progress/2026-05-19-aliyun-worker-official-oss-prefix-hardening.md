# 2026-05-19 Aliyun Worker Official OSS Prefix Hardening

## Scope

Batch 10C moved Aliyun worker final video output from the temporary storage-smoke prefix back to the official worker result prefix.

Guardrails kept:

- Did not merge `main`.
- Did not write the Phase 1 completion marker.
- Did not change DNS, ICP, RDS public access, OSS ACL, or OSS public-access block.
- Did not print or commit env secrets, AccessKey Secret, RDS password, tokens, or cookies.
- Did not configure FireRed real runtime.
- Did not handle TTS/voiceover.

## Pre-Work Backup

- Pre-work backup pushed: `1a6b9c2` to `gitee/codex/domestic-infra-migration`.

## OSS Prefix Audit

Relevant Aliyun OSS prefixes after this batch:

- `source-assets/*`: retained for source/material asset reads and writes.
- `draft-inputs/*`: retained for app signed PUT uploads and worker input reads.
- `knowledge/*`: retained for knowledge uploads.
- `app-storage-provider-smoke/*`: retained only for app storage smoke validation.
- `app-storage-provider-smoke/video-results/*`: no longer used for formal worker output.
- `video-results/*`: official worker final output prefix.

Worker configuration on ECS:

- Before: `WORKER_STORAGE_RESULT_PREFIX=app-storage-provider-smoke/video-results`.
- After: `WORKER_STORAGE_RESULT_PREFIX=video-results`.

## RAM Policy Change

RAM user:

- `jingjing-domestic-oss-phase1`

Policy:

- `jingjing-domestic-phase1-oss-prefix-policy`
- Default version after update: `v2`.

Only one resource scope was added:

```text
acs:oss:*:*:jingjing-domestic-phase1-hz/video-results/*
```

Actions remained limited to:

```text
oss:PutObject
oss:GetObject
oss:DeleteObject
oss:GetObjectMeta
```

The policy remains prefix-scoped. No whole-bucket wildcard was added.

Default v2 resource scopes:

```text
acs:oss:*:*:jingjing-domestic-phase1-hz/app-storage-provider-smoke/*
acs:oss:*:*:jingjing-domestic-phase1-hz/source-assets/*
acs:oss:*:*:jingjing-domestic-phase1-hz/draft-inputs/*
acs:oss:*:*:jingjing-domestic-phase1-hz/knowledge/*
acs:oss:*:*:jingjing-domestic-phase1-hz/video-results/*
```

## Code

Code commit:

- `52ce51d test: assert aliyun worker result prefix`

Changes:

- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
  - Added `--expect-result-prefix`.
  - Reports final result asset id/provider/bucket/key.
  - Fails the smoke if the final result key does not start with the expected prefix.
- `workers/video-worker/tests/test_openstoryline_client.py`
  - Fixed the test-only `httpx` stub so it does not shadow real `httpx` when installed.
  - This unblocked full worker/OpenStoryline/FastAPI unittest discovery.

## Local Verification

Passed:

- `PYTHONPATH=workers/video-worker /tmp/jingjing-worker-integration-venv/bin/python -m unittest discover workers/video-worker/tests`
  - `102` tests passed.
- `/tmp/jingjing-worker-integration-venv/bin/python -m compileall workers/video-worker/worker/app workers/video-worker/openstoryline workers/video-worker/tests`
- `node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `git diff --check`
- `cd app && corepack pnpm@10.20.0 typecheck`
- `cd app && corepack pnpm@10.20.0 lint`
- `cd app && corepack pnpm@10.20.0 build`

Note: an initial unittest discovery run exposed a test-only `httpx` shadowing issue. The runtime code was not changed for that; the test helper was corrected and discovery then passed.

## ECS Release

Deployed clean archive from `52ce51d`.

- Release path: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- `/srv/jingjing-domestic/current`: points to that release.
- App build on ECS: passed.
- Worker env permissions were preserved; only the non-secret result prefix value was changed.

Services:

- `jingjing-domestic-app.service`: active.
- `nginx`: active.
- `jingjing-openstoryline-engine.service`: active.
- `jingjing-video-worker.service`: active.
- OpenStoryline `/ready`: `engine_adapter=skeleton`.

## Aliyun Validation

Public health check through Nginx:

- URL: `http://8.154.28.41/api/health`
- Result: `ok=true`.
- DB provider: `postgres`.
- Storage provider: `aliyun_oss`.
- Bucket: `jingjing-domestic-phase1-hz`.
- Region: `oss-cn-hangzhou`.

Aliyun OSS app roundtrip:

- Status: ok.
- Prefix: `app-storage-provider-smoke/*`.
- Signed download status: `200`.
- Download matched upload: true.
- Smoke object deleted: true.

Aliyun OSS signed PUT / CORS:

- Status: ok.
- Origin: `http://8.154.28.41`.
- Preflight status: `200`.
- Allowed methods: `GET, PUT, HEAD`.
- PUT status: `200`.
- Signed download status: `200`.
- Download matched upload: true.
- Smoke object deleted: true.

Worker real IO smoke:

- Status: ok.
- Storage provider: `aliyun_oss`.
- DB `select 1`: ok.
- Required tables present: `asset_objects`, `video_edit_jobs`.
- Roundtrip key: `video-results/worker-real-smoke/6ba2298b4aac422ca364d7d837cde8f4.txt`.
- Roundtrip matched upload: true.
- Smoke object deleted: true.

Video-chain API smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Signed PUT status: `200`.
- Media complete status: `201`.
- Job create status: `201`.
- No 409 regression.
- Job ID: `0a2d6dc2-f75f-462c-b64a-6347ca095970`.
- Media asset ID: `44fb5955-38ab-4f4d-9255-8eaaf1ec9f21`.
- Upload intent key: `draft-inputs/e150aa8f-5933-4c5d-a9f4-e0a6e8b9bd7b/05d6bec2-d458-45df-a5f0-9c65fdb8067b/05722c42-b1ef-4aee-8d88-904165625fc5-codex-domestic-api-smoke.mp4`.

Worker fast-path smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Job ID: `ec553c80-13bc-41d3-863b-319f99f97850`.
- Input media asset ID: `72f6d914-1ae6-491b-bd1d-396b74fb9534`.
- Final video asset ID: `c6976766-ae01-4f38-ac99-5b9579a26668`.
- Final job status: `succeeded`.
- Final stage: `completed`.
- Final asset storage provider: `aliyun_oss`.
- Final asset bucket: `jingjing-domestic-phase1-hz`.
- Final asset key: `video-results/e150aa8f-5933-4c5d-a9f4-e0a6e8b9bd7b/ec553c80-13bc-41d3-863b-319f99f97850/final.mp4`.
- Expected prefix: `video-results/`.
- Expected prefix matched: true.
- Preview status: `200`.
- Preview bytes: `13952`.

Cleanup:

- Temporary smoke login user `official-prefix-smoke-1779125812@example.test` was disabled after validation.
- Smoke jobs and generated assets were retained as validation evidence.

## FireRed / TTS Status

FireRed normal no-voiceover was not run in this batch.

Current precondition:

- OpenStoryline engine is active with skeleton adapter.
- FireRed real runtime remains out of scope.
- `FIRERED_*` runtime configuration was not changed.
- TTS/voiceover remains out of scope.

## Residual Risk

- RDS still uses `sslmode=disable`; this remains the Phase 1 private-network temporary stance.
- Worker deployment remains systemd venv based, not Docker Compose, due earlier mainland Docker Hub pull issues.
- OpenStoryline is still skeleton for this validation. Official prefix hardening is validated for storage contract and fast-path output, not full FireRed real runtime.
- RAM policy v1 remains as an older non-default version; default policy is v2.
