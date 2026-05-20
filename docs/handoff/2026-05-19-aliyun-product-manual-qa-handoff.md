# 2026-05-19 Aliyun Product Manual QA Handoff

## Current Goal

Batch 10F-0 prepared the Aliyun domestic baseline for PM manual trial by creating a dedicated QA merchant account and validating the logged-in browser video flow through Aliyun OSS, worker, FireRed normal no-voiceover, and preview.

## Status

Completed.

No app/worker code was deployed in this batch. No DNS/ICP/HTTPS/RDS-public/OSS-public changes were made. TTS/voiceover was not touched.

## Baseline

- Requested freeze docs baseline: `19d79cc`
- Deployed runtime baseline: `b0aa565`
- Worktree HEAD before this docs batch: `393ccbb`
- Runtime release path: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`
- Current symlink: `/srv/jingjing-domestic/current`
- Experience URL: `http://8.154.28.41`

## QA Account

- Account purpose: dedicated PM QA merchant account.
- User ID: `e60fd946-c939-4807-ba7e-8d11facc158a`
- Merchant ID: `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`
- User and merchant status: active.
- Team membership rows: `1`.
- Credentials are only in `/tmp/jingjing-aliyun-product-qa-account.env`, mode `600`.
- Remote temporary credential file was removed.
- Do not write the email/password into docs, chat, Git, or shell history.
- Lifecycle: keep this QA account until the user explicitly requests cleanup.

## Runtime Change

Login initially redirected to `localhost:3000`, which prevented public browser login. Applied a runtime-only Nginx redirect rewrite:

- Config: `/etc/nginx/conf.d/jingjing-domestic.conf`
- Backup: `/srv/jingjing-domestic/backups/nginx-jingjing-domestic-20260519T044445Z.conf`
- Added: `proxy_redirect http://localhost:3000/ /;`
- `nginx -t`: passed.
- `nginx` reload: passed.

Rollback, if needed:

```bash
sudo cp /srv/jingjing-domestic/backups/nginx-jingjing-domestic-20260519T044445Z.conf /etc/nginx/conf.d/jingjing-domestic.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Verification

Service status:

- `jingjing-domestic-app.service`: active
- `nginx`: active
- `jingjing-firered-openstoryline.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-video-worker.service`: active

Health:

- `/api/health`: `ok=true`
- DB provider: `postgres`
- storage provider: `aliyun_oss`
- bucket: `jingjing-domestic-phase1-hz`
- region: `oss-cn-hangzhou`

Browser trial report:

- `/tmp/jingjing-aliyun-product-qa-browser-trial.json`

Browser trial evidence:

- Login reached `/dashboard/video`.
- Signed PUT upload to Aliyun OSS succeeded.
- Uploaded media asset ID: `ce2961d3-a654-4bb5-81b3-332675ba26a0`
- Job ID: `7245e64c-9526-4d72-8a3f-092e391da1d0`
- Job final status: `succeeded`
- Final asset ID: `3b7564d9-0c3a-44fc-84f3-b10b4c284b25`
- Final key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/7245e64c-9526-4d72-8a3f-092e391da1d0/final.mp4`
- Preview status: `200`
- Preview bytes: `930543`

## Manual Checklist

1. Open `http://8.154.28.41/login`.
2. Use the credential fields from `/tmp/jingjing-aliyun-product-qa-account.env`.
3. Confirm `/dashboard/video` loads.
4. Create or open a test video draft.
5. Upload MP4 material.
6. Create a no-voiceover video job.
7. Wait for `succeeded`.
8. Open preview and confirm video loads.
9. If checking backend evidence, confirm the final asset key starts with `video-results/`.

## Not Included

- TTS/voiceover.
- ASR.
- Domain, HTTPS, DNS, ICP.
- RDS SSL.
- Docker image reproducible deployment.
- Main branch integration.
- Phase completion marker.

## Changed Files

- `docs/progress/2026-05-19-aliyun-product-manual-qa.md`
- `docs/handoff/2026-05-19-aliyun-product-manual-qa-handoff.md`

## Next Step

Give the PM the URL and the local credential file path. After manual trial, collect product feedback separately from infrastructure follow-up. The likely next engineering batch is TTS/voiceover or domain/HTTPS/ICP planning, not further no-voiceover baseline work.

