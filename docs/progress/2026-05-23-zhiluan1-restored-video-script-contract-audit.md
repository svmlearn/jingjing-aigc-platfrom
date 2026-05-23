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

## 2026-05-23 Content Review Correction

The fresh job `9c5e17d2-5351-4e2d-95de-72ba575aa0e2` is valid evidence that the formal worker chain ran (`video_edit_jobs -> jingjing-video-worker -> FireRed/OpenStoryline -> Aliyun VideoRetalk -> render -> OSS upload`), but it is not acceptable as a final content result.

Two additional defects were found after reviewing the rendered content and FireRed `generate_script` artifact:

- The locked member script contained both `口播：...` and `字幕：...` lines. FireRed's locked-script interceptor treated standalone `字幕` as another dialogue label, so the same scene was turned into two voiceover/script groups.
- The member draft had duplicate uploaded video asset rows with the same OSS ETag. The payload builder preserved exact duplicate videos in `input_assets`, so duplicate material could enter the OpenStoryline素材池.

Local fix now prepared on branch `5.23-worker-fix`:

- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
  - prefers `台词/字幕` / `台词` / `旁白` / `口播` for spoken text.
  - uses standalone `字幕` only as fallback when no spoken label exists.
  - keeps numbered locked-script scenes as authored instead of expanding them just to match FireRed group count.
- `app/src/server/api/video-job-payload.ts`
  - deduplicates video `input_assets` by `storageProvider + bucketName + ETag + fileSizeBytes`, keeping the newest asset row when timestamps are available.

Local verification before release:

- `python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py` with worker `PYTHONPATH`: `42 passed`.
- `node --test app/src/server/api/video-job-payload.test.ts app/src/components/member/member-workspace-contract.test.ts`: `25 passed`.
- `npm run typecheck` from `app/`: passed.

## 2026-05-23 Real Script-Format Follow-up

After releasing commit `bc5cfb8`, a fresh API-created job was started:

- `video_edit_jobs.id = ba6ba828-9bac-45a5-9905-6cf88f86a10f`
- Created through the real Next API `POST /api/video-edit-jobs`, not by direct `video_edit_jobs` insert.
- The request intentionally passed all five historical draft video asset ids; the released payload builder correctly deduplicated them to two `input_assets`.
- The job was cancelled before completion because FireRed still logged `Using locked custom script for 9 group(s)`.

Root cause: the live script format uses headings like `场景1（0-5秒）`, while the first parser fix only treated the old two-line format (`1` then `00:00-00:05`) as structured numbered sections. That meant the real script still fell through to fallback line extraction and expansion.

Second local fix now prepared:

- Add a parser for `场景N（start-end秒）` scene headings.
- Treat those sections as authored structured scenes, so they are not expanded to FireRed group count.
- Add `素材关键词` to the label stop list so fallback subtitle extraction does not consume material keywords.

Second local verification:

- `python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py` with worker `PYTHONPATH`: `43 passed`.

## 2026-05-23 Third Runtime Correction

After releasing `3a8b66d`, job `a43eba52-91ad-4b79-bbec-0a133224585c` was created through the real `POST /api/video-edit-jobs` path.

Formal-chain evidence:

- Worker claimed the job at `2026-05-23 19:08:10+08`.
- Payload had two deduplicated `talking_head` input assets.
- FireRed session: `2b6364cec3fb460aa48cacc19d30db66`.
- `load_media` loaded ten videos total: two member talking-head videos plus eight `merchant_material_library` project materials.
- `split_shots` produced eighteen clips.
- `understand_clips`, `filter_clips`, `group_clips`, first `generate_script`, `generate_voiceover`, `select_bgm`, and transition/text nodes ran.

This means the material was not manually assembled into a final cut. The API/worker supplied the material pool; OpenStoryline indexed, understood, filtered, and grouped it.

The job was still cancelled because the content contract failed:

- First `generate_script`: five authored spoken lines, correct.
- `group_clips`: ten visual groups despite the request for five script scenes.
- `plan_timeline_pro`: failed on `tts_start_timestamp + tts_duration` where `tts_start_timestamp` was `None`.
- OpenStoryline retry: called `generate_script` with `Use the locked script exactly as provided:`.
- Retry result: ten `group_scripts`, with scene 2 and scene 3 duplicated across multiple groups.
- DB cancellation:
  - status: `cancelled`
  - current_stage: `cancelled_invalid_script_second_expansion`
  - failure_code: `invalid_locked_script_second_expansion`

Missing pieces now fixed locally:

- Enforce requested group count after LLM grouping so a five-scene script does not become ten visual voiceover groups.
- Recognize the second-call locked-script marker `Use the locked script exactly as provided:`.
- Parse English `Scene N (time): dialogue | Subtitle: ...` retry prompts without speaking subtitle text.
- Stop repeating a locked script just because group count is larger than script scene count.
- Guard `plan_timeline_pro` against missing TTS/subtitle start timestamps to prevent another retry loop.

Local files changed:

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/group_clips.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py`
- `workers/video-worker/tests/test_firered_generate_script_locked.py`
- `workers/video-worker/tests/test_firered_group_clips_contract.py`

Local verification:

- `python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py -q`
- Result: `56 passed`.
- `python -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/group_clips.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_script.py`: passed.

## 2026-05-23 Fourth Runtime Correction: Stop After Render

After releasing commit `00bebc9`, a fresh formal API-created job was started:

- Job: `66bb23c7-da6d-4a2e-aa8f-2ca942bad92f`
- FireRed session: `16c97a57b1934fb499695a666905a792`
- Merchant/team: `e7c94a17-cf7d-4eb2-8178-13daa780551a`
- Member/user: `0b3351a6-778b-4e79-b5f1-6aa18fdb0020`

Formal-chain evidence before cancellation:

- `input_payload.input_assets` contained two deduplicated `talking_head` videos.
- Runtime material preparation added eight `merchant_material_library` videos from the project material pool.
- FireRed `load_media` loaded ten videos total.
- `split_shots` produced eighteen clips.
- `understand_clips`, `filter_clips`, `group_clips`, `generate_script`, `generate_voiceover`, `lip_sync`, and `render_video` ran.
- First `group_clips` output had exactly five groups.
- First `generate_script` output had exactly the five authored spoken lines.
- `lip_sync` produced four nonzero retalked videos:
  - `retalked_group_0001_clip_0004.mp4`
  - `retalked_group_0003_clip_0006.mp4`
  - `retalked_group_0003_clip_0007.mp4`
  - `retalked_group_0005_clip_0003.mp4`
- First `render_video` completed at `2026-05-23 20:20:56+08`:
  - path: `/srv/jingjing-video-worker/firered/.storyline/.server_cache/16c97a57b1934fb499695a666905a792/render_video_1779538653.0426793/output_86e76259_1779538653091.mp4`
  - size: `15683434` bytes
  - logged duration: `114.614` seconds

The job was still cancelled and must not be used as a deliverable:

- After `render_video` succeeded, the FireRed agent continued instead of returning the worker result.
- It called `read_node_history`, then started a second production cycle: `group_clips -> generate_script -> generate_voiceover -> ...`.
- The second `generate_script` still stayed at five authored lines, but the duplicate production cycle violated the no-repeat/no-double-upload contract.
- DB cancellation:
  - status: `cancelled`
  - current_stage: `cancelled_invalid_duplicate_second_cycle`
  - failure_code: `invalid_duplicate_second_cycle_after_render`

New local fix on `5.23-worker-fix`:

- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
  - detects a successful `render_video` completion event in worker runs.
  - stops the agent stream immediately after render, then extracts the latest `render_video` artifact for the worker response.
- `workers/video-worker/openstoryline/app/engine_adapters.py`
  - reinforces the worker prompt: after `render_video` completes, do not call `read_node_history` or any other production tool.

Verification:

- `python -m py_compile workers/video-worker/openstoryline/firered/agent_fastapi.py workers/video-worker/openstoryline/app/engine_adapters.py workers/video-worker/worker/app/processor.py`: passed.
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_openstoryline_engine_adapters.py -q`
- Result: `84 passed`.

Next valid verification must be a fresh job after this fourth fix is committed, merged to `main`, pushed, and released. Do not reuse `66bb23c7-da6d-4a2e-aa8f-2ca942bad92f` as a deliverable.

## 2026-05-23 Fifth Runtime Correction: Chinese Scene Groups And Montage Buckets

After releasing commit `df67f6a`, a fresh formal member-equivalent API job was started:

- Job: `0eb69ee9-23b4-40f4-a8ec-ef9494472740`
- FireRed session: `704d2d1bfcf04c5aa0d23ccedc90f02e`
- Creation path: real `POST /api/video-edit-jobs`, with no `inputAssetIds` in the request.
- API payload contained the two draft `talking_head` videos; the worker appended eight `merchant_material_library` videos during material preparation.

Formal-chain evidence before failure:

- `load_media`: ten videos.
- `split_shots`: eighteen clips.
- `understand_clips`: completed.
- `filter_clips`: selected all eighteen clips; this was not a node-failure fallback.
- `group_clips`: returned nine visual groups.
- `generate_script`: returned five authored spoken lines.
- `generate_voiceover`: produced five cloned voiceover wavs.

Root cause:

- The nine `group_clips` groups were not nine authored voiceover scenes.
- `group_0002` through `group_0006` were scene 2 factory subgroups.
- `group_0007` was scene 3 facilities quick montage.
- `group_0008` was scene 4 environment.
- `group_0009` was scene 5 closing.
- The worker needed to preserve those clips but coalesce them back into the locked five scene groups before script, voiceover, lip-sync, and timeline alignment.
- Because group coalescing did not recognize Chinese `场景N` summaries, `lip_sync` later looked for a cloned voiceover for `group_0009`, while only `group_0001` to `group_0005` voiceovers existed.

DB failure:

- status: `failed_manual`
- current_stage: `lip_sync_artifact_validation_failed`
- reason: `lip_sync enabled but no retalked talking-head segments were produced`

New local fix on `5.23-worker-fix`:

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/group_clips.py`
  - detects Chinese scene markers in the user request, including `场景N`, `镜头N`, and English `Scene N`.
  - detects Chinese scene numbers in LLM group summaries.
  - infers requested scene count from summaries if the user request is not enough.
  - coalesces excess visual groups into the locked authored scene count, preserving montage clips under the correct scene.
- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
  - rewrites the restored zhiluan1 factory script text from normalized scenes.
  - keeps `targetDurationSeconds` as frontend/audit display only.
  - writes `content_variants.script_text`.
  - makes `字幕` exactly equal to `口播`.
  - changes scene 5 to a generic member talking-head close and removes `园区门口` / `园区入口`.
  - does not emit `画面` / `镜头要求` / `素材关键词` lines in `script_text`.
  - clears `generatedVideoScript.scenes[].materialSlot` and `generatedVideoScript.scenes[].shootingGuide`.
  - leaves `production_scenes` material-query fields blank so OpenStoryline chooses shots from the prepared material pool instead of receiving app-authored素材要求.
- `app/scripts/fix-factory-member-video-tasks.mjs`
  - applies the same script normalization to future factory member task clones.

Verification:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `python -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/group_clips.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py`: passed.
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_firered_lip_sync_node.py -q`: `12 passed`.
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_openstoryline_engine_adapters.py -q`: `86 passed`.

Next valid verification must be a fresh job after this fifth fix is committed, merged to `main`, pushed to Gitee, and released through a normal server release. Do not reuse `0eb69ee9-23b4-40f4-a8ec-ef9494472740` as a deliverable.

## 2026-05-24 Sixth Script Structure Correction: CASE-003 Style Visual Descriptions

User correction:

- The previous script normalization was too bare.
- The desired structure is like `CASE-003 小院咖啡-无素材指定版`: numbered sections, time ranges, `场景`, `画面`, and `台词/字幕`.
- Do not add `画面花字`.
- Do not add `素材` lines or material keywords.
- Do keep concise visual descriptions based on the existing factory materials: factory space/height, park facilities, surrounding environment/traffic/logistics, and member opening/closing talking-head clips.
- These visual descriptions must be sent to the backend as structured `production_scenes[].visual`; the forbidden part is authored `素材` assignment / material keyword lists, not the visual description itself.

Missing from the previous script:

- `场景：...`
- `画面：...`
- CASE-003-style standalone scene number and time range lines.
- Structured visual descriptions in `generatedVideoScript.scenes[].camera` and `content_variants.production_scenes[].visual`.

New local fix on `5.23-worker-fix`:

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
  - writes CASE-003-style script text with scene number, time range, `场景`, `画面`, and `台词/字幕`.
  - keeps `台词/字幕` exactly equal to the spoken text for each scene.
  - keeps no `素材：`, no `素材关键词：`, and no `画面花字：` lines.
  - restores concise visual descriptions into `generatedVideoScript.scenes[].camera`.
  - stores the same visual descriptions in `content_variants.production_scenes[].visual`.
  - sends those visual descriptions to the backend through `production_scenes[].visual`.
- `app/scripts/fix-factory-member-video-tasks.mjs`
  - applies the same structure and visual-description policy for future factory member task clones.
- `app/src/server/api/video-job-payload.ts`
  - sends structured `production_scenes[].visual` into backend `sceneAssetQueries`.
  - when production scenes exist, does not fall back to reparsing `script_text` `画面` lines, avoiding duplicate query creation.
- `app/src/components/member/member-workspace.tsx`
  - removes `素材：${scene.materialSlot}` from the member video draft prompt while preserving `画面：${scene.camera}`.

Verification:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `node --test --experimental-strip-types src/server/api/video-job-payload.test.ts`: `25 passed`.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Next valid step:

- Commit and push only `5.23-worker-fix`.
- Deploy server release from `5.23-worker-fix` without merging or pushing `main`.
- Apply the zhiluan1 script patch from the released code path, then read back and show the script.

## 2026-05-24 Server Release And Script Readback

Release source:

- Branch: `5.23-worker-fix`
- Commit: `182165a5fa1e67d83e2fad74e3adb97ee5fb4595`
- Gitee remote branch confirmed at the same commit before release.
- `main` was not merged or pushed.

Server release:

- New release: `/srv/jingjing-domestic/releases/20260524011000-182165a`
- Current symlink: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260524011000-182165a`
- Server build:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`: passed
  - `corepack pnpm@10.20.0 build`: passed
- Restarted services:
  - `jingjing-domestic-app.service`: active
  - `jingjing-content-generation-worker.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active
  - `nginx.service`: active after reload

Health checks:

- `curl -fsS http://127.0.0.1:3000/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- `curl -fsS http://127.0.0.1:8000/ready`: ready, `engine_adapter=fire_red`.
- `curl -fsS http://127.0.0.1:7860/api/ready`: ready, `render_video_available=true`.

Script patch applied from released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

Readback result from DB:

- `content_variants.script_text` contains CASE-003-style blocks with scene number, time range, `场景`, `画面`, and `台词/字幕`.
- `content_variants.production_scenes`: 5 scenes.
- `production_scenes[].visual`: populated for all 5 scenes and intended to become backend `sceneAssetQueries`.
- `production_scenes[].shotRequirement`: `""`.
- `production_scenes[].materials`: `[]`.
- `production_scenes[].fallbackShot`: `""`.
- Scene 1 and scene 5 are `talking_head` / `requiresUserUpload=true`.
- Scenes 2, 3, and 4 are `merchant_broll` / `requiresUserUpload=false`.
- `daily_content_tasks.video_task.generatedVideoScript.targetDurationSeconds`: `52`, retained for frontend display.
- `daily_content_tasks.video_task.recommendedProductionConfig.render` has no `maxDurationSeconds`.
- No new video job was created during this release/readback step.

Server command issue recorded:

- Added project error-log entry `PE-20260524-001` in `docs/codex-runtime-errors.md`.
- Scope: Windows PowerShell SSH server command quoting, BOM/CRLF here-string, Node v24 `--env-file`, and root-only `/srv/jingjing-domestic/shared/env/app.env` pitfalls.

## 2026-05-24 Seventh Correction: Voiceover Density And Scene Coverage

User correction after reviewing the completed `d53fd010-9d7b-4005-a1d1-408ecda0421d` video:

- The previous script still had too little narration for the actual render.
- The completed video duration was `56.71s`, but the available voiceover groups totaled only about `38.09s`.
- Several visual shots had no matching voiceover, and some voiceover did not match the material being shown.
- The fix must only change the script. Do not manually choose OpenStoryline shots, do not add material filenames, asset ids, `素材：`, or `素材关键词：`.
- The script must be based on the existing material pool: member talking-head videos, factory space/height, fire and power facilities, floor/elevator access, management service station, dorm/apartment exterior, living passage, and e-bike parking.
- `台词/字幕` must exactly match the voiceover text.
- Display duration may remain for the frontend, but backend render config must not receive a hard duration cap.

New local fix on branch `5.23-worker-fix`:

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
  - adds one canonical `factoryScriptSpec` used for title, CTA, six scenes, visual descriptions, time ranges, display duration, and voiceover text.
  - expands the restored zhiluan1 script from 5 scenes to 6 scenes:
    1. member opening talking-head
    2. factory space and height
    3. factory infrastructure
    4. upper-floor supplemental space and floor circulation
    5. park management and public facilities
    6. dorm/apartment living support and member closing talking-head
  - increases total planned voiceover copy to better cover a roughly 60-second video.
  - updates `content_variants.title`, `content_variants.cta_text`, `script_text`, `daily_content_tasks.video_task.generatedVideoScript`, and `content_variants.production_scenes`.
  - keeps `production_scenes[].visual` populated and keeps `shotRequirement`, `materials`, and `fallbackShot` blank.
- `app/scripts/fix-factory-member-video-tasks.mjs`
  - applies the same canonical six-scene script for future factory member clones.
  - strips `recommendedProductionConfig.render.maxDurationSeconds` and `max_duration_seconds` when cloning, so source-task duration estimates cannot become backend render caps.

Verification:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `node --test --experimental-strip-types src/server/api/video-job-payload.test.ts`: `26 passed`.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Current required next step:

- Commit and push only branch `5.23-worker-fix`.
- Deploy a normal server release from `5.23-worker-fix`.
- Apply the zhiluan1 patch from the released code path.
- Read back the script and structured production scenes before creating any new video job.

## 2026-05-24 Seventh Correction Release And DB Readback

Release source:

- Branch: `5.23-worker-fix`
- Code commit released: `54eae8b506b2106c72d782e2c06ed166c94e1600`
- Gitee remote `5.23-worker-fix` confirmed at `54eae8b506b2106c72d782e2c06ed166c94e1600`.
- Gitee remote `main` remained `afd360803c4c0cc850e8b2322e3d165eec00bddc`; `main` was not pushed or merged.

Server release:

- Previous release: `/srv/jingjing-domestic/releases/20260524014000-0622792`
- New release: `/srv/jingjing-domestic/releases/20260524023709-54eae8b`
- Current symlink after release:
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260524023709-54eae8b`
- Server build:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`: passed
  - `corepack pnpm@10.20.0 build`: passed
- Restarted/reloaded services:
  - `jingjing-domestic-app.service`: active
  - `jingjing-content-generation-worker.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active
  - `nginx.service`: active

Health checks:

- `curl -fsS http://127.0.0.1:3000/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- `curl -fsS http://127.0.0.1:8000/ready`: ready, `engine_adapter=fire_red`.
- `curl -fsS http://127.0.0.1:7860/api/ready`: ready, `render_video_available=true`.

Script patch applied from released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

Independent DB readback confirmed:

- `content_variants.title`: `找厂房，别只看租金`
- `content_variants.cta_text`: `你要找工业园区厂房，建议实地来看一圈。`
- `content_variants.production_scenes`: 6 scenes.
- `daily_content_tasks.video_task.generatedVideoScript.scenes`: 6 scenes.
- `daily_content_tasks.video_task.generatedVideoScript.targetDurationSeconds`: `64`, retained for frontend display.
- `daily_content_tasks.video_task.recommendedProductionConfig.render`: `{ aspectRatio: "9:16", includeOriginalAudio: false }`
- `render.maxDurationSeconds` / `render.max_duration_seconds`: absent.
- `production_scenes[].voiceover === production_scenes[].subtitle`: true for all scenes.
- `production_scenes[].materials`: `[]` for all scenes.
- `production_scenes[].shotRequirement` and `fallbackShot`: blank for all scenes.
- Scene 1 and scene 6: `talking_head`, `requiresUserUpload=true`.
- Scene 2 to scene 5: `merchant_broll`, `requiresUserUpload=false`.
- No new video job was created during this release/readback step.
