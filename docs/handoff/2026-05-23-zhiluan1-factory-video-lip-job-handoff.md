# 2026-05-23 zhiluan1 factory video lip job handoff

## Current Goal

For merchant/team `厂房宣传`, member `zhiluan1`, restore the preferred 2026-05-22 Dify video script onto the 2026-05-23 member task, let the member upload talking-head videos, and verify the video edit/lip-sync chain.

## Production Entities

- Merchant: `厂房宣传`
  - `merchant_id = e7c94a17-cf7d-4eb2-8178-13daa780551a`
- Member: `zhiluan1`
  - `user_id = 0b3351a6-778b-4e79-b5f1-6aa18fdb0020`
- 2026-05-23 daily task:
  - `daily_content_tasks.id = 39946899-d5ec-45a1-9203-18799554da24`
  - title: `找厂房，先看这三个点`
  - status: `video_script_created`
  - `memberUploadPolicy = talking_head_required_only`
  - restored from task date: `2026-05-22`
- Restored draft:
  - `content_drafts.id = 36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`
- Restored variant:
  - `content_variants.id = 3ff39eeb-e9b8-445d-827a-4d19595b28b3`
  - review status: `approved`
  - production scenes: `5`
  - `requiresUserUpload=true` scenes: `2`

## What Was Done

1. The 2026-05-23 task was restored to the 2026-05-22 script.
2. A backup was created before restore:
   - `/srv/jingjing-domestic/shared/backups/zhiluan1-restore-20260523-before-20260523132613.json`
3. User uploaded two member videos to the restored draft:
   - `16087728-c740-4e68-afc6-a76e4e7ede5b`
   - `09d2fe6c-8105-4713-854e-4fbd846bc2f7`
4. Current app-created video edit job was:
   - `video_edit_jobs.id = e91a614d-5539-450f-8654-a8792e784d97`

## Important Finding

The current app-created job had two uploaded videos in `input_payload.input_assets`, but it did not classify them as talking-head when the job was created:

- `materialContext.userTalkingHeadAssetIds = []`
- `input_assets[].role` was missing
- `input_assets[].tags` was missing talking-head tags
- `sceneAssetQueries[].sourceRole` still showed `merchant_broll`

The job payload was patched after it had already started:

- Added `role: "talking_head"`
- Added `tags: ["talking_head", "member_upload"]`
- Added talking-head metadata
- Set `materialContext.userTalkingHeadAssetIds` to the two uploaded asset ids

This DB patch did not fully affect the already-running FireRed/OpenStoryline session because the worker had already loaded the payload into memory before the patch.

## 2026-05-23 Contract Audit Patch

The restored script was confirmed to be a manual/temporary restoration, not a fresh Dify workflow result. To avoid losing that distinction, this branch prepares a contract audit patch. Do not run it as a direct hot update on the current server release.

Added script:

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`

Release-time command after this branch is merged and deployed:

- `/srv/jingjing-domestic/current/app/scripts/patch-zhiluan1-restored-video-script-contract.mjs --apply`

Target records patched by that command:

- `daily_content_tasks.id = 39946899-d5ec-45a1-9203-18799554da24`
- `content_drafts.id = 36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`
- `content_variants.id = 3ff39eeb-e9b8-445d-827a-4d19595b28b3`

What the patch adds:

- `content_drafts.input_snapshot.manualRestoreProvenance`
- `content_drafts.input_snapshot.difyContractAudit`
- `daily_content_tasks.team_calendar_source.manualRestoreProvenance`
- `daily_content_tasks.team_calendar_source.difyContractAudit`
- regenerated/preserved `content_variants.production_scenes` from the restored member video task
- `content_variants.production_scenes[].durationSeconds`
- computed `content_variants.production_scenes[].timeRange` when duration is available
- policy note that `targetDurationSeconds` remains for frontend display only

What is still intentionally missing because it cannot be honestly fabricated:

- `content_generation_jobs` row
- `contentGenerationJobId`
- `batchId`
- `workflowProvider = dify`
- `workflowVersion`
- `difyWorkflowRunId`
- `difyInputs`
- `difyFinalJson`
- `difyRawOutputs`
- `memberProfileSnapshot`
- `accountProfileSnapshot`

Expected post-patch verification after release:

- `team_calendar_source.source = manual_factory_script`
- `input_snapshot.source = daily_task`
- `manualRestoreProvenance.sourceIsDifyWorkflowRun = false`
- missing normal Dify fields count: `11`
- `production_scenes` count: `5`
- talking-head scenes: `[1, 5]`
- uploaded draft video assets: `2`
- `recommendedProductionConfig.render.maxDurationSeconds` is absent

Progress record:

- `docs/progress/2026-05-23-zhiluan1-restored-video-script-contract-audit.md`

## Runtime Evidence

FireRed logs showed lip-sync target discovery failed during the active run:

```text
lip_sync enabled but no talking-head timeline segments were found
```

The run later continued and rendered, but local node artifact inspection showed it was not a valid lip-sync result:

```text
lip_sync enabled=false
segments_count=0
retalked_paths=[]
render lip_sync_segments_consumed=0
```

Therefore job `e91a614d-5539-450f-8654-a8792e784d97` must not be treated as a successful lip-sync run.

## Current Job Status

Per user request, the job was stopped and marked cancelled.

- Job: `e91a614d-5539-450f-8654-a8792e784d97`
- Final status: `cancelled`
- Current stage: `manual_cancelled`
- Failure code: `manual_stopped`
- Failure reason: `manually_stopped_by_user_after_lip_role_runtime_check_2026_05_23`
- `finished_at`: `2026-05-23 14:38:50+08`

Stopping actions:

1. Stopped:
   - `jingjing-video-worker.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-firered-openstoryline.service`
2. Updated the job row to cancelled.
3. Restarted the same three services.

Post-stop verification:

- `video_edit_jobs` in-flight count: `0`
- `content_generation_jobs` in-flight count: `0`
- `jingjing-video-worker.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-firered-openstoryline.service`: active
- OpenStoryline `/ready`: ready
- FireRed `/api/ready`: ready

## Previous Code/Release Context

Earlier in this session, a separate release was present on the server:

- Gitee branch: `5.23-worker-fix`
- Commit: `9a6c872dbe530572077cc508479446fbf826d424`
- Server release: `/srv/jingjing-domestic/releases/20260523140234-9a6c872`
- Current symlink points to that release.

That earlier release changed lip URL defaults to auto OSS signed URLs:

- `aliyun_videoretalk_upload_url_mode = "auto"`
- FireRed configs now use `upload_url_mode = "auto"`

Server smoke check for lip URL signing passed:

- Generated temporary OSS signed URL.
- Range request returned `206`.
- Temporary object was deleted after check.

## Current Branch Fix

Do not rerun from the old cancelled job as proof of success.

This branch fixes the app payload creation path so freshly-created member jobs classify member uploads correctly at creation time:

1. `pgAssertContentVariantAccess` now returns `productionScenes` from the approved variant.
2. Dify and repository mappers preserve `durationSeconds`.
3. Member UI keeps `targetDurationSeconds` available for display, but no longer sends it as `productionConfig.render.maxDurationSeconds`.
4. App payload normalization and worker directive normalization ignore historical `render.maxDurationSeconds` / `render.max_duration_seconds`.
5. Input assets under the member draft should become:
   - `role: "talking_head"`
   - `scene_type: "talking_head"`
   - `tags/labels` include `talking_head`
   - `materialContext.userTalkingHeadAssetIds` contains the member upload asset ids
6. `sceneAssetQueries` for upload-required scenes should use:
   - `sourceRole: "user_talking_head"`

After that fix is released, create a fresh video edit job from the member UI. The existing two uploaded asset rows are still present on draft `36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`, so the user should not need to upload again unless they want to replace素材.

## Current Working Tree

- Local worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`
- Local branch at the time of this handoff: `5.23-worker-fix`
- Local verification passed and the branch has a fix commit; use `git log -1` or the final release record for the immutable hash.
- Push/merge/release: pending.
