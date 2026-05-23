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
