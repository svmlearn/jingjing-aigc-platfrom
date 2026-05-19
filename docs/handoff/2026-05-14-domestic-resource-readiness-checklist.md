# 2026-05-14 domestic resource readiness checklist

## 1. Purpose

Use this checklist after buying the domestic server, domestic PostgreSQL, and
mainland Tencent COS bucket. It is a pre-flight checklist before the real
mobile phase1 e2e run.

This document does not prove the domestic chain has passed. Keep
`docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md`
pending until the real mobile browser upload, worker render, `final.mp4` COS
upload, and page re-signed download have passed.

## 2. Fill Sheet

Fill these outside Git first. Do not paste secrets into committed docs.

| Item | Value to prepare | Where used | Result |
| --- | --- | --- | --- |
| Domestic server IP | `<ip>` | Nginx, browser, API smoke | Pending |
| Server login user | `jingjing` or chosen deploy user | systemd, Docker, file ownership | Pending |
| Server region | e.g. `Guangzhou` | COS/PostgreSQL region match | Pending |
| App root | `/srv/jingjing/app` | systemd/PM2 | Pending |
| Worker root | `/srv/jingjing/workers/video-worker` | Docker Compose | Pending |
| Worker host data root | `/srv/jingjing-video-worker` | worker volumes | Pending |
| PostgreSQL URL | secret, not committed | `APP_DATABASE_URL`, `WORKER_DATABASE_URL` | Pending |
| PostgreSQL SSL mode | `require` or `disable` | app/worker env | Pending |
| COS bucket | bucket name with APPID | app/worker env, CORS | Pending |
| COS region | e.g. `ap-guangzhou` | app/worker env | Pending |
| COS CORS origin | `http://<ip>` | Tencent Cloud console | Pending |
| COS secret id/key | secret, not committed | app/worker env | Pending |
| Owner email | test account | seed/API smoke | Pending |
| Temporary password | secret, not committed | seed/API smoke | Pending |
| FireRed provider keys | secret, not committed | worker env | Pending |
| Test phone/browser | device + browser version | e2e evidence | Pending |

## 3. Server Bootstrap Checklist

Run after the server exists:

```bash
sudo useradd --system --create-home --shell /bin/bash jingjing || true
sudo mkdir -p /srv/jingjing/{app,workers,shared/logs/app,shared/logs/worker,releases}
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs,firered/.storyline,firered/resource,firered/outputs}
sudo mkdir -p /etc/jingjing
sudo usermod -aG docker jingjing
sudo chown -R jingjing:jingjing /srv/jingjing /srv/jingjing-video-worker
```

Expected:

- `/srv/jingjing/app` exists and is writable by the deploy user.
- `/srv/jingjing/workers/video-worker` exists and is writable by the deploy user.
- `/srv/jingjing-video-worker/tmp`, `models`, `outputs`, and FireRed subdirectories exist.
- `/etc/jingjing` exists and is readable by root/deploy process only.
- `jingjing` exists and can run Docker after a new login/session if Docker group membership was changed.

## 4. Config Files To Install

Copy and fill:

```bash
cp deploy/domestic/env/app.env.example /etc/jingjing/app.env
cp deploy/domestic/env/worker.env.example /etc/jingjing/worker.env
ln -sf /etc/jingjing/worker.env /srv/jingjing/workers/video-worker/.env
```

Expected:

- `DATABASE_PROVIDER=postgres`
- `APP_DATABASE_URL` points to domestic PostgreSQL.
- `WORKER_DATABASE_URL` points to the same domestic PostgreSQL.
- `COS_REGION` and `WORKER_COS_REGION` are mainland regions.
- `WORKER_MAX_CONCURRENCY=1`.
- Supabase env values are empty unless explicitly testing fallback compatibility.

## 5. Database Bootstrap

From the app checkout:

```bash
psql "$APP_DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
psql "$APP_DATABASE_URL" \
  -v user_email='owner@example.com' \
  -v password_hash="$HASH" \
  -v display_name='Domestic Test Owner' \
  -v merchant_name='Domestic Test Merchant' \
  -f app/db/seeds/domestic_minimal_seed.example.sql
```

Expected:

- baseline migration exits `0`.
- seed exits `0`.
- `app_users`, `user_sessions`, `merchant_profiles`, `merchant_team_members`,
  `source_items`, `content_drafts`, `content_variants`, `asset_objects`, and
  `video_edit_jobs` exist.

## 6. App Preflight

```bash
node app/scripts/check-domestic-app-env.mjs \
  --env-file /etc/jingjing/app.env \
  --require-video-chain-test-entrypoint
node app/scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env
```

Expected:

- first command prints `status: "ok"` and confirms core tables.
- second command uploads, signed-downloads, verifies, and deletes a small COS smoke object.
- no secret values appear in logs.

## 7. Nginx And App

Install:

```bash
sudo cp deploy/domestic/nginx/jingjing-domestic.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
sudo cp deploy/domestic/systemd/jingjing-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-app
```

Expected:

```bash
curl -sS -i "http://<domestic-ip>/nginx-health"
curl -sS -i "http://<domestic-ip>/api/health"
```

- `/nginx-health` returns `200`.
- `/api/health` returns `200` with redacted status JSON.
- `journalctl -u jingjing-app -n 100 --no-pager` has no startup error.

## 8. API Smoke Before Mobile E2E

```bash
DOMESTIC_SMOKE_EMAIL='owner@example.com' \
DOMESTIC_SMOKE_PASSWORD='<temporary-password>' \
node app/scripts/check-domestic-video-chain-api-smoke.mjs \
  --env-file /etc/jingjing/app.env \
  --base-url "http://<domestic-ip>" \
  --with-upload-intent
```

Expected:

- login `303`
- test draft `201`
- upload intent `201`
- media complete `201`
- video job create `201`
- job status `pending`
- render mode `asset_driven`

This smoke still does not upload bytes to COS and does not run worker rendering.

## 9. Worker Preflight

```bash
cd /srv/jingjing/workers/video-worker
docker compose -f docker-compose.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered config --quiet
PYTHONPATH=. python -m worker.app.real_io_smoke --env-file /etc/jingjing/worker.env
```

Expected:

- compose config exits `0`.
- `WORKER_MAX_CONCURRENCY` is accepted only as `1`.
- DB `select 1` succeeds.
- `asset_objects` and `video_edit_jobs` are present.
- COS put/download/delete succeeds.

## 10. Start Worker

```bash
sudo cp deploy/domestic/systemd/jingjing-worker-compose.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-worker-compose
sudo systemctl status jingjing-worker-compose --no-pager
cd /srv/jingjing/workers/video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered ps
```

Expected:

- `firered-openstoryline`, `openstoryline-engine`, and `video-worker` are running.
- `docker compose ... logs -f video-worker` shows poll loop startup.
- no worker job has succeeded yet unless a real pending job exists.

## 11. Continue To Real E2E

After all readiness items pass, continue with:

```text
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md
```

Only the real mobile e2e may update the phase1 verification doc from pending to
passed. Do not write the completion marker during readiness checks.
