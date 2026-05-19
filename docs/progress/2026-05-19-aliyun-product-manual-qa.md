# 2026-05-19 Aliyun Product Manual QA

## Scope

Batch 10F-0 prepared the Aliyun domestic deployment for PM manual trial:

- Create/confirm a dedicated QA merchant account and merchant/team context.
- Verify login under `http://8.154.28.41`.
- Verify browser-context material upload to Aliyun OSS, video job creation, worker/FireRed normal no-voiceover completion, and preview.
- Produce a manual trial checklist.

This batch did not deploy app/worker code, did not touch TTS/voiceover, did not change DNS/ICP/HTTPS, did not enable RDS public access, and did not change OSS public access.

## Baseline

- Requested freeze baseline: docs commit `19d79cc`; deployed runtime commit `b0aa565`.
- Worktree HEAD before this docs batch: `393ccbb` (`feat: migrate aliyun agent knowledge seeds`), already backed up on Gitee.
- Deployed release path: `/srv/jingjing-domestic/releases/20260519013445-52ce51d`.
- Current symlink: `/srv/jingjing-domestic/current`.
- Experience URL: `http://8.154.28.41`.

## QA Account

Dedicated PM QA merchant account was created/confirmed in Aliyun RDS.

- User ID: `e60fd946-c939-4807-ba7e-8d11facc158a`
- User status: `active`
- Merchant ID: `5bb8381f-1a72-48bc-ab87-d7bbf2740e7c`
- Merchant status: `active`
- Team membership rows: `1`
- Lifecycle: dedicated PM QA account, not a temporary smoke user. Keep until explicit cleanup.
- Credential handoff: local file `/tmp/jingjing-aliyun-product-qa-account.env`
- Credential file mode: `600`
- Remote temporary credential file: removed after account creation.

No email, password, token, provider key, RDS password, AccessKey, or cookie value is recorded here.

## Runtime Fix

During browser login verification, the app login POST returned a 303 Location using `http://localhost:3000/...`. The app was behind Nginx and the public browser could not follow that upstream-local redirect.

Runtime-only Nginx fix applied:

- Config: `/etc/nginx/conf.d/jingjing-domestic.conf`
- Backup: `/srv/jingjing-domestic/backups/nginx-jingjing-domestic-20260519T044445Z.conf`
- Added: `proxy_redirect http://localhost:3000/ /;`
- Validation: `nginx -t` passed; `nginx` reloaded successfully.

This did not change repository app code and did not change DNS/ICP/HTTPS.

## Service and Health Check

Service status check:

| Service | Status |
|---|---|
| `jingjing-domestic-app.service` | active |
| `nginx` | active |
| `jingjing-firered-openstoryline.service` | active |
| `jingjing-openstoryline-engine.service` | active |
| `jingjing-video-worker.service` | active |

`/api/health` from ECS loopback:

- `ok`: `true`
- app runtime: `nodejs`
- database provider: `postgres`
- storage provider: `aliyun_oss`
- bucket: `jingjing-domestic-phase1-hz`
- region: `oss-cn-hangzhou`

## Browser Trial Evidence

Report file:

- `/tmp/jingjing-aliyun-product-qa-browser-trial.json`

The browser-context trial used the QA account session and the same app routes used by the manual video workbench flow.

Result:

- Login page loaded at `http://8.154.28.41/login?next=%2Fdashboard%2Fvideo`.
- Login reached `http://8.154.28.41/dashboard/video`.
- Test draft created.
- Signed PUT upload to Aliyun OSS succeeded.
- Media complete wrote an `aliyun_oss` asset.
- Video job created and completed via worker/FireRed normal no-voiceover.
- Final asset was written to the formal `video-results/*` prefix.
- Preview route returned `200` and non-zero video bytes.

Evidence IDs:

- Draft ID: `72210bb3-d97f-42f1-b3aa-00ff373c37ac`
- Content variant ID: `1ccbf073-96c1-49e6-b34b-84e5524058e1`
- Uploaded media asset ID: `ce2961d3-a654-4bb5-81b3-332675ba26a0`
- Uploaded media provider: `aliyun_oss`
- Uploaded media key: `draft-inputs/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/72210bb3-d97f-42f1-b3aa-00ff373c37ac/b0cf4fe1-0605-4c75-bae1-192416b38625-product-qa-input.mp4`
- OSS signed PUT status: `200`
- Job ID: `7245e64c-9526-4d72-8a3f-092e391da1d0`
- Job final status: `succeeded`
- Job final stage: `completed`
- Final asset ID: `3b7564d9-0c3a-44fc-84f3-b10b4c284b25`
- Final asset provider: `aliyun_oss`
- Final asset bucket: `jingjing-domestic-phase1-hz`
- Final asset key: `video-results/5bb8381f-1a72-48bc-ab87-d7bbf2740e7c/7245e64c-9526-4d72-8a3f-092e391da1d0/final.mp4`
- Final prefix matched: `true`
- Preview status: `200`
- Preview bytes: `930543`
- Preview content type: `video/mp4`

## Manual Trial Checklist

Use the local credential file fields from `/tmp/jingjing-aliyun-product-qa-account.env`; do not paste the password into chat or docs.

1. Open `http://8.154.28.41/login`.
2. Log in with the dedicated PM QA account.
3. Confirm the browser reaches `/dashboard/video`.
4. In the video workbench, create or open a test video draft.
5. Upload an MP4 material.
6. Confirm upload completes and the material appears in the draft.
7. Create a video job with voiceover disabled.
8. Wait for the job to reach `succeeded`.
9. Open the generated preview and confirm the video loads.
10. If checking backend evidence, confirm the final asset key starts with `video-results/`.

## Known Not Testable in This Batch

- TTS/voiceover is not verified.
- ASR is not migrated or verified.
- Domain, HTTPS, DNS, and ICP are not connected.
- RDS SSL remains a later item; Phase 1 still uses private network with SSL disabled.
- Docker image reproducible deployment remains unfinished.
- Main branch integration remains separate.
- No phase completion marker was written.

