# 2026-05-18 Aliyun Worker Storage Contract Deployment

## Scope

Batch 10B completed the app/worker storage contract fix and Aliyun ECS worker validation.

Guardrails kept:

- Did not deploy FireRed, OpenStoryline FireRed profile, or TTS/voiceover.
- Did not change DNS, ICP, RDS public access, OSS ACL, or OSS public-access block.
- Did not merge `main`.
- Did not write `DOMESTIC_PHASE1_E2E_PASS`.
- Did not print or commit env secrets.

## Code

- Pre-work backup pushed: `d576c48` to `gitee/codex/domestic-infra-migration`.
- Code commit: `41cf9a3 fix: support aliyun oss video worker storage`.
- App/worker release path on ECS: `/srv/jingjing-domestic/releases/20260519001238-41cf9a3`.
- `/srv/jingjing-domestic/current` points to the release above.

Changed behavior:

- `video-chain` app payload now accepts both `tencent_cos` and `aliyun_oss` input assets.
- Worker input contract now carries `storage_provider` through download, processing, upload, result payload, and `asset_objects` writeback.
- Worker output storage can be selected with `WORKER_STORAGE_PROVIDER`.
- Smoke scripts now support `aliyun_oss` signed PUT in addition to Tencent COS STS shape checks.
- Tencent COS compatibility was retained in the app contract, worker model, storage client, and smoke scripts.

## Local Verification

Passed:

- `node --check app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `node --check app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `python3 -m compileall workers/video-worker/worker/app`
- `python3 -m compileall workers/video-worker/worker/app workers/video-worker/tests`
- `PYTHONPATH=workers/video-worker python3 -m unittest ...test_processor_contract.py ...test_real_io_smoke.py ...test_openstoryline_client.py` - 30 tests passed.
- `cd app && node --test src/server/api/video-job-payload.test.ts src/server/api/video-job-public-dto.test.ts` - 19 tests passed.
- `cd app && corepack pnpm@10.20.0 typecheck`
- `cd app && corepack pnpm@10.20.0 lint`
- `cd app && corepack pnpm@10.20.0 build`
- `git diff --check`

Note: `pnpm exec tsx --test ...` was not used because `tsx` is not installed in the app dev dependencies; Node 24 native `node --test` was used for the touched TS tests.

## ECS Deployment

App:

- `jingjing-domestic-app.service`: active.
- Nginx: active.
- `/api/health`: `ok=true`, DB provider `postgres`, storage provider `aliyun_oss`, bucket `jingjing-domestic-phase1-hz`.

Worker:

- Docker Compose path was attempted first, but the ECS host has `docker-compose` v1 and the repo compose file contains top-level `name:`.
- A runtime compose copy without `name:` was generated, but Docker Hub pull for `python:3.11-slim` timed out from the ECS host.
- To avoid changing Docker registry mirrors, worker was deployed from the same clean release using Python venv + systemd:
  - `jingjing-openstoryline-engine.service`: active, skeleton adapter, bound to `127.0.0.1:8000`.
  - `jingjing-video-worker.service`: active, `WORKER_MAX_CONCURRENCY=1`.
- Worker env: `/srv/jingjing-domestic/shared/env/worker.env`, mode `600`, derived from app env without printing values.

Temporary Phase 1 worker output prefix:

- Current RAM policy allows `app-storage-provider-smoke/*` but rejected `worker-real-smoke/*`.
- Worker output and real-IO smoke were temporarily scoped under `app-storage-provider-smoke/*`:
  - `WORKER_STORAGE_RESULT_PREFIX=app-storage-provider-smoke/video-results`
  - `REAL_IO_SMOKE_STORAGE_PREFIX=app-storage-provider-smoke/worker-real-smoke`
- Follow-up should add a dedicated `video-results/*` minimum-permission prefix and move worker output back to `video-results`.

## RDS State

- Public schema table count: `45`.
- Migration tracking table: not present (`schema_migrations`, `supabase_migrations`, `_prisma_migrations` not found).
- Key tables present: `app_users`, `asset_objects`, `content_generation_batches`, `content_generation_jobs`, `merchant_profiles`, `video_edit_jobs`.
- Migrations are therefore recorded as schema-observed rather than migration-table-tracked.

## Validation Results

Aliyun OSS app roundtrip:

- Status: ok.
- Bucket: `jingjing-domestic-phase1-hz`.
- Region: `oss-cn-hangzhou`.
- Key prefix: `app-storage-provider-smoke/*`.
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
- DB `select 1`: ok.
- Required worker tables present: `asset_objects`, `video_edit_jobs`.
- Storage provider: `aliyun_oss`.
- Roundtrip key: `app-storage-provider-smoke/worker-real-smoke/3ed95cde1bf6460d85927bf176127420.txt`.
- Roundtrip matched upload: true.
- Smoke object deleted: true.

Video-chain API smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Signed PUT status: `200`.
- Media complete status: `201`.
- Job create status: `201`; no longer returns 409.
- Media asset ID: `7d153bad-084e-4c68-971a-4aaf0d698b08`.
- Job ID: `f3280e8b-a19e-40e2-ae81-551904739180`.
- Worker later processed this job to `succeeded`.
- Final video asset ID: `eaa0e26b-736f-427d-afac-b93fd2f88442`.

Worker fast-path smoke:

- Status: ok.
- Provider: `aliyun_oss`.
- Job ID: `f9361384-cc60-4838-a0bc-0e86a99513d0`.
- Input media asset ID: `1f95d8cf-34fa-410f-9748-69f590e8d3ba`.
- Final video asset ID: `2e27ab0a-e63e-436c-b5e5-7c1fedd0c6e0`.
- Final job status: `succeeded`.
- Final stage: `completed`.
- Preview status: `200`.
- Preview bytes: `13952`.
- Final asset storage provider: `aliyun_oss`.
- Final asset bucket: `jingjing-domestic-phase1-hz`.
- Final asset key: `app-storage-provider-smoke/video-results/c8c8eed9-f77a-43c7-857a-0a1818d8bd04/f9361384-cc60-4838-a0bc-0e86a99513d0/final.mp4`.

## Cleanup

- The temporary smoke login user was changed to `disabled` after validation.
- Smoke jobs and generated assets were retained as validation evidence.

## Residual Risk

- RDS still uses `sslmode=disable`; this remains the Phase 1 private-network temporary stance.
- Worker is deployed via systemd venv, not Docker Compose, because Docker Hub base image pulls timed out from ECS.
- Worker output prefix is temporarily under `app-storage-provider-smoke/*` due current RAM prefix permissions. Add `video-results/*` before a production worker run.
- FireRed normal no-voiceover was not run in this batch. Only OpenStoryline skeleton fast-path was validated. TTS/voiceover remains out of scope.
