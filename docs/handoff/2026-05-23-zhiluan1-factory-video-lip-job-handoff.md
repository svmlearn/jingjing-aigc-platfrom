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

## Final Release And Fresh Job Verification

- Fix commit: `a393d4d39d1df9a4d4fe8f2683e946ebcaae5a2c`
- Commit message: `fix: preserve talking-head production scenes for lip jobs`
- Pushed branches:
  - `5.23-worker-fix`
  - `main`
- Server release:
  - `/srv/jingjing-domestic/releases/20260523165418-a393d4d`
  - `/srv/jingjing-domestic/current` points to that release.
- Contract patch was applied after release, not as a direct hot edit to the old release.

Post-patch data readback:

- `team_calendar_source.source = manual_factory_script`
- audit status: `manual_restored_script_not_dify_workflow_output`
- missing normal Dify fields count: `11`
- `targetDurationSeconds = 52` remains in the script for frontend display.
- `recommendedProductionConfig.render` keys: `aspectRatio`, `includeOriginalAudio`
- `recommendedProductionConfig.render.maxDurationSeconds` and `max_duration_seconds` are absent.
- `production_scenes` count: `5`
- talking-head scenes: `[1, 5]`
- scene durations: `[5, 12, 14, 13, 8]`
- time ranges: `00:00-00:05`, `00:05-00:17`, `00:17-00:31`, `00:31-00:44`, `00:44-00:52`

Fresh valid job:

- `video_edit_jobs.id = 9c5e17d2-5351-4e2d-95de-72ba575aa0e2`
- Worker claimed it at `2026-05-23 17:09:31+08`.
- Worker completed it at `2026-05-23 17:35:50+08`.
- Final DB status: `succeeded`
- Current stage: `completed`
- Failure code/reason: `null`

Fresh job payload facts:

- `materialContext.userTalkingHeadAssetIds` contained all three draft uploaded videos:
  - `16087728-c740-4e68-afc6-a76e4e7ede5b`
  - `5c2b3064-22ac-4b59-999e-553cfa9f68d6`
  - `09d2fe6c-8105-4713-854e-4fbd846bc2f7`
- All three `input_assets` were classified as:
  - `role = talking_head`
  - `scene_type = talking_head`
  - `storage_provider = aliyun_oss`
- `render` keys were only `aspectRatio` and `includeOriginalAudio`; no render duration cap was sent.
- There was no direct lip URL in `input_payload.input_assets`; the payload passes OSS keys. FireRed/VideoRetalk uses runtime upload/signing during the lip-sync step, and those transient URLs are not persisted in the job payload.

FireRed/OpenStoryline evidence:

- Session/output id: `3c0a416dad8c4898afdeb20b3059cc14`
- `lip_sync` artifact:
  - `/srv/jingjing-video-worker/firered/outputs/3c0a416dad8c4898afdeb20b3059cc14/lip_sync/lip_sync_1779528516.1624327.json`
- `lip_sync` JSON had:
  - provider: `aliyun_videoretalk`
  - retalked segment count: `3`
  - timeline lip-sync track count: `3`
  - URL fields persisted in JSON: `0`
  - error-like strings: `0`
- Completed lip-sync segments:
  - `group_0001/clip_0003`
  - `group_0010/clip_0004`
  - `group_0010/clip_0006`
- Retalked output files exist and are nonzero:
  - `retalked_group_0001_clip_0003.mp4`: `907894` bytes
  - `retalked_group_0010_clip_0004.mp4`: `573436` bytes
  - `retalked_group_0010_clip_0006.mp4`: `374303` bytes
- Render completed at `2026-05-23 17:35:19+08`.
- Render cache file:
  - `/srv/jingjing-video-worker/firered/.storyline/.server_cache/3c0a416dad8c4898afdeb20b3059cc14/render_video_1779528731.1353347/output_9d53ec61_1779528731184.mp4`
  - size: `14285099` bytes
  - logged duration: `106.069` seconds
- Since `targetDurationSeconds` was `52` but the rendered video duration was `106.069` seconds, the target duration was not used as a backend render cap.

Uploaded outputs:

- Final video:
  - asset id: `5a727b07-37c3-451c-806a-2e2bb95db260`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/final.mp4`
  - size: `14285099` bytes
  - OSS headObject status: `200`
- Cover:
  - asset id: `ad7d3f13-9944-404f-bcd1-ac2a4a618eed`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/cover.jpg`
  - size: `9262` bytes
  - OSS headObject status: `200`
- Subtitles:
  - asset id: `14e999d2-c325-4499-b19a-430c185a2c12`
  - OSS key: `video-results/e7c94a17-cf7d-4eb2-8178-13daa780551a/9c5e17d2-5351-4e2d-95de-72ba575aa0e2/subtitles.srt`
  - size: `3191` bytes
  - OSS headObject status: `200`

One operational note: the local path reported under `result_payload.local_outputs` did not exist after completion when checked, but the FireRed render cache file, uploaded OSS objects, and `asset_objects` rows all existed and matched sizes/ETags.

## Current Working Tree

- Local worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`
- Local branch at the time of final verification: `main`
- Fix branch `5.23-worker-fix` and `main` both include commit `a393d4d39d1df9a4d4fe8f2683e946ebcaae5a2c`.
- Push/merge/release: completed for the code fix.

## Later Correction: Content Was Not Acceptable

After reviewing the rendered result and the FireRed `generate_script` artifact, job `9c5e17d2-5351-4e2d-95de-72ba575aa0e2` should not be used as the final deliverable even though the formal worker chain completed and lip-sync ran.

Confirmed issues:

- The locked script parser treated `字幕：...` as a second voiceover/dialogue line when a scene already had `口播：...`, which doubled the spoken script content.
- Numbered member scenes were expanded to match FireRed group count, which can split an authored member script into extra spoken groups.
- The draft contains duplicate uploaded video asset rows with matching OSS ETags; the app payload builder did not remove exact duplicate videos before sending `input_assets` to the worker.

Local branch `5.23-worker-fix` now includes an additional fix:

- Spoken script extraction prefers `台词/字幕` / `台词` / `旁白` / `口播`; standalone `字幕` is fallback only.
- Numbered locked-script scenes are kept one-to-one with the authored scenes instead of expanded to arbitrary group count.
- Video input assets are deduplicated by content ETag before entering the OpenStoryline material pool.

Verification before next release:

- Python worker tests: `42 passed`.
- Node app contract tests: `25 passed`.
- App typecheck: passed.

Next valid verification must create a fresh `video_edit_jobs` row after this second fix is released. Do not reuse job `9c5e17d2-5351-4e2d-95de-72ba575aa0e2` as content success evidence.

## Second Correction: Real Scene Heading Format

Commit `bc5cfb8` was released and a new formal API job was created:

- Job: `ba6ba828-9bac-45a5-9905-6cf88f86a10f`
- Creation path: `POST /api/video-edit-jobs`
- The API request passed five historical draft video asset ids; the server payload correctly deduplicated them to two input assets.

That job was stopped before completion because FireRed still reported:

- `Using locked custom script for 9 group(s)`

The issue was not subtitle duplication anymore. The remaining parser gap was the live script heading format:

- real script: `场景1（0-5秒）`
- first fix covered: `1` + `00:00-00:05`

New local fix on `5.23-worker-fix`:

- `node_interceptors.py` now recognizes `场景N（...）` sections as structured authored scenes.
- The live five-scene script should now produce five locked `group_scripts`, not nine.
- Worker tests now include the exact member script heading pattern; result: `43 passed`.

Next valid verification must be a fresh job after this follow-up commit is released. Job `ba6ba828-9bac-45a5-9905-6cf88f86a10f` is cancelled and must not be treated as a deliverable.

## Third Correction: Second Generate-Script Expansion

After releasing commit `3a8b66d`, a fresh API-created job was started:

- `video_edit_jobs.id = a43eba52-91ad-4b79-bbec-0a133224585c`
- Creation path: real Next API `POST /api/video-edit-jobs`, not direct DB insert.
- Input request intentionally included five historical draft video asset ids; the server payload deduplicated them to two `talking_head` input assets.
- FireRed `load_media` loaded ten videos:
  - two deduplicated member `talking_head` inputs.
  - eight `merchant_material_library` videos selected by worker material matching.
- FireRed then ran real nodes: `load_media`, `split_shots`, `understand_clips`, `filter_clips`, `group_clips`, `generate_script`, `generate_voiceover`, `select_bgm`, transition/text nodes.

This proves the run was on the formal worker/OpenStoryline chain and not a manually assembled fallback. However, the job is still invalid as a deliverable.

Why it was cancelled:

- The first `generate_script` artifact had the correct five authored spoken lines.
- `group_clips` still returned ten visual groups even though the user request asked for five script scenes.
- `plan_timeline_pro` then failed with `tts_start_timestamp = None`.
- OpenStoryline retried `generate_script` with `Use the locked script exactly as provided:`.
- The retry expanded the locked script to ten groups and duplicated scene 2 / scene 3 copy.
- Job `a43eba52-91ad-4b79-bbec-0a133224585c` was cancelled as `invalid_locked_script_second_expansion`.

New local fix on `5.23-worker-fix`:

- `group_clips.py` now coalesces excess LLM groups back to an explicitly requested scene/group count, using `Scene N` summaries when present and a deterministic consecutive merge fallback otherwise.
- `generate_script.py` now recognizes `Use the locked script exactly as provided:` and parses English `Scene N (time): dialogue | Subtitle: ...` lines without repeating the locked script to match group count.
- `plan_timeline_pro.py` guards missing subtitle/TTS start timestamps so a `None + duration` error does not force another script-generation retry.
- Added `test_firered_group_clips_contract.py`.

Verification:

- `python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_generate_script_locked.py workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py -q`
- Result: `56 passed`.
- `python -m py_compile` for `group_clips.py`, `generate_script.py`, and `plan_timeline_pro.py`: passed.

Next valid verification must be another fresh job after this third fix is committed, merged to `main`, pushed, and released. Do not reuse `a43eba52-91ad-4b79-bbec-0a133224585c` as a deliverable.
