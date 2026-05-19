# 2026-05-19 Aliyun Team Content Member E2E Handoff

## Current State

Batch 10H is partially integrated and deployed, but real Dify E2E is blocked by missing `DIFY_API_KEY`.

- Branch: `codex/domestic-infra-migration`
- Code commit: `076dcb1 feat: wire team content generation batch flow`
- Deployed release: `/srv/jingjing-domestic/releases/20260519061233-076dcb1`
- App current symlink: `/srv/jingjing-domestic/current`
- App service: `jingjing-domestic-app.service`, active
- Nginx: active

## What Changed

Code:

- Consultation content calendar now has primary `生成团队本周内容` CTA.
- CTA creates a Dify content-generation batch for `active_members`.
- Batch status can be read through `GET /api/content-generation/batches/[batchId]`.
- Consultation UI displays batch/job counts for pending/running/succeeded/failed.
- Old article/video workbench links are retained only as secondary internal-test entries.
- Member task links no longer route ordinary members to `/dashboard/video`; they route to member pages.
- One-shot content-generation consumer script added:
  - `app/scripts/run-content-generation-jobs-until-empty.mjs`

Runtime env:

- Backed up `/srv/jingjing-domestic/shared/env/app.env` to `/srv/jingjing-domestic/backups/app.env.before-batch10h-20260519T061101Z`.
- Added/confirmed only allowed Batch 10H fields.
- `CONTENT_GENERATION_WORKER_SECRET` is SET.
- `DIFY_WORKFLOW_VERSION` is SET.
- `DIFY_API_KEY` is still MISSING.

No worker/FireRed/OpenStoryline/storage-prefix changes were made.

## Validation Completed

Local:

- `node --check app/scripts/run-content-generation-jobs-until-empty.mjs`
- `git diff --check`
- `cd app && npm run typecheck`
- `cd app && npm run lint`
- `cd app && npm run build`

Aliyun:

- Release build passed on ECS.
- `/api/health`: ok, DB `postgres`, storage `aliyun_oss`.
- app env preflight: ok.
- Aliyun OSS roundtrip: ok.
- signed PUT/CORS: ok.
- run-next one-shot script: ok against empty queue.
- Browser check confirmed the consultation page shows `生成团队本周内容`.

## Blocker

`DIFY_API_KEY` is missing in both:

- Aliyun `/srv/jingjing-domestic/shared/env/app.env`
- Vercel Production allowlist pull source

Because `app/src/server/api/dify-workflow-client.ts` requires `DIFY_API_KEY`, real Dify job consumption would fail with `DIFY_API_KEY_MISSING`. I intentionally did not create or consume a real Dify batch, to avoid marking QA daily tasks failed.

## Not Yet Verified

- Dify real smoke.
- owner weekly team content batch completing through Dify.
- `daily_content_tasks.generatedArticle` and `generatedVideoScript` writeback from Dify.
- member invitation/join flow for this batch.
- member viewing Dify-generated article/video packages.
- member upload from a Dify-generated video task.
- member AI edit to FireRed final asset for this V2.3.1 path.
- final video job id, asset id, preview/download bytes for this V2.3.1 path.
- long-running systemd timer for content-generation jobs.

## Safe Next Steps

1. Add `DIFY_API_KEY` to Aliyun app env through a safe path that does not paste the value into chat or Git.
2. Restart `jingjing-domestic-app.service`.
3. Verify `/api/health` still reports `postgres` and `aliyun_oss`.
4. Create owner team weekly content batch from `/dashboard/consultation`.
5. Run:

```bash
cd /srv/jingjing-domestic/current/app
sudo node scripts/run-content-generation-jobs-until-empty.mjs \
  --env-file /srv/jingjing-domestic/shared/env/app.env \
  --base-url http://127.0.0.1:3000 \
  --max-jobs 20
```

6. Verify member calendar generated content, then run member upload and FireRed no-voiceover AI edit.

## Rollback

Release rollback:

```bash
sudo ln -sfn /srv/jingjing-domestic/releases/20260519013445-52ce51d /srv/jingjing-domestic/current
sudo systemctl restart jingjing-domestic-app.service
```

Env rollback:

```bash
sudo cp /srv/jingjing-domestic/backups/app.env.before-batch10h-20260519T061101Z /srv/jingjing-domestic/shared/env/app.env
sudo chmod 600 /srv/jingjing-domestic/shared/env/app.env
sudo systemctl restart jingjing-domestic-app.service
```

## Files Changed

- `app/src/components/merchant/consultation-workspace.tsx`
- `app/src/components/merchant/daily-tasks-workspace.tsx`
- `app/src/lib/db/content-generation-repository.ts`
- `app/src/server/api/content-generation-batch-service.ts`
- `app/src/app/api/content-generation/batches/[batchId]/route.ts`
- `app/scripts/run-content-generation-jobs-until-empty.mjs`
- `docs/progress/2026-05-19-aliyun-team-content-member-e2e.md`
- `docs/handoff/2026-05-19-aliyun-team-content-member-e2e-handoff.md`
