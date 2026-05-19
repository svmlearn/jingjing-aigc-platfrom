# 2026-05-19 Aliyun Domestic Deployment Freeze

## Scope

Batch 10E freezes the current Aliyun domestic deployment as an acceptance baseline:

- app on ECS
- RDS PostgreSQL over private network
- private Aliyun OSS bucket
- video worker
- FireRed/OpenStoryline normal no-voiceover path

This is not a final domestic completion declaration. TTS/voiceover, ASR, DNS/HTTPS/ICP, RDS SSL, and main-branch integration remain separate work.

## Frozen Code and Release

- Branch: `codex/domestic-infra-migration`
- Commit: `b0aa565`
- Gitee backup: pushed to `gitee/codex/domestic-infra-migration`
- Current release: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- Current symlink: `/srv/jingjing-domestic/current`
- Release root: `/srv/jingjing-domestic/releases`
- Logs root: `/srv/jingjing-domestic/logs`
- Backups root: `/srv/jingjing-domestic/backups`

Recent release rollback candidates:

- `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- `/srv/jingjing-domestic/releases/20260519010540-45c4a55`
- `/srv/jingjing-domestic/releases/20260519001238-41cf9a3`
- `/srv/jingjing-domestic/releases/20260518233102-47f0345`

## Runtime Paths

Env paths:

- App env: `/srv/jingjing-domestic/shared/env/app.env`
- Worker env: `/srv/jingjing-domestic/shared/env/worker.env`
- Env directory mode: `700`
- Env files mode: `600`

FireRed/OpenStoryline paths:

- FireRed venv: `/srv/jingjing-video-worker/venv-firered`
- FireRed runtime root: `/srv/jingjing-video-worker/firered`
- FireRed persistent `.storyline`: `/srv/jingjing-video-worker/firered/.storyline`
- FireRed outputs: `/srv/jingjing-video-worker/firered/outputs`

Nginx config paths:

- `/etc/nginx/conf.d/jingjing-domestic.conf`
- `/etc/nginx/sites-enabled/default`

## Systemd Services

Services and unit files:

| Service | Unit path |
|---|---|
| `jingjing-domestic-app.service` | `/etc/systemd/system/jingjing-domestic-app.service` |
| `nginx` | system package unit |
| `jingjing-firered-openstoryline.service` | `/etc/systemd/system/jingjing-firered-openstoryline.service` |
| `jingjing-openstoryline-engine.service` | `/etc/systemd/system/jingjing-openstoryline-engine.service` |
| `jingjing-video-worker.service` | `/etc/systemd/system/jingjing-video-worker.service` |

Status check command:

```bash
systemctl is-active \
  jingjing-domestic-app.service \
  nginx \
  jingjing-firered-openstoryline.service \
  jingjing-openstoryline-engine.service \
  jingjing-video-worker.service
```

Batch 10E result:

- `jingjing-domestic-app.service`: active
- `nginx`: active
- `jingjing-firered-openstoryline.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-video-worker.service`: active

## RDS Posture

RDS is used from ECS over private network.

Current Phase 1 stance:

- PostgreSQL provider: `postgres`
- App DB env field: `APP_DATABASE_URL`
- Worker DB env field: `WORKER_DATABASE_URL`
- SSL env field: `APP_DATABASE_SSL` / `DATABASE_SSL`
- SSL mode: `disable`

Risk:

- `sslmode=disable` is accepted only as a Phase 1 private-network temporary stance because the current RDS validation found `sslmode=require` unsupported.
- RDS public access was not enabled.
- Later work should confirm and enable the right RDS SSL posture.

Batch 10E DB summary:

- App preflight: passed.
- Public schema table count: `45`.

## OSS Posture

Bucket:

- Bucket: `jingjing-domestic-phase1-hz`
- Region: `oss-cn-hangzhou`
- Endpoint: `oss-cn-hangzhou.aliyuncs.com`
- ACL: private
- Public access block: enabled

Formal worker output prefix:

- `video-results/*`

Other retained prefixes:

- `source-assets/*`
- `draft-inputs/*`
- `knowledge/*`
- `app-storage-provider-smoke/*`

RAM policy:

- RAM user: `jingjing-domestic-oss-phase1`
- Policy: `jingjing-domestic-phase1-oss-prefix-policy`
- Current default version recorded previously: `v2`
- Scope remains prefix-based, not whole-bucket wildcard.
- Actions:
  - `oss:PutObject`
  - `oss:GetObject`
  - `oss:DeleteObject`
  - `oss:GetObjectMeta`

Resource scopes:

```text
acs:oss:*:*:jingjing-domestic-phase1-hz/app-storage-provider-smoke/*
acs:oss:*:*:jingjing-domestic-phase1-hz/source-assets/*
acs:oss:*:*:jingjing-domestic-phase1-hz/draft-inputs/*
acs:oss:*:*:jingjing-domestic-phase1-hz/knowledge/*
acs:oss:*:*:jingjing-domestic-phase1-hz/video-results/*
```

Do not roll worker output back to the temporary `app-storage-provider-smoke/video-results/*` prefix.

## Batch 10E Acceptance Report

Report root:

- `/srv/jingjing-domestic/logs/deployment-freeze-20260519T122449`

Files:

- `api-health.json`
- `app-preflight.json`
- `app-oss-roundtrip.json`
- `signed-put-cors.json`
- `worker-real-io-smoke.json`
- `firered-ready.json`
- `openstoryline-ready.json`
- `db-freeze-summary.json`
- `normal-no-voiceover-20260519T122533/video-worker-smoke.json`

Smoke results:

| Check | Result |
|---|---|
| `/api/health` | passed, `ok=true`, DB `postgres`, storage `aliyun_oss` |
| app preflight | passed, `status=ok` |
| Aliyun OSS roundtrip | passed |
| signed PUT/CORS | passed, preflight `200`, PUT `200` |
| worker `real_io_smoke` | passed, DB `ok`, storage `ok` |
| FireRed `/api/ready` | passed, `ready` |
| OpenStoryline `/ready` | passed, adapter `fire_red` |
| normal no-voiceover FireRed job | passed |

OSS smoke evidence:

- App roundtrip key: `app-storage-provider-smoke/ddb6f578-76fd-4b34-8c13-ef12d2c2f2e1.txt`
- Worker real IO key: `video-results/worker-real-smoke/668a11111d45469c81b2955859f6de2b.txt`
- Signed PUT key deleted after verification.

Fast-path evidence from Batch 10C:

- Job ID: `ec553c80-13bc-41d3-863b-319f99f97850`
- Input media asset ID: `72f6d914-1ae6-491b-bd1d-396b74fb9534`
- Final video asset ID: `c6976766-ae01-4f38-ac99-5b9579a26668`
- Final key: `video-results/e150aa8f-5933-4c5d-a9f4-e0a6e8b9bd7b/ec553c80-13bc-41d3-863b-319f99f97850/final.mp4`
- Preview status: `200`
- Preview bytes: `13952`

Batch 10E normal no-voiceover evidence:

- Job ID: `8ef8df13-0406-4ab3-a7bd-c876b37b206a`
- Media asset ID: `2a241615-a0ee-4fe4-a53c-4675b49ff76b`
- Final asset ID: `2670477e-477e-4b84-8cfa-a7415f6fbdd7`
- Final storage provider: `aliyun_oss`
- Final bucket: `jingjing-domestic-phase1-hz`
- Final key: `video-results/f271bac6-3bed-4078-ac60-4a72c17c47df/8ef8df13-0406-4ab3-a7bd-c876b37b206a/final.mp4`
- Prefix matched: true
- Preview status: `200`
- Preview bytes: `324662`
- Temporary smoke user disabled after validation.

Previous normal no-voiceover evidence from Batch 10D-1:

- Job ID: `415f3639-5329-48b3-b80f-3bb1968ed67e`
- Final asset ID: `7e380308-ebb1-451d-9c22-606c667a68f7`
- Final key: `video-results/12a0c190-d0da-4c8d-9abf-43bc6872b08a/415f3639-5329-48b3-b80f-3bb1968ed67e/final.mp4`
- Preview status: `200`
- Preview bytes: `324662`

## Rollback

Release symlink rollback:

```bash
sudo ln -sfn /srv/jingjing-domestic/releases/<previous-release> /srv/jingjing-domestic/current
sudo systemctl daemon-reload
sudo systemctl restart jingjing-domestic-app.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
sudo systemctl reload nginx
```

Service restart only:

```bash
sudo systemctl restart jingjing-domestic-app.service
sudo systemctl restart jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
sudo systemctl reload nginx
```

Adapter rollback to skeleton:

```bash
sudo cp /srv/jingjing-domestic/shared/env/worker.env /srv/jingjing-domestic/backups/worker.env.before-skeleton-rollback-$(date +%Y%m%dT%H%M%S)
sudo sed -i 's/^OPENSTORYLINE_ENGINE_ADAPTER=.*/OPENSTORYLINE_ENGINE_ADAPTER=skeleton/' /srv/jingjing-domestic/shared/env/worker.env
sudo systemctl restart jingjing-openstoryline-engine.service jingjing-video-worker.service
```

No-voiceover contract patch rollback on current release:

```bash
sudo install -m 0644 /srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925 \
  /srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
sudo systemctl restart jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
```

Do not rollback worker output prefix to the old temporary storage-smoke result prefix.

## Cannot Claim Yet

Do not claim the following:

- TTS/voiceover is not verified.
- ASR was not migrated.
- Reproducible Docker image deployment is not complete.
- RDS SSL is not complete.
- DNS, HTTPS, and ICP are not connected.
- `main` is not merged.
- The Phase 1 completion marker is not written.

## Local Checks

Local checks before docs commit:

- `git diff --check`: passed.
- Worktree clean before docs edit: yes.
