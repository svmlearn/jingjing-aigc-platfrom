# 2026-05-13 domestic phase1 real-resource runbook

## 1. Scope

This runbook is for first-phase domestic IP verification only.

Do:

- run the app on a domestic server IP
- use domestic PostgreSQL
- use private Tencent COS in a mainland region
- run video-worker at `WORKER_MAX_CONCURRENCY=1`
- record evidence in `docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md`

Do not:

- switch `ba-ba-ke.com`
- start ICP filing actions
- merge this branch to `main`
- claim 2-3 worker concurrency
- touch unrelated Dify results

## 2. Required inputs

Prepare these outside Git:

- domestic app server IP
- PostgreSQL connection string
- COS bucket
- COS region
- COS secret id / key
- first owner email and temporary password
- worker host root, default `/srv/jingjing-video-worker`
- provider keys required by FireRed / OpenStoryline / TTS

Never paste secrets into progress or handoff docs.

## 3. Database bootstrap

On a machine with `psql` access to the domestic PostgreSQL database:

```bash
psql "$DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
```

Create the first owner and merchant:

```bash
HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
psql "$DATABASE_URL" \
  -v user_email='owner@example.com' \
  -v password_hash="$HASH" \
  -v display_name='Domestic Test Owner' \
  -v merchant_name='Domestic Test Merchant' \
  -f app/db/seeds/domestic_minimal_seed.example.sql
```

Optional API smoke fixture:

```bash
psql "$DATABASE_URL" \
  -v user_email='owner@example.com' \
  -f app/db/seeds/domestic_video_chain_fixture.example.sql
```

## 4. App env and health

Create `app/.env.production` on the server. Required first-phase keys:

```bash
DATABASE_PROVIDER=postgres
APP_DATABASE_URL=
APP_SESSION_COOKIE=jingjing_session
APP_SESSION_SECURE_COOKIE=false
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=ap-guangzhou
VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1
```

Run local preflight on the app server:

```bash
node app/scripts/check-domestic-app-env.mjs --env-file app/.env.production
node app/scripts/check-domestic-cos-roundtrip.mjs --env-file app/.env.production
```

Start the app with the production env, then verify:

```bash
curl -sS -i "http://<domestic-ip>:<port>/api/health"
```

Record the redacted response in the e2e verification doc.

## 5. COS browser upload prerequisites

Before mobile testing, verify COS browser upload policy manually in Tencent Cloud:

- bucket is private
- bucket region matches app / worker region plan
- CORS allows the domestic IP origin used for phase1
- methods include `PUT`, `POST`, `GET`, `HEAD`
- request headers include `*` or the exact headers used by COS JS SDK
- exposed headers include `ETag`
- credentials used by app can issue STS upload credentials

Then test from the app page, not just server CLI:

- `/api/media/upload-intents` returns domestic bucket / region / key prefix
- browser upload writes an object under `draft-inputs/<merchantId>/<draftId>/...`
- `/api/media/complete` writes `asset_objects.bucket_name + storage_key`
- if using the video workbench test button, `POST /api/content/video-scripts/test-draft` returns a draft with one approved video script variant and three `productionScenes`

Optional API-only smoke after the app is running:

```bash
DOMESTIC_SMOKE_EMAIL='owner@example.com' \
DOMESTIC_SMOKE_PASSWORD='<temporary-password>' \
node app/scripts/check-domestic-video-chain-api-smoke.mjs \
  --env-file app/.env.production \
  --base-url "http://<domestic-ip>:<port>"
```

Add `--with-upload-intent` when real Tencent COS credentials are ready and you want the smoke to call `/api/media/upload-intents` before `/api/media/complete`.

Expected:

- login returns `303`
- test draft returns `201`
- optional upload intent returns `201` when `--with-upload-intent` is set
- media metadata complete returns `201`
- video job create returns `201`
- job is `pending`
- `inputPayload.render_mode=asset_driven`

Even with `--with-upload-intent`, this script does not upload bytes to COS, run worker, verify `final.mp4`, or replace the mobile browser e2e.

## 6. Worker env and smoke

Create `workers/video-worker/.env` on the worker host:

```bash
VIDEO_WORKER_HOST_ROOT=/srv/jingjing-video-worker
WORKER_DATABASE_URL=
WORKER_COS_SECRET_ID=
WORKER_COS_SECRET_KEY=
WORKER_COS_BUCKET=
WORKER_COS_REGION=ap-guangzhou
WORKER_COS_RESULT_PREFIX=video-results
WORKER_MAX_CONCURRENCY=1
OPENSTORYLINE_BASE_URL=http://openstoryline-engine:8000
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
FIRERED_OPENSTORYLINE_BASE_URL=http://firered-openstoryline:7860
```

Create host directories:

```bash
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs,firered/.storyline,firered/resource,firered/outputs}
```

Validate compose before starting services:

```bash
docker compose -f workers/video-worker/docker-compose.yml config --quiet
docker compose -f workers/video-worker/docker-compose.yml -f workers/video-worker/docker-compose.firered.yml --profile firered config --quiet
```

Run real I/O smoke after env is ready:

```bash
PYTHONPATH=workers/video-worker:workers/video-worker/openstoryline \
python -m worker.app.real_io_smoke
```

Expected:

- database `select 1` succeeds
- `asset_objects` and `video_edit_jobs` tables exist
- COS put / download / delete succeeds

## 7. Start worker services

For FireRed phase1:

```bash
cd workers/video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered up -d --build
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered ps
```

Required healthy services:

- `firered-openstoryline`
- `openstoryline-engine`
- `video-worker`

Do not increase `WORKER_MAX_CONCURRENCY` above `1` in phase1.

## 8. Mobile e2e

Use a real phone browser against the domestic IP.

Record every item in `docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md`:

- phone and browser
- app IP / port
- login result and cookie presence
- uploaded source material key
- `asset_objects.id`
- `video_edit_jobs.id`
- worker `worker_id`, `claimed_at`, `heartbeat_at`
- worker stage timings
- final `final.mp4` COS key
- signed download / preview result

Only after this passes should the completion pass marker be added to the e2e verification doc.

## 9. Failure and rollback notes

If a job stalls:

```sql
select id, status, current_stage, worker_id, claimed_at, heartbeat_at, failure_code, failure_reason
from public.video_edit_jobs
order by created_at desc
limit 20;
```

If a worker must be restarted:

```bash
cd workers/video-worker
docker compose restart video-worker
```

If the test must be abandoned:

- stop app process
- stop worker compose services
- keep PostgreSQL rows for diagnosis unless they contain sensitive uploaded material
- remove temporary COS smoke objects if any remain
- record the failed point in the e2e verification doc
