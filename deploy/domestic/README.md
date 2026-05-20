# Domestic single-server deployment kit

This folder contains resource-independent deployment samples for the first
domestic IP verification. It is not proof that the domestic chain has passed.
Real phase1 e2e still requires a purchased domestic server, domestic
PostgreSQL, mainland Tencent COS, and a mobile browser test path.

Do not use these samples to switch `ba-ba-ke.com`, start ICP filing, push this
branch, or claim production readiness.

## 1. Suggested host layout

Use one domestic server for the first verification:

```text
/srv/jingjing/
  app/                         # Next.js app checkout or release copy
  workers/video-worker/         # worker compose directory
  releases/                     # optional timestamped release snapshots
  shared/
    logs/
      app/
      worker/

/srv/jingjing-video-worker/
  tmp/
  models/
  outputs/
  firered/
    .storyline/
    resource/
    outputs/

/etc/jingjing/
  app.env                       # copied from deploy/domestic/env/app.env.example
  worker.env                    # copied from deploy/domestic/env/worker.env.example
```

Create directories:

```bash
sudo useradd --system --create-home --shell /bin/bash jingjing || true
sudo mkdir -p /srv/jingjing/{app,workers,shared/logs/app,shared/logs/worker,releases}
sudo mkdir -p /srv/jingjing-video-worker/{tmp,models,outputs,firered/.storyline,firered/resource,firered/outputs}
sudo mkdir -p /etc/jingjing
sudo chown -R jingjing:jingjing /srv/jingjing /srv/jingjing-video-worker
sudo usermod -aG docker jingjing
```

## 2. Ports and network

| Port | Bind | Purpose | Public? |
| --- | --- | --- | --- |
| `80/tcp` | `0.0.0.0` | Nginx HTTP entry for IP-stage verification | Yes |
| `443/tcp` | `0.0.0.0` | Reserved for later HTTPS/domain stage | Not required in IP stage |
| `3000/tcp` | `127.0.0.1` | Next.js app behind Nginx | No |
| `8000/tcp` | Docker internal | OpenStoryline engine | No |
| `8001/tcp` | Docker internal | OpenStoryline MCP/internal port | No |
| `7860/tcp` | Docker internal | FireRed OpenStoryline service | No |
| `5432/tcp` | outbound only | Managed PostgreSQL connection | No inbound DB on app host |
| `443/tcp` | outbound | Tencent COS, provider APIs, package downloads | Outbound |

Security group / firewall minimum:

```text
Inbound allow: 22/tcp from admin IP, 80/tcp from test phone/network
Inbound deny: 3000, 8000, 8001, 7860, 5432 from public internet
Outbound allow: 443/tcp, managed PostgreSQL endpoint, provider API endpoints
```

## 3. App process options

Recommended for phase1: systemd.

```bash
sudo cp deploy/domestic/systemd/jingjing-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-app
sudo systemctl status jingjing-app --no-pager
journalctl -u jingjing-app -f
```

Alternative for teams already using PM2:

```bash
pm2 start deploy/domestic/pm2/ecosystem.config.cjs
pm2 save
pm2 status
pm2 logs jingjing-app
```

Use only one process manager for the app.

## 4. Worker process

The worker remains Docker Compose based in phase1. Keep
`WORKER_MAX_CONCURRENCY=1`.

```bash
cp deploy/domestic/env/worker.env.example /etc/jingjing/worker.env
ln -sf /etc/jingjing/worker.env /srv/jingjing/workers/video-worker/.env
sudo cp deploy/domestic/systemd/jingjing-worker-compose.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jingjing-worker-compose
sudo systemctl status jingjing-worker-compose --no-pager
```

Restart commands:

```bash
sudo systemctl restart jingjing-app
sudo systemctl restart jingjing-worker-compose
cd /srv/jingjing/workers/video-worker
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered ps
docker compose -f docker-compose.yml -f docker-compose.firered.yml --profile firered logs -f video-worker
```

## 5. Nginx

```bash
sudo cp deploy/domestic/nginx/jingjing-domestic.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

The Nginx sample proxies IP-stage HTTP traffic to `127.0.0.1:3000`. HTTPS,
domain binding, and ICP are intentionally not included.

## 6. Readiness commands after resources exist

Fill `/etc/jingjing/app.env` and `/etc/jingjing/worker.env` from the templates,
then run:

```bash
cd /srv/jingjing/app
psql "$APP_DATABASE_URL" -f db/migrations/202605130001_domestic_core_baseline.sql
node scripts/check-domestic-app-env.mjs \
  --env-file /etc/jingjing/app.env \
  --require-video-chain-test-entrypoint
node scripts/check-domestic-cos-roundtrip.mjs --env-file /etc/jingjing/app.env

cd /srv/jingjing/workers/video-worker
PYTHONPATH=. ./venv/bin/python -m worker.app.real_io_smoke --env-file /etc/jingjing/worker.env
```

Then continue from:

```text
docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md
docs/progress/2026-05-13-domestic-migration-phase1-e2e-verification.md
```

Do not add the phase1 completion marker until the phone browser upload, worker
render, `final.mp4` COS upload, and re-signed page download have actually
passed on real domestic resources.
