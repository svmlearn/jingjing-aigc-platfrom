# 2026-05-19 Aliyun Domestic Deployment Freeze Handoff

## Freeze Summary

Current Aliyun deployment is frozen as an acceptance baseline for app + RDS + private Aliyun OSS + worker + FireRed normal no-voiceover.

- Branch: `codex/domestic-infra-migration`
- Commit: `b0aa565`
- Current release: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- Current symlink: `/srv/jingjing-domestic/current`
- Freeze report root: `/srv/jingjing-domestic/logs/deployment-freeze-20260519T122449`
- Progress doc: `docs/progress/2026-05-19-aliyun-domestic-deployment-freeze.md`

## Active Services

Status command:

```bash
systemctl is-active \
  jingjing-domestic-app.service \
  nginx \
  jingjing-firered-openstoryline.service \
  jingjing-openstoryline-engine.service \
  jingjing-video-worker.service
```

All five services were active in Batch 10E.

Unit files:

- `/etc/systemd/system/jingjing-domestic-app.service`
- `/etc/systemd/system/jingjing-firered-openstoryline.service`
- `/etc/systemd/system/jingjing-openstoryline-engine.service`
- `/etc/systemd/system/jingjing-video-worker.service`

## Runtime Paths

- App env: `/srv/jingjing-domestic/shared/env/app.env`
- Worker env: `/srv/jingjing-domestic/shared/env/worker.env`
- FireRed venv: `/srv/jingjing-video-worker/venv-firered`
- FireRed runtime root: `/srv/jingjing-video-worker/firered`
- Nginx config: `/etc/nginx/conf.d/jingjing-domestic.conf`

Env directory is `700`; env files are `600`.

## Acceptance Evidence

Batch 10E smoke set:

- `/api/health`: passed, DB `postgres`, storage `aliyun_oss`.
- App preflight: passed.
- Aliyun OSS roundtrip: passed.
- Signed PUT/CORS: passed.
- Worker `real_io_smoke`: passed.
- FireRed `/api/ready`: passed.
- OpenStoryline `/ready`: passed, adapter `fire_red`.
- Normal no-voiceover FireRed job: passed.

Latest acceptance job:

- Job ID: `8ef8df13-0406-4ab3-a7bd-c876b37b206a`
- Media asset ID: `2a241615-a0ee-4fe4-a53c-4675b49ff76b`
- Final asset ID: `2670477e-477e-4b84-8cfa-a7415f6fbdd7`
- Final key: `video-results/f271bac6-3bed-4078-ac60-4a72c17c47df/8ef8df13-0406-4ab3-a7bd-c876b37b206a/final.mp4`
- Preview: `200`, `324662` bytes
- Smoke user was disabled after validation.

Fast-path evidence retained from Batch 10C:

- Job ID: `ec553c80-13bc-41d3-863b-319f99f97850`
- Final asset ID: `c6976766-ae01-4f38-ac99-5b9579a26668`
- Final key: `video-results/e150aa8f-5933-4c5d-a9f4-e0a6e8b9bd7b/ec553c80-13bc-41d3-863b-319f99f97850/final.mp4`
- Preview: `200`, `13952` bytes

## Infrastructure Posture

RDS:

- Private-network use only.
- SSL remains Phase 1 `disable` posture.
- Do not open RDS public access.

OSS:

- Bucket: `jingjing-domestic-phase1-hz`
- Region: `oss-cn-hangzhou`
- Endpoint: `oss-cn-hangzhou.aliyuncs.com`
- ACL: private.
- Public access block: enabled.
- Worker output prefix: `video-results/*`.
- Do not rollback worker output to `app-storage-provider-smoke/video-results/*`.

RAM:

- User: `jingjing-domestic-oss-phase1`
- Policy: `jingjing-domestic-phase1-oss-prefix-policy`
- Prefix-scoped only: `app-storage-provider-smoke/*`, `source-assets/*`, `draft-inputs/*`, `knowledge/*`, `video-results/*`.
- Actions limited to object put/get/delete/meta.

## Rollback Pointers

Release rollback:

```bash
sudo ln -sfn /srv/jingjing-domestic/releases/<previous-release> /srv/jingjing-domestic/current
sudo systemctl daemon-reload
sudo systemctl restart jingjing-domestic-app.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
sudo systemctl reload nginx
```

Skeleton adapter rollback:

```bash
sudo cp /srv/jingjing-domestic/shared/env/worker.env /srv/jingjing-domestic/backups/worker.env.before-skeleton-rollback-$(date +%Y%m%dT%H%M%S)
sudo sed -i 's/^OPENSTORYLINE_ENGINE_ADAPTER=.*/OPENSTORYLINE_ENGINE_ADAPTER=skeleton/' /srv/jingjing-domestic/shared/env/worker.env
sudo systemctl restart jingjing-openstoryline-engine.service jingjing-video-worker.service
```

No-voiceover patch rollback:

```bash
sudo install -m 0644 /srv/jingjing-domestic/backups/node_interceptors.py.before-no-voiceover-contract-20260519T120925 \
  /srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
sudo systemctl restart jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service
```

## Not Complete

The next agent must not claim:

- TTS/voiceover passed.
- ASR migrated.
- Docker image deployment is reproducible.
- RDS SSL is enabled.
- DNS/HTTPS/ICP are connected.
- `main` is merged.
- Phase 1 completion marker is written.

## Recommended Next Work

Start a separate Batch 10F for TTS/voiceover or ASR/cloud-ASR only after this freeze is accepted. Keep the frozen app/RDS/OSS/worker/FireRed no-voiceover baseline unchanged unless explicitly rolling forward.
