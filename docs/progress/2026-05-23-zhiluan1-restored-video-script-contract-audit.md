# 2026-05-23 zhiluan1 restored video script contract audit

## Scope

- Target merchant/team: `厂房宣传`
- Target member: `zhiluan1`
- Target daily task: `39946899-d5ec-45a1-9203-18799554da24`
- Target draft: `36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`
- Target variant: `3ff39eeb-e9b8-445d-827a-4d19595b28b3`

This task handled the fact that the restored video script was a manual/temporary restoration, not a fresh Dify workflow result.

## What Was Added

Added a reusable patch script:

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`

This branch does not apply the patch directly to the current server release. Apply it only after the branch is merged to `main`, pushed to Gitee, and deployed as a normal server release.

Release-time command shape:

```bash
node scripts/patch-zhiluan1-restored-video-script-contract.mjs --apply
```

The script updates only the target records:

- `daily_content_tasks.id = 39946899-d5ec-45a1-9203-18799554da24`
- `content_drafts.id = 36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`
- `content_variants.id = 3ff39eeb-e9b8-445d-827a-4d19595b28b3`

The script supports dry-run by omitting `--apply`. No video job is created by this patch.

## Normal Flow Gap

Normal Dify flow should have a real `content_generation_jobs` row and Dify trace in `content_drafts.input_snapshot`.

This restored script is not a real Dify run, so the patch deliberately did not fabricate:

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

These 11 items are now recorded in:

- `content_drafts.input_snapshot.difyContractAudit.missingNormalDifyFields`
- `daily_content_tasks.team_calendar_source.difyContractAudit.missingNormalDifyFields`

## Compensated Fields

The following fields are now present or preserved so the member video/lip-sync chain can create the next fresh job correctly:

- `daily_content_tasks.video_task.generatedVideoScript.scenes[].required`
- `daily_content_tasks.video_task.memberUploadPolicy = talking_head_required_only`
- `daily_content_tasks.video_task.recommendedProductionConfig`
- `daily_content_tasks.video_task.recommendedProductionConfig.render` without `maxDurationSeconds`
- `daily_content_tasks.video_task.generatedVideoScript.targetDurationSeconds` for frontend display only
- `content_variants.production_scenes[].requiresUserUpload`
- `content_variants.production_scenes[].sceneType`
- `content_variants.production_scenes[].durationSeconds`
- `content_variants.production_scenes[].timeRange`
- `content_drafts.input_snapshot.factoryMemberAssignment`
- `content_drafts.input_snapshot.manualRestoreProvenance`
- `content_drafts.input_snapshot.difyContractAudit`

## Verification

Expected server verification after release-time apply:

- `daily_content_tasks.team_calendar_source.source = manual_factory_script`
- `daily_content_tasks.team_calendar_source.difyContractAudit.status = manual_restored_script_not_dify_workflow_output`
- `content_drafts.input_snapshot.source = daily_task`
- `content_drafts.input_snapshot.manualRestoreProvenance.sourceIsDifyWorkflowRun = false`
- `content_drafts.input_snapshot.difyContractAudit.missingNormalDifyFields` count: `11`
- `content_variants.production_scenes` count: `5`
- Required talking-head scenes: `[1, 5]`
- Scene types: `["talking_head", "merchant_broll", "merchant_broll", "merchant_broll", "talking_head"]`
- `recommendedProductionConfig.render.maxDurationSeconds` absent
- Uploaded draft video assets under `asset_objects`: `2`

## Important Boundary

This patch makes the manual restoration auditable and worker-ready after it is applied through the normal release path. It does not prove a lip-sync success.

The old cancelled job remains invalid as lip-sync evidence:

- `video_edit_jobs.id = e91a614d-5539-450f-8654-a8792e784d97`
- Final status: `cancelled`

Next valid verification still requires creating a fresh video edit job after the payload creation path reads this corrected draft/variant state.

## Branch Code Fix

The branch fix is required because the prior payload builder did not receive/read the structured `productionScenes` when creating `video_edit_jobs.input_payload`.

Corrected behavior:

- `pgAssertContentVariantAccess` returns `productionScenes`.
- Repository mappers preserve scene `durationSeconds`.
- Dify scene mapping stores `durationSec` as `durationSeconds`.
- Member UI no longer sends `targetDurationSeconds` as `productionConfig.render.maxDurationSeconds`.
- App payload normalization and worker directive normalization ignore historical render duration caps.
- Fresh payloads should have `materialContext.userTalkingHeadAssetIds`, `input_assets[].role = "talking_head"`, and upload-required `sceneAssetQueries[].sourceRole = "user_talking_head"`.

## Post-Release Verification

The branch was committed, pushed, merged to `main`, and released through the normal server release flow.

- Fix commit: `a393d4d39d1df9a4d4fe8f2683e946ebcaae5a2c`
- Fix branch: `5.23-worker-fix`
- Server release: `/srv/jingjing-domestic/releases/20260523165418-a393d4d`
- Active symlink: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260523165418-a393d4d`

The data patch was then applied from the released code path. Readback after apply:

- `team_calendar_source.source = manual_factory_script`
- audit status: `manual_restored_script_not_dify_workflow_output`
- missing normal Dify fields count: `11`
- `sourceIsDifyWorkflowRun = false`
- `targetDurationSeconds = 52`
- `recommendedProductionConfig.render` keys: `aspectRatio`, `includeOriginalAudio`
- `recommendedProductionConfig.render.maxDurationSeconds` absent
- `recommendedProductionConfig.render.max_duration_seconds` absent
- `production_scenes` count: `5`
- required talking-head scenes: `[1, 5]`
- scene durations: `[5, 12, 14, 13, 8]`
- scene time ranges: `00:00-00:05`, `00:05-00:17`, `00:17-00:31`, `00:31-00:44`, `00:44-00:52`
- uploaded draft video assets: `3`

`targetDurationSeconds` remains in the script for frontend display, but it is not sent to the backend render config as a cap.

## Fresh Video Job Result

A fresh job was created after release and patch application:

- `video_edit_jobs.id = 9c5e17d2-5351-4e2d-95de-72ba575aa0e2`
- Worker: `aliyun-phase1-worker-01`
- Claimed: `2026-05-23 17:09:31+08`
- Completed: `2026-05-23 17:35:50+08`
- Final status: `succeeded`
- Current stage: `completed`
- Failure code/reason: `null`

Payload verification:

- `materialContext.userTalkingHeadAssetIds` contained:
  - `16087728-c740-4e68-afc6-a76e4e7ede5b`
  - `5c2b3064-22ac-4b59-999e-553cfa9f68d6`
  - `09d2fe6c-8105-4713-854e-4fbd846bc2f7`
- All three input assets were `role = talking_head`, `scene_type = talking_head`, `storage_provider = aliyun_oss`.
- `productionConfig.render` did not contain `maxDurationSeconds` or `max_duration_seconds`.
- The input payload did not carry a direct lip URL. This is expected for the current contract: the job payload carries OSS keys; FireRed/VideoRetalk performs runtime upload/signing inside the lip-sync node, and those transient URLs are not persisted in `input_payload` or the `lip_sync` artifact.

Runtime log evidence:

- FireRed session/output id: `3c0a416dad8c4898afdeb20b3059cc14`
- `lip_sync` node saved:
  - `/srv/jingjing-video-worker/firered/outputs/3c0a416dad8c4898afdeb20b3059cc14/lip_sync/lip_sync_1779528516.1624327.json`
- `lip_sync` completed for:
  - `group_0001/clip_0003`
  - `group_0010/clip_0004`
  - `group_0010/clip_0006`
- `lip_sync` JSON summary:
  - provider: `aliyun_videoretalk`
  - retalked segment count: `3`
  - timeline lip-sync track count: `3`
  - persisted URL field count: `0`
  - error-like string count: `0`
- Retalked files were nonzero:
  - `retalked_group_0001_clip_0003.mp4`: `907894` bytes
  - `retalked_group_0010_clip_0004.mp4`: `573436` bytes
  - `retalked_group_0010_clip_0006.mp4`: `374303` bytes
- Render completed:
  - `/srv/jingjing-video-worker/firered/.storyline/.server_cache/3c0a416dad8c4898afdeb20b3059cc14/render_video_1779528731.1353347/output_9d53ec61_1779528731184.mp4`
  - size: `14285099` bytes
  - logged duration: `106.069` seconds
- Because the rendered duration was `106.069` seconds while `targetDurationSeconds` was `52`, the script estimate did not limit the backend render duration.

Uploaded output verification:

- Final video:
  - asset id: `5a727b07-37c3-451c-806a-2e2bb95db260`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/final.mp4`
  - size: `14285099` bytes
  - OSS headObject: `200`
- Cover:
  - asset id: `ad7d3f13-9944-404f-bcd1-ac2a4a618eed`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/cover.jpg`
  - size: `9262` bytes
  - OSS headObject: `200`
- Subtitles:
  - asset id: `14e999d2-c325-4499-b19a-430c185a2c12`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/subtitles.srt`
  - size: `3191` bytes
  - OSS headObject: `200`

Operational note: the `result_payload.local_outputs` paths were not present under `/srv/jingjing-video-worker/outputs/jobs/<job-id>` when checked after completion. The durable evidence for this run is the FireRed render cache file, the uploaded Aliyun OSS objects, and the `asset_objects` rows.
