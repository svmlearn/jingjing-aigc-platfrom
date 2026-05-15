# 2026-05-15 Singapore self-hosted rehearsal progress

## 1. Current status

- Self-hosted rehearsal: partially passed.
  - Passed: self-hosted app/API/plain PostgreSQL/app-owned session/COS preflight,
    API smoke, worker real I/O smoke, worker claim, input COS download, and
    FireRed/OpenStoryline invocation.
  - Not passed: final `final.mp4` video e2e. FireRed did not return a successful
    render result in this run.
- Domestic real-resource e2e: pending.
- Branch: `codex/domestic-infra-migration`
- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Starting commit: `cdc5ca1 docs: add domestic offline deployment readiness kit`
- Push / merge: not pushed, not merged.

This document records the pivot from domestic phase1 resource validation to a
Singapore self-hosted rehearsal. The rehearsal is not domestic e2e and must not
be used as domestic phase1 completion evidence.

## 2. Boundary checks

- No `main` merge performed.
- No push performed.
- No `ba-ba-ke.com` switch performed.
- No ICP action performed.
- No domestic phase1 pass marker added.
- No claim that domestic phase1 is complete.
- No real user selfie video, real voice-clone material, or sensitive client
  material used.

## 3. Inputs available this turn

Available:

- Existing worktree and branch.
- `deploy/domestic` deployment kit.
- Plain PostgreSQL baseline, seed files, app preflight scripts, API smoke script,
  and worker real I/O smoke script already in this branch.
- Historical documentation records that the staging COS bucket has used
  Singapore region `ap-singapore`.

Initially not available in the local worktree:

- current Singapore SSH deployment instruction for this rehearsal
- current app env file
- current plain PostgreSQL connection string
- current COS secret values
- current disposable owner password
- current FireRed/OpenStoryline provider keys for the rehearsal

Only example env files were present under `app/` and `workers/`.

Runtime discovery:

- SSH worked with `ubuntu@43.160.208.189`.
- `mdeploy@43.160.208.189` and `root@43.160.208.189` were not available via
  non-interactive key auth.
- The server has Docker and sudo without interactive password.
- The host did not have Node/pnpm/psql/nginx installed; Node 22 was used through
  Docker for app install/build/start and smoke scripts.
- Existing server COS env values were reused without printing secrets.
- Existing worker env still points at Supabase Cloud through a compatibility
  variable, so the rehearsal created a separate plain PostgreSQL container and a
  separate worker env with `WORKER_DATABASE_URL`.

## 4. New runbook

Added:

```text
docs/handoff/2026-05-15-singapore-self-hosted-rehearsal-runbook.md
```

The runbook defines:

- Singapore self-hosted rehearsal scope
- explicit non-domestic-e2e boundary
- reusable `deploy/domestic` materials
- env changes from domestic/mainland to Singapore/self-hosted
- plain PostgreSQL requirement instead of Supabase Cloud
- Singapore COS usage for rehearsal and later mainland COS replacement
- `WORKER_MAX_CONCURRENCY=1`
- deployment steps for DB, app, Nginx or PM2/systemd, API smoke, worker smoke,
  and small synthetic video job e2e

## 5. `deploy/domestic` audit

Checked files:

- `deploy/domestic/README.md`
- `deploy/domestic/env/app.env.example`
- `deploy/domestic/env/worker.env.example`
- `deploy/domestic/nginx/jingjing-domestic.conf`
- `deploy/domestic/systemd/jingjing-app.service`
- `deploy/domestic/systemd/jingjing-worker-compose.service`
- `deploy/domestic/pm2/ecosystem.config.cjs`
- `deploy/domestic/scripts/verify-templates.sh`
- `app/scripts/check-domestic-app-env.mjs`
- `app/scripts/check-domestic-cos-roundtrip.mjs`
- `app/scripts/check-domestic-video-chain-api-smoke.mjs`

Finding:

- `COS_REGION` and `WORKER_COS_REGION` are configurable env values.
- App and worker scripts read region from env and do not force a mainland
  region.
- PostgreSQL checks read ordinary connection strings and do not require
  Supabase Cloud.
- Nginx, systemd, and PM2 samples are IP/server-layout samples and can be reused
  for Singapore by changing env and target host.
- Remaining `domestic` wording is mostly naming/documentation. To avoid churn,
  no large rename was made in this pass.

No code or script change was required for region configurability.

## 6. Evidence matrix

| Item | Evidence | Status |
| --- | --- | --- |
| Self-hosted runbook exists | `docs/handoff/2026-05-15-singapore-self-hosted-rehearsal-runbook.md` | Passed |
| Domestic runbook preserved | `docs/handoff/2026-05-13-domestic-phase1-real-resource-runbook.md` still present | Passed |
| `deploy/domestic` checked for hard mainland dependency | audit in section 5 | Passed |
| Ordinary PostgreSQL selected over Supabase Cloud | isolated `postgres:17` container `jingjing-selfhost-pg`, bound to `127.0.0.1:15433`; app used `APP_DATABASE_URL`, worker used `WORKER_DATABASE_URL` | Passed |
| Singapore COS selected for rehearsal | app and worker smokes used bucket `jj-content-staging-1341668543`, region `ap-singapore`; secret values were not printed | Passed |
| Worker concurrency | worker env kept `WORKER_MAX_CONCURRENCY=1`; `real_io_smoke` confirmed concurrency `1` | Passed |
| PostgreSQL baseline initialized | `202605130001_domestic_core_baseline.sql` applied to `jj_selfhost` | Passed |
| Minimal owner / merchant seed | `domestic_minimal_seed.example.sql` inserted disposable owner/merchant | Passed |
| App env preflight | `check-domestic-app-env.mjs --require-video-chain-test-entrypoint` returned `status: ok`, DB `select 1`, required tables present | Passed |
| COS roundtrip | `check-domestic-cos-roundtrip.mjs --prefix selfhost-rehearsal/app-cos-smoke` uploaded, signed-downloaded, verified, and deleted a smoke object | Passed |
| Next.js build on Singapore server | Docker `node:22-bookworm-slim` ran `pnpm install` and `pnpm build`; Next.js 16.2.4 build completed | Passed |
| systemd app start | `jingjing-selfhost-app.service` started Docker Node app on `0.0.0.0:3002`; internal `/api/health` returned `200` | Passed |
| Public IP app access | local curl to `http://43.160.208.189:3002/api/health` timed out, likely security group/firewall; internal server curl worked | Not passed |
| API smoke | `check-domestic-video-chain-api-smoke.mjs --with-upload-intent` returned `status: ok`, login `303`, test draft/upload intent/media complete/job create all expected | Passed |
| Worker real I/O smoke | Docker `jingjing-video-worker-video-worker` image ran `python -m app.real_io_smoke --env-file /worker.env`; DB/COS checks passed | Passed |
| Small synthetic input upload | 1-second synthetic mp4 uploaded to Singapore COS input key, 3235 bytes | Passed |
| Small synthetic video job e2e | worker claimed jobs and downloaded COS input, but FireRed/OpenStoryline did not produce final output | Not passed |
| Domestic real-resource e2e | needs mainland server/PostgreSQL/COS later | Pending |

## 7. Runtime evidence

Remote target:

- Server: `43.160.208.189`
- SSH user: `ubuntu`
- Rehearsal root: `/srv/jingjing-selfhost-rehearsal`
- Existing worker root reused for temp/output mounts:
  `/srv/jingjing-video-worker`

Plain PostgreSQL:

- Container: `jingjing-selfhost-pg`
- Image: `postgres:17`
- Host binding: `127.0.0.1:15433`
- DB/user: `jj_selfhost`
- Migration: passed
- Seed: passed

App:

- Runtime: Docker `node:22-bookworm-slim`
- Process manager: systemd unit `jingjing-selfhost-app.service`
- Port: `3002`
- Build: passed
- Internal health:

```json
{"ok":true,"app":{"status":"ok","runtime":"nodejs"},"database":{"status":"ok","provider":"postgres"},"cos":{"status":"configured","bucket":"jj-content-staging-1341668543","region":"ap-singapore"}}
```

App preflight:

- `database_url`: ok from `APP_DATABASE_URL`
- `DATABASE_PROVIDER`: `postgres`
- `VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED`: enabled
- database `selectOne`: true
- required tables: present

COS roundtrip:

- bucket: `jj-content-staging-1341668543`
- region: `ap-singapore`
- smoke key prefix: `selfhost-rehearsal/app-cos-smoke`
- signed download status: `200`
- downloaded bytes matched
- smoke object deleted

API smoke:

- base URL: `http://127.0.0.1:3002`
- login: `303`
- test draft: `201`
- upload intent: `201`
- upload intent credentials: present
- media complete: `201`
- video job create: `201`
- render mode: `asset_driven`

First synthetic job:

- Job id: `6fc73be3-fd5a-47b1-a6e5-710b14493fb9`
- Input key:
  `draft-inputs/52cac9bf-73f6-4af8-adea-866431f96edf/d59ae275-c620-490d-8ccd-a93673702c8c/1c5170d3-bbee-4e61-9dd6-35e8cc888615-selfhost-synthetic-smoke.mp4`
- Synthetic input: 1-second generated mp4, 3235 bytes
- Worker id: `singapore-selfhost-rehearsal-worker-01`
- Worker claim: passed
- Input COS download: passed
- OpenStoryline health: `engine_adapter=fire_red`
- Final status: `failed_retryable`
- Failure stage: `openstoryline_rendering_failed`
- Failure code: `openstoryline_rendering_failed`
- Observed FireRed/OpenStoryline result:
  `/v1/runs` returned `500 Internal Server Error`.
- Earlier FireRed log included `model sampling timed out after 180s` around
  BGM/script-related nodes.

Second fast-path synthetic job:

- Job id: `29055f41-91c1-4816-b7c8-253c2d4e0ac2`
- Input key:
  `draft-inputs/52cac9bf-73f6-4af8-adea-866431f96edf/1d723a02-e71d-4aa3-8094-d810e6c21df8/4af5d5fe-fd59-4e73-beaa-09d490cfd236-selfhost-synthetic-fast.mp4`
- Synthetic input: same 1-second generated mp4, 3235 bytes
- Payload was adjusted for a faster rehearsal path:
  - `desiredOutputs=["final_video"]`
  - `voiceover.enabled=false`
  - `bgm.enabled=false`
  - `subtitles.enabled=false`
- First attempt failed quickly because FireRed raised:
  `ClientContext.__init__() got an unexpected keyword argument 'pexels_base_url'`.
- A temporary container-only hotfix added `pexels_base_url` to FireRed
  `ClientContext`, then `firered-openstoryline` was restarted and became
  healthy again.
- After retry, the job stayed in `running/openstoryline_rendering` for 20 minutes
  of polling and did not produce final output.
- The isolated worker was stopped after the observation window to avoid
  continued resource use.

Cleanup / current remote state after this pass:

- `jingjing-selfhost-worker`: removed
- `jingjing-selfhost-app.service`: disabled and stopped
- `jingjing-selfhost-pg`: stopped, container still exists with the rehearsal DB
- `firered-openstoryline`: still running; it contains the temporary
  container-only `pexels_base_url` hotfix, which is not a durable source-code
  commit and can be lost if the container is recreated

## 8. Result interpretation

This pass proves:

- The app can be built and started off Vercel on the Singapore server.
- The app/API can use plain PostgreSQL through `APP_DATABASE_URL`.
- The app-owned session path works for login and authenticated API smoke.
- Supabase Auth/Supabase SDK are not required for the tested video API smoke.
- Singapore COS roundtrip works from the self-hosted app env.
- The worker can use `WORKER_DATABASE_URL` and `WORKER_COS_*` against the
  self-hosted rehearsal env.
- The worker can claim a PostgreSQL job, download a real synthetic COS input,
  and invoke FireRed/OpenStoryline.

This pass does not prove:

- A complete self-hosted `final.mp4` render/upload/re-signed-preview chain.
- Public browser access to the app by Singapore IP/port.
- Domestic real-resource e2e.

## 9. Next execution steps

Before rerunning the video e2e:

1. Make the `ClientContext.pexels_base_url` compatibility fix durable in the
   FireRed source/image if the remote codebase still passes that field.
2. Investigate why FireRed repeatedly stayed in `openstoryline_rendering` after
   the hotfix. The log pattern suggests the agent kept calling `load_media`
   instead of reaching `render_video` within the 20-minute observation window.
3. Consider a dedicated FireRed smoke endpoint or deterministic render fixture
   that bypasses LLM/BGM/TTS and proves `render_video -> final.mp4 -> COS`
   without using real user material.
4. If public app access is required, open an explicit test port or install Nginx
   and point only an IP-stage test location to the app. Do not switch
   `ba-ba-ke.com`.
5. Restart the isolated rehearsal resources only when needed:

   ```bash
   sudo docker start jingjing-selfhost-pg
   sudo systemctl start jingjing-selfhost-app
   ```

   Then start an isolated worker only after the test job input is ready.

## 10. Pending runtime evidence section

Still pending for a full self-hosted pass:

- Final `final.mp4` COS key:
- Signed preview/download:
- Self-hosted final video e2e status:
- Domestic real-resource e2e status: pending
