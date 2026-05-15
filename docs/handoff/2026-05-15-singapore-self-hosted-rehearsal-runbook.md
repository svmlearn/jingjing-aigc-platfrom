# 2026-05-15 Singapore self-hosted rehearsal runbook

## 1. Scope

This runbook is for a Singapore self-hosted rehearsal. It is not domestic e2e,
not ICP work, and not proof that the domestic phase1 chain has passed.

The rehearsal target is narrower:

- prove the Next.js app and Node API can run outside Vercel
- prove the core chain can use plain PostgreSQL and app-owned sessions instead
  of Supabase SDK / Supabase Auth
- prove app / API / PostgreSQL / COS / video-worker / FireRed can be wired in a
  self-hosted environment
- keep the existing `deploy/domestic` kit reusable, then replace env and region
  later when mainland server, PostgreSQL, and COS are ready

Do not:

- merge this branch to `main`
- push this branch
- switch `ba-ba-ke.com`
- start ICP filing
- add any domestic phase1 pass marker
- claim domestic phase1 completion
- use real user selfie videos, real voice-clone material, or sensitive client
  material during the Singapore rehearsal

Use only synthetic or disposable small media for the video job e2e.

## 2. What can be reused from `deploy/domestic`

Keep `deploy/domestic` in place. The folder name is still domestic because it is
also the future domestic phase1 kit, but the samples are resource-independent
enough for this rehearsal.

Reusable as-is:

- `deploy/domestic/README.md` for single-server layout, app/worker roots, Nginx,
  systemd, and PM2 options
- `deploy/domestic/env/app.env.example` as the app env template
- `deploy/domestic/env/worker.env.example` as the worker env template
- `deploy/domestic/nginx/jingjing-domestic.conf` for IP-based HTTP proxying to
  `127.0.0.1:3000`
- `deploy/domestic/systemd/jingjing-app.service` for `next start`
- `deploy/domestic/systemd/jingjing-worker-compose.service` for the worker
  compose stack
- `deploy/domestic/pm2/ecosystem.config.cjs` if PM2 is preferred over systemd
- `deploy/domestic/scripts/verify-templates.sh` for template presence and syntax
  checks

Reusable app / DB / worker artifacts:

- `app/db/migrations/202605130001_domestic_core_baseline.sql`
- `app/db/seeds/domestic_minimal_seed.example.sql`
- `app/db/seeds/domestic_video_chain_fixture.example.sql`
- `app/scripts/create-domestic-password-hash.mjs`
- `app/scripts/check-domestic-app-env.mjs`
- `app/scripts/check-domestic-cos-roundtrip.mjs`
- `app/scripts/check-domestic-video-chain-api-smoke.mjs`
- `workers/video-worker/docker-compose.yml`
- `workers/video-worker/docker-compose.firered.yml`
- `workers/video-worker/worker/app/real_io_smoke.py`

The script names still say domestic. For this rehearsal, treat them as current
compatibility names and drive the target through env values and command flags.

## 3. Env deltas for Singapore / self-hosted

Start from the two `deploy/domestic/env/*.example` files, then replace the
domestic assumptions below.

| Area | Domestic phase1 value | Singapore self-hosted rehearsal value |
| --- | --- | --- |
| Server target | domestic server IP | existing Singapore server IP |
| Public entry | domestic IP only | Singapore IP or temporary internal test URL; do not switch `ba-ba-ke.com` |
| PostgreSQL | domestic PostgreSQL | plain PostgreSQL on the Singapore server, or temporary ordinary PostgreSQL; do not use Supabase Cloud |
| App DB env | `DATABASE_PROVIDER=postgres`, `APP_DATABASE_URL=...` | same keys, pointed at the Singapore plain PostgreSQL |
| DB SSL | often `require` for managed DB | `disable` if same-host PostgreSQL, `require` only if the chosen PostgreSQL endpoint requires it |
| Sessions | app-owned `jingjing_session` | app-owned session, optionally `jingjing_selfhost_session` to avoid confusion |
| Session secure cookie | `false` for HTTP IP-stage | `false` until HTTPS is actually enabled |
| App base URL | domestic IP | pass `--base-url "http://<singapore-ip>"`; optional smoke env may use `APP_BASE_URL` |
| COS bucket | mainland private bucket | existing Singapore COS bucket |
| COS region | mainland region such as `ap-guangzhou` | Singapore bucket region, for the current staging bucket this has historically been `ap-singapore`; confirm in the COS console |
| Browser CORS origin | `http://<domestic-ip>` | `http://<singapore-ip>` and any temporary port/origin used for the rehearsal |
| Supabase env | empty unless testing fallback | keep empty; the rehearsal must not depend on Supabase SDK/Auth |
| Worker DB | `WORKER_DATABASE_URL` domestic DB | `WORKER_DATABASE_URL` Singapore plain PostgreSQL |
| Worker COS | `WORKER_COS_*` mainland COS | `WORKER_COS_*` Singapore COS |
| Worker ID | `domestic-phase1-worker-01` | `singapore-selfhost-rehearsal-worker-01` |
| Worker concurrency | `WORKER_MAX_CONCURRENCY=1` | keep `WORKER_MAX_CONCURRENCY=1` |
| Test draft | enabled only for validation | `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1` during rehearsal, then disable |

## 4. PostgreSQL baseline

Use plain PostgreSQL. Do not point this rehearsal at Supabase Cloud.

Option A: same-host PostgreSQL on the Singapore server.

```bash
sudo -u postgres createuser jingjing_app
sudo -u postgres createdb jingjing_selfhost_rehearsal -O jingjing_app
```

Option B: temporary ordinary PostgreSQL reachable from the Singapore server.

In both cases, export the connection string outside Git:

```bash
export APP_DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
export DATABASE_PROVIDER=postgres
```

Initialize the schema:

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
```

Seed one disposable owner and merchant:

```bash
HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
psql "$APP_DATABASE_URL" \
  -v user_email='owner+selfhost@example.com' \
  -v password_hash="$HASH" \
  -v display_name='Singapore Selfhost Owner' \
  -v merchant_name='Singapore Selfhost Merchant' \
  -f app/db/seeds/domestic_minimal_seed.example.sql
```

Optional API smoke fixture:

```bash
psql "$APP_DATABASE_URL" \
  -v user_email='owner+selfhost@example.com' \
  -f app/db/seeds/domestic_video_chain_fixture.example.sql
```

## 5. App env and preflight

Create `/etc/jingjing/app.env` on the Singapore server from
`deploy/domestic/env/app.env.example`.

Minimum rehearsal values:

```bash
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
DATABASE_PROVIDER=postgres
APP_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
APP_DATABASE_SSL=disable
APP_SESSION_COOKIE=jingjing_selfhost_session
APP_SESSION_SECURE_COOKIE=false
COS_SECRET_ID=<secret-id>
COS_SECRET_KEY=<secret-key>
COS_BUCKET=<singapore-bucket-with-appid>
COS_REGION=<singapore-cos-region>
VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Run:

```bash
node app/scripts/check-domestic-app-env.mjs \
  --env-file /etc/jingjing/app.env \
  --require-video-chain-test-entrypoint
node app/scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env
```

Expected:

- PostgreSQL `select 1` succeeds
- required core tables exist
- COS put / signed download / delete succeeds against the Singapore bucket
- no secret values are printed

## 6. Build and start app

From the app checkout on the Singapore server:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

Systemd option:

```bash
sudo cp deploy/domestic/systemd/jingjing-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-app
sudo systemctl status jingjing-app --no-pager
```

PM2 option:

```bash
pm2 start deploy/domestic/pm2/ecosystem.config.cjs
pm2 save
pm2 status
```

Nginx:

```bash
sudo cp deploy/domestic/nginx/jingjing-domestic.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

Health checks:

```bash
curl -sS -i "http://<singapore-ip>/nginx-health"
curl -sS -i "http://<singapore-ip>/api/health"
```

## 7. API smoke

Run after app startup:

```bash
DOMESTIC_SMOKE_EMAIL='owner+selfhost@example.com' \
DOMESTIC_SMOKE_PASSWORD='<temporary-password>' \
node app/scripts/check-domestic-video-chain-api-smoke.mjs \
  --env-file /etc/jingjing/app.env \
  --base-url "http://<singapore-ip>" \
  --with-upload-intent
```

Expected:

- login returns `303`
- test draft returns `201`
- upload intent returns `201`
- media metadata complete returns `201`
- video job create returns `201`
- job is `pending`
- `inputPayload.render_mode=asset_driven`

This API smoke still does not upload media bytes to COS and does not prove the
worker rendered `final.mp4`.

## 8. Worker env and real I/O smoke

Create `/etc/jingjing/worker.env` on the Singapore server from
`deploy/domestic/env/worker.env.example`.

Minimum rehearsal values:

```bash
VIDEO_WORKER_HOST_ROOT=/srv/jingjing-video-worker
WORKER_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
SUPABASE_DB_URL=
WORKER_COS_SECRET_ID=<secret-id>
WORKER_COS_SECRET_KEY=<secret-key>
WORKER_COS_BUCKET=<singapore-bucket-with-appid>
WORKER_COS_REGION=<singapore-cos-region>
WORKER_COS_RESULT_PREFIX=video-results
WORKER_ID=singapore-selfhost-rehearsal-worker-01
WORKER_MAX_CONCURRENCY=1
OPENSTORYLINE_BASE_URL=http://openstoryline-engine:8000
OPENSTORYLINE_ENGINE_ADAPTER=fire_red
FIRERED_OPENSTORYLINE_BASE_URL=http://firered-openstoryline:7860
```

Validate compose and real I/O:

```bash
cd /srv/jingjing/workers/video-worker
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet
PYTHONPATH=. python -m worker.app.real_io_smoke --env-file /etc/jingjing/worker.env
```

Expected:

- `WORKER_MAX_CONCURRENCY=1`
- PostgreSQL `select 1` succeeds
- `asset_objects` and `video_edit_jobs` exist
- COS put / download / delete succeeds

## 9. Start worker and run small video e2e

Start:

```bash
sudo cp deploy/domestic/systemd/jingjing-worker-compose.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-worker-compose
cd /srv/jingjing/workers/video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered ps
```

Required running services:

- `firered-openstoryline`
- `openstoryline-engine`
- `video-worker`

Small synthetic e2e:

1. Open `http://<singapore-ip>/dashboard/video?testMode=video_chain`.
2. Login with the disposable owner.
3. Create a test draft.
4. Upload only small synthetic material to the Singapore COS bucket.
5. Create a video job.
6. Confirm worker claims the job and updates heartbeat/stages.
7. Confirm final output is uploaded to Singapore COS.
8. Confirm the app can return a signed preview/download URL.

Record only redacted evidence in:

```text
docs/progress/2026-05-15-singapore-self-hosted-rehearsal.md
```

Required evidence:

- Singapore server target and app port, without secrets
- PostgreSQL type and migration/seed result
- COS bucket region and smoke key prefix, without credentials
- app build result
- process manager used: systemd or PM2
- `/api/health` result
- API smoke result
- worker real I/O smoke result
- video job id, worker id, stages, result key
- explicit separation between self-hosted rehearsal status and domestic
  real-resource e2e status

## 10. Later domestic rerun

When mainland resources are purchased, keep the same sequence and change only:

- server IP / host
- PostgreSQL URL and SSL setting
- COS bucket / region / CORS origin
- worker ID
- app base URL

Then continue with:

```text
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md
```

The Singapore rehearsal must not update the domestic phase1 verification doc to
passed.
