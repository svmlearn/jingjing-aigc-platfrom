# 2026-05-16 Singapore self-hosted rehearsal redeploy evidence

## 1. Result

- Singapore self-hosted rehearsal: passed.
- Domestic real Phase 1: still pending.
- Project long-task: still `blocked`.
- Push / merge: not pushed, not merged.
- Domestic completion marker: not written.

This is not a domestic completion record. It proves the reusable Singapore
self-hosted rehearsal path after rebuilding from commit `f03765cd1afc`.

## 2. Resource复核

Remote target:

- Server: `43.160.208.189`
- SSH user used: `ubuntu`
- Rehearsal release:
  `/srv/jingjing-selfhost-rehearsal/releases/20260516T025158Z-f03765cd1afc`
- Current symlink:
  `/srv/jingjing-selfhost-rehearsal/current`
- Current revision:
  `f03765cd1afc6bd05a5fccfee694c8f974d47008`

PostgreSQL:

- Container: `jingjing-selfhost-pg`
- Image: `postgres:17`
- Status before redeploy: existed but was stopped.
- Start/connect check: passed.
- DB: `jj_selfhost`
- Public schema tables: `16`
- Seed still present: `app_users=1`, `merchant_profiles=1`
- Previous rehearsal records still present: `video_edit_jobs=2`,
  `succeeded_jobs=1`, `asset_objects=3`

Env files:

- `/etc/jingjing/app.env` and `/etc/jingjing/worker.env` were initially missing.
- Existing rehearsal env files were found under
  `/srv/jingjing-selfhost-rehearsal/app.env` and
  `/srv/jingjing-selfhost-rehearsal/worker.env`.
- Installed both to `/etc/jingjing/` with `root:root` and `0600`.
- Secret values were not printed.

Non-secret env facts:

- App: `DATABASE_PROVIDER=postgres`, `APP_DATABASE_SSL=disable`,
  `APP_SESSION_SECURE_COOKIE=false`, `COS_BUCKET=jj-content-staging-1341668543`,
  `COS_REGION=ap-singapore`, `PORT=3002`,
  `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1`
- Worker: `WORKER_ID=singapore-selfhost-rehearsal-worker-01`,
  `WORKER_MAX_CONCURRENCY=1`, `WORKER_COS_BUCKET=jj-content-staging-1341668543`,
  `WORKER_COS_REGION=ap-singapore`,
  `WORKER_COS_RESULT_PREFIX=video-results/selfhost-rehearsal`,
  `OPENSTORYLINE_ENGINE_ADAPTER=fire_red`

## 3. Rebuild / redeploy

Rebuilt from commit `f03765cd1afc`, not from hot-patched running containers.

App:

- Synced tracked source with `git archive HEAD`.
- Built app in Docker `node:22-bookworm-slim`.
- Explicit pnpm version: `10.20.0`.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm build`: passed, Next.js `16.2.4`.
- systemd unit: `jingjing-selfhost-app.service`
- Runtime: Docker Node app with `/etc/jingjing/app.env`
- Internal health: `http://127.0.0.1:3002/api/health` returned `200`.

IP-stage public access:

- `http://43.160.208.189:3002/api/health`: still timed out externally.
- Host firewall/ufw did not block it; this is consistent with cloud security
  group not opening `3002`.
- Added `jingjing-ip-stage-nginx.service` using `nginx:1.27-alpine` on port
  `80`, reverse proxying to `127.0.0.1:3002`.
- Public checks passed:
  - `http://43.160.208.189/nginx-health`: `200`
  - `http://43.160.208.189/api/health`: `200`
  - `http://43.160.208.189/`: `200`

Worker stack:

- systemd unit: `jingjing-worker-compose.service`
- Working directory:
  `/srv/jingjing-selfhost-rehearsal/current/workers/video-worker`
- Compose command used `/etc/jingjing/worker.env`.
- Rebuilt and recreated:
  - `firered-openstoryline`
  - `openstoryline-engine`
  - `video-worker`
- Post-rebuild health:
  - `firered-openstoryline`: healthy
  - `openstoryline-engine`: healthy
  - `video-worker`: running

## 4. Verification commands

Passed:

- App preflight:
  `node scripts/check-domestic-app-env.mjs --env-file /etc/jingjing/app.env --require-video-chain-test-entrypoint`
- App COS roundtrip:
  `node scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env --prefix selfhost-rehearsal/redeploy-app-cos-smoke`
  - bucket: `jj-content-staging-1341668543`
  - region: `ap-singapore`
  - signed download status: `200`
  - bytes matched
  - smoke object deleted
- Public API smoke:
  `check-domestic-video-chain-api-smoke.mjs --base-url http://43.160.208.189 --with-upload-intent`
  - login: `303`
  - test draft: `201`
  - upload intent: `201`
  - media complete: `201`
  - job create: `201`
  - job: `c76ee5f4-a9b6-4d28-a232-f435c983a6ed`
  - expected limitation: this smoke does not upload media bytes; worker later
    failed this job at `downloading_inputs_failed`, which is expected for this
    smoke shape.
- Worker real I/O smoke:
  `python -m app.real_io_smoke --env-file /etc/jingjing/worker.env`
  - `WORKER_MAX_CONCURRENCY=1`
  - DB checks passed
  - COS put/download/delete passed
- Worker unittest:
  - First attempt in plain `python:3.11-slim` failed only because that image
    lacked `ffmpeg`.
  - Re-run in rebuilt `jingjing-video-worker-openstoryline-engine` image passed:
    `Ran 51 tests in 3.703s OK`.

## 5. Browser-side rehearsal

Browser target:

- Opened `http://43.160.208.189/dashboard/video?testMode=video_chain`.
- Logged in as the disposable owner through the app login page.
- Screenshot evidence saved locally:
  `/tmp/jingjing-rehearsal/ip-stage-dashboard-video.png`

COS CORS:

- First browser direct upload attempt failed at `cos_upload`:
  `CORS blocked or network error`.
- Attempting to change bucket CORS with runtime COS Secret returned
  `AccessDenied`, so runtime keys do not have bucket CORS management permission.
- Used Tencent Cloud console browser session to edit the existing bucket CORS
  rule and add origin `http://43.160.208.189`.
- Console showed: `设置跨域访问CORS配置成功`.
- No purchase, ICP, domain switch, or agreement action was performed.

Normal FireRed browser job:

- Job id: `677d58da-2dbb-454c-9581-23f2a2502e1b`
- Browser actions:
  - created test draft
  - requested upload intent
  - uploaded `3235` byte synthetic mp4 to Singapore COS
  - called `media complete`
  - created `video_edit_jobs`
- Input key:
  `draft-inputs/52cac9bf-73f6-4af8-adea-866431f96edf/f032e316-f2a5-4854-8355-b280977f2649/459550a1-c7b8-4fe9-aa0f-495729debe54-browser-selfhost-fast.mp4`
- Media asset id:
  `24cc4623-3974-4019-bddc-260853d53707`
- Worker:
  - claimed job
  - downloaded COS input
  - invoked OpenStoryline / FireRed
  - completed normal `staging_worker` path
- Final status: `succeeded`
- Result keys:
  - `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/677d58da-2dbb-454c-9581-23f2a2502e1b/final.mp4`
  - `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/677d58da-2dbb-454c-9581-23f2a2502e1b/cover.jpg`
  - `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/677d58da-2dbb-454c-9581-23f2a2502e1b/subtitles.srt`
- Final video bytes: `16642`

Fast-path browser job:

- Job id: `c5db6030-b12b-435d-953a-183be88fbcc3`
- Browser actions:
  - created test draft
  - requested upload intent
  - uploaded `3235` byte synthetic mp4 to Singapore COS
  - called `media complete`
  - created `video_edit_jobs`
- Input key:
  `draft-inputs/52cac9bf-73f6-4af8-adea-866431f96edf/d5d892b5-35ec-4823-ba80-07acdea2fa30/2ef5aeae-7ace-4fa9-a8f0-39b136942701-browser-selfhost-fastpath.mp4`
- Media asset id:
  `3eece76c-6e33-4121-817a-bea239e273df`
- Before starting worker, DB was patched and verified:
  - `executionMode=self_hosted_rehearsal_fast_path`
  - `desiredOutputs=["final_video"]`
  - `runtime_payload.self_hosted_rehearsal_fast_path=true`
- Worker:
  - claimed job
  - downloaded COS input
  - invoked OpenStoryline / FireRed fast path
  - uploaded `final.mp4`
- Final status: `succeeded`
- Result key:
  `video-results/selfhost-rehearsal/52cac9bf-73f6-4af8-adea-866431f96edf/c5db6030-b12b-435d-953a-183be88fbcc3/final.mp4`
- Final video bytes: `3235`

Browser re-sign / preview:

- Browser fetched job detail through the app after completion.
- Normal job:
  - detail status: `200`
  - result assets: `3`
  - signed preview URL present: yes
  - browser fetch signed URL: `200`
  - downloaded bytes: `16642`
- Fast-path job:
  - detail status: `200`
  - result assets: `1`
  - signed preview URL present: yes
  - browser fetch signed URL: `200`
  - downloaded bytes: `3235`

## 6. Interpretation

What passed:

- App can be rebuilt and run off Vercel from commit `f03765cd1afc`.
- App/API can use same-host plain PostgreSQL.
- Disposable owner login works through public Singapore IP-stage URL.
- Public IP-stage browser access works through port `80`.
- Browser direct COS upload works after adding the IP-stage CORS origin.
- `media complete` writes asset metadata to PostgreSQL.
- `video_edit_jobs` are created from the browser-authenticated app path.
- Worker can claim jobs from PostgreSQL, download Singapore COS inputs, invoke
  OpenStoryline/FireRed, upload outputs to Singapore COS, write DB results, and
  app can re-sign the result URLs for browser preview/download.
- Normal FireRed path passed once with a small synthetic video.
- Fast path passed separately and is recorded only as infrastructure wiring
  evidence.

What this does not prove:

- Domestic ECS/RDS/OSS/ICP readiness.
- Mainland network latency or mainland object storage behavior.
- Long-term FireRed stability under real creative workloads or larger inputs.
- Real user selfie / voice-clone / sensitive client material handling.

## 7. Server resource data

Final observed server state after rebuild and browser rehearsal:

- CPU: `2` vCPU, Intel Xeon E5-26xx v4
- Memory: `3.6Gi` total, `1.7Gi` used, `1.9Gi` available
- Swap: `1.9Gi` total, `198Mi` used
- Disk `/`: `59G` total, `38G` used, `19G` available, `67%`
- Docker:
  - Images: `8`, size `24.64GB`
  - Containers: `7`
  - Volumes: `2`, `98.3MB`
  - Build cache: `24.04GB`, reclaimable `23.78GB`

Capacity note:

- The 2C4G Singapore server completed this small rehearsal, but Docker image
  and build cache pressure is high. For Monday's Alibaba Cloud purchase, the
  planned 8C16G ECS + RDS + OSS remains the safer baseline.

## 8. Guardrails

- `ba-ba-ke.com` was not switched.
- ICP was not started.
- No real sensitive user material was used.
- No `DOMESTIC_PHASE1_E2E_PASS` marker was written.
- `DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE` was not written.
- `.codex/long-task/active.json` remains `status: blocked`.
- No push and no merge.
