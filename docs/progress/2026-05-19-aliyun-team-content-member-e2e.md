# 2026-05-19 Aliyun Team Content Member E2E

## Scope

Batch 10H targeted the V2.3.1 product path on the Aliyun domestic runtime:

- consultation/team topic to team weekly content generation
- Dify generation jobs for member article/video task packages
- member calendar and member upload/AI edit
- FireRed normal no-voiceover final preview/download

Guardrails honored:

- no main merge
- no DNS, ICP, RDS public access, or OSS public ACL changes
- no secret values printed or committed
- existing FireRed no-voiceover, Aliyun OSS, and `video-results/*` worker path left unchanged

## Starting Point

- Starting HEAD backed up on Gitee: `3b9a97f`
- Code commit produced and pushed: `076dcb1 feat: wire team content generation batch flow`
- Deployed release: `/srv/jingjing-domestic/releases/20260519061233-076dcb1`
- Current symlink: `/srv/jingjing-domestic/current`
- App service: `jingjing-domestic-app.service`

## App Env Migration

Target:

- `/srv/jingjing-domestic/shared/env/app.env`

Backup before Batch 10H write:

- `/srv/jingjing-domestic/backups/app.env.before-batch10h-20260519T061101Z`

Only these Dify/content-generation fields were considered:

| Field | Aliyun status after write |
|---|---|
| `DIFY_API_KEY` | MISSING |
| `DIFY_BASE_URL` | SET |
| `DIFY_WORKFLOW_RESPONSE_MODE` | SET |
| `DIFY_WORKFLOW_TIMEOUT_SECONDS` | SET |
| `DIFY_WORKFLOW_VERSION` | SET |
| `CONTENT_GENERATION_WORKER_SECRET` | SET |

The Vercel Production allowlist pull still returned `DIFY_API_KEY` as missing/empty. No Supabase, COS, Vercel deployment, RDS, or Aliyun OSS runtime fields were overwritten.

## Code Changes

Implemented:

- Consultation calendar primary CTA now shows `生成团队本周内容`.
- The CTA calls `POST /api/content-generation/batches` with `memberScope=active_members`.
- Old direct article/video workbench links were downgraded to internal-test secondary links.
- Added `GET /api/content-generation/batches/[batchId]` for batch/job status polling.
- Added owner/member access filtering for batch status.
- Updated daily task links so non-owner members route to `/member/article/[taskId]` and `/member/video/[taskId]`.
- Added `app/scripts/run-content-generation-jobs-until-empty.mjs` as a one-shot `run-next` consumer.

No worker, FireRed, OpenStoryline, storage provider, or output prefix code was changed.

## Local Validation

Passed:

- `node --check app/scripts/run-content-generation-jobs-until-empty.mjs`
- `git diff --check`
- `cd app && npm run typecheck`
- `cd app && npm run lint`
- `cd app && npm run build`

## Aliyun Deployment Validation

Release build on ECS passed:

- `corepack pnpm@10.20.0 install --frozen-lockfile`
- `corepack pnpm@10.20.0 build`

Runtime checks passed:

| Check | Result |
|---|---|
| `/api/health` | ok |
| DB provider | `postgres` |
| storage provider | `aliyun_oss` |
| bucket | `jingjing-domestic-phase1-hz` |
| app env preflight | ok |
| Aliyun OSS roundtrip | ok |
| signed PUT/CORS | ok |
| content generation run-next script | ok, empty queue |
| `jingjing-domestic-app.service` | active |
| `nginx` | active |

Evidence:

- OSS roundtrip key: `app-storage-provider-smoke/813dbffc-8c68-4663-a998-317c22dadc2e.txt`, deleted after validation.
- signed PUT key: `draft-inputs/signed-put-smoke/7babfba1-71d1-4043-8a35-c038b753377d.txt`, deleted after validation.
- run-next consumer: `processedCount=0`, `emptyQueue=true`, `workerSecret=SET`.
- content-generation job table counts before consumer check: no rows.

Browser check via Chrome/web-access:

- URL: `http://8.154.28.41/dashboard/consultation?t=10h`
- QA owner login succeeded using local credential file without printing values.
- Page showed `营销内容日历`.
- Page showed primary CTA `生成团队本周内容`.
- Calendar items showed secondary `内测入口` links instead of the old primary direct workbench path.

## Blocker

True Dify E2E was not run because `DIFY_API_KEY` is missing on Aliyun and missing/empty in the Vercel Production allowlist source.

The app code would fail real Dify execution with `DIFY_API_KEY_MISSING` if a job were consumed. To avoid corrupting QA daily tasks by marking jobs failed, no Batch 10H Dify batch was created and no real pending job was consumed.

Therefore these acceptance items remain blocked:

- Dify real smoke
- owner-created team content batch with real Dify completion
- `daily_content_tasks` writeback from Dify output
- member viewing Dify-generated article/video packages
- member video E2E based on Dify-generated script
- final member video job id / final asset id / preview/download from this Batch 10H path

## Not Performed

- No member invitation was created in this batch.
- No new member account was registered in this batch.
- No member upload or AI edit was started from a Dify-generated task.
- No content-generation systemd timer was installed or enabled. The one-shot consumer script is deployed and verified against an empty queue; installing a timer before `DIFY_API_KEY` is set would risk failing real jobs immediately.

## Rollback

App release rollback:

```bash
sudo ln -sfn /srv/jingjing-domestic/releases/20260519013445-52ce51d /srv/jingjing-domestic/current
sudo systemctl restart jingjing-domestic-app.service
```

App env rollback:

```bash
sudo cp /srv/jingjing-domestic/backups/app.env.before-batch10h-20260519T061101Z /srv/jingjing-domestic/shared/env/app.env
sudo chmod 600 /srv/jingjing-domestic/shared/env/app.env
sudo systemctl restart jingjing-domestic-app.service
```

## Next Step

Have the user add `DIFY_API_KEY` safely to `/srv/jingjing-domestic/shared/env/app.env` or provide a local 600-permission env patch path. Then rerun Batch 10H real E2E:

1. restart `jingjing-domestic-app.service`
2. verify `/api/health`
3. create owner team weekly content batch
4. run `app/scripts/run-content-generation-jobs-until-empty.mjs`
5. verify generated article/video script on `/member/calendar`
6. run member upload/AI edit and FireRed no-voiceover preview/download
