# 2026-05-18 Aliyun Worker Storage Contract Deployment Handoff

## Current State

Batch 10B is implemented and validated on Aliyun ECS.

- Branch/worktree: `codex/domestic-infra-migration`.
- Code commit: `41cf9a3 fix: support aliyun oss video worker storage`.
- Deployed release: `/srv/jingjing-domestic/releases/20260519001238-41cf9a3`.
- App service: `jingjing-domestic-app.service`, active.
- Nginx: active.
- OpenStoryline service: `jingjing-openstoryline-engine.service`, active, skeleton adapter.
- Worker service: `jingjing-video-worker.service`, active.
- Storage provider in app and worker: `aliyun_oss`.

Do not infer this as full Phase 1 completion. Do not write `DOMESTIC_PHASE1_E2E_PASS`.

## What Changed

The previous blocker was that video-chain job creation rejected `aliyun_oss` input assets and only accepted `tencent_cos`.

Fixed:

- App job payload now allows `tencent_cos` and `aliyun_oss`.
- Worker model now preserves `storage_provider` on input and uploaded assets.
- Worker storage client can download/upload through Tencent COS or Aliyun OSS.
- Worker DB writeback now stores the actual provider instead of hardcoding `tencent_cos`.
- API and worker smoke scripts now support Aliyun OSS signed PUT.
- Tencent COS compatibility remains in place for Singapore/COS rehearsal.

## Deployment Notes

Docker Compose deployment was attempted but not used:

- ECS has `docker-compose` v1, which rejects the repo compose file top-level `name:`.
- After generating a runtime compose copy without `name:`, Docker Hub pull for `python:3.11-slim` timed out.
- To keep scope tight and avoid changing Docker registry mirrors, worker was deployed via Python venv + systemd from the same release directory.

Worker env:

- Path: `/srv/jingjing-domestic/shared/env/worker.env`.
- Mode: `600`.
- Source: derived from `/srv/jingjing-domestic/shared/env/app.env`.
- Secrets were not printed or committed.

Important temporary setting:

- Current RAM policy rejected `worker-real-smoke/*`.
- Worker output prefix is temporarily `app-storage-provider-smoke/video-results`.
- Before production worker runs, add minimum RAM permission for `video-results/*`, then set worker result prefix back to `video-results`.

## Validation Summary

Local:

- `node --check` for touched smoke scripts: passed.
- Python compile: passed.
- Worker targeted unit tests: 30 passed.
- App targeted TS tests: 19 passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `git diff --check`: passed.

ECS:

- `/api/health`: ok, DB `postgres`, storage `aliyun_oss`.
- Aliyun OSS roundtrip: ok.
- Aliyun OSS signed PUT and CORS: ok.
- Worker real IO smoke: ok.
- Video-chain API smoke: job create `201`, no 409.
- Worker fast-path smoke: succeeded; preview `200`.

Key validation IDs:

- API smoke job: `f3280e8b-a19e-40e2-ae81-551904739180`.
- API smoke input media asset: `7d153bad-084e-4c68-971a-4aaf0d698b08`.
- API smoke final video asset: `eaa0e26b-736f-427d-afac-b93fd2f88442`.
- Worker fast-path job: `f9361384-cc60-4838-a0bc-0e86a99513d0`.
- Worker fast-path input media asset: `1f95d8cf-34fa-410f-9748-69f590e8d3ba`.
- Worker fast-path final video asset: `2e27ab0a-e63e-436c-b5e5-7c1fedd0c6e0`.
- Worker fast-path preview: `200`, `13952` bytes.

RDS:

- Public table count: `45`.
- No migration tracking table found.
- Key tables observed: `app_users`, `asset_objects`, `content_generation_batches`, `content_generation_jobs`, `merchant_profiles`, `video_edit_jobs`.

## Next Recommended Batch

Batch 10C should focus on productionizing the worker deployment boundary:

- Add RAM minimum permission for `video-results/*`.
- Move worker output prefix from `app-storage-provider-smoke/video-results` back to `video-results`.
- Decide whether to keep systemd venv deployment or fix Docker deployment with an approved mainland registry mirror.
- Run normal no-voiceover FireRed only after provider/model config is confirmed; keep TTS/voiceover out of scope until then.
- Keep RDS SSL follow-up separate from app/worker validation.

## Files Changed

- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `app/scripts/check-domestic-video-chain-worker-smoke.mjs`
- `app/src/server/api/video-job-payload.ts`
- `app/src/server/api/video-job-payload.test.ts`
- `app/src/server/api/video-job-public-dto.ts`
- `app/src/server/api/video-job-public-dto.test.ts`
- `deploy/domestic/env/worker.env.example`
- `workers/video-worker/.env.example`
- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/worker/app/config.py`
- `workers/video-worker/worker/app/cos_client.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/worker/app/main.py`
- `workers/video-worker/worker/app/models.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/real_io_smoke.py`
- `workers/video-worker/worker/requirements.txt`
- `workers/video-worker/tests/test_openstoryline_client.py`
- `workers/video-worker/tests/test_processor_contract.py`
- `workers/video-worker/tests/test_real_io_smoke.py`
- `docs/progress/2026-05-18-aliyun-worker-storage-contract-deployment.md`
- `docs/handoff/2026-05-18-aliyun-worker-storage-contract-deployment-handoff.md`

## Push / Merge Status

- `d576c48` was pushed to Gitee before work started.
- Code commit `41cf9a3` is local in the migration worktree at handoff time unless explicitly pushed later.
- No merge to `main`.
