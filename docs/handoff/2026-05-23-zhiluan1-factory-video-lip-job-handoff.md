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

## Fourth Correction: Stop After Render

After commit `00bebc9` was released, a fresh formal API-created job was started:

- Job: `66bb23c7-da6d-4a2e-aa8f-2ca942bad92f`
- FireRed session: `16c97a57b1934fb499695a666905a792`
- Path: real worker chain, not a direct DB/manual render fallback.

Evidence that this was the formal OpenStoryline material path:

- The job input payload had two deduplicated member `talking_head` assets.
- Runtime material preparation added eight `merchant_material_library` project videos.
- FireRed loaded ten videos, split them into eighteen clips, then ran `understand_clips`, `filter_clips`, and `group_clips`.
- First `group_clips`: five groups.
- First `generate_script`: the five authored spoken lines only.
- `lip_sync`: four nonzero retalked talking-head clips.
- First `render_video`: completed successfully with duration `114.614` seconds.

Why the job is still invalid:

- After `render_video` completed, the FireRed agent did not return the worker result.
- It called `read_node_history` and started a second production cycle: `group_clips -> generate_script -> generate_voiceover -> ...`.
- This explains the observed duplicate generation/upload behavior and violates the no-repeat contract.
- The job was stopped and marked:
  - status: `cancelled`
  - current_stage: `cancelled_invalid_duplicate_second_cycle`
  - failure_code: `invalid_duplicate_second_cycle_after_render`

New local fix on branch `5.23-worker-fix`:

- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
  - stops the worker agent stream immediately after a successful `render_video` completion event.
  - then extracts the latest render artifact and returns it to the worker.
- `workers/video-worker/openstoryline/app/engine_adapters.py`
  - tells the production agent to stop after `render_video`, and not call `read_node_history` or any other production node.

Verification:

- `python -m py_compile workers/video-worker/openstoryline/firered/agent_fastapi.py workers/video-worker/openstoryline/app/engine_adapters.py workers/video-worker/worker/app/processor.py`: passed.
- Worker/OpenStoryline tests with local `PYTHONPATH`: `84 passed`.

Next valid step:

- Commit this fourth fix on `5.23-worker-fix`.
- Merge it to `main`.
- Push to Gitee.
- Deploy a normal release to the server group.
- Start a new fresh job; only a new post-release job can be accepted as the final video deliverable.

## Fifth Correction: Chinese Scene Group Coalescing And Script Text

After commit `df67f6a` was released, another fresh formal API-created job was created from the member-side equivalent path:

- Job: `0eb69ee9-23b4-40f4-a8ec-ef9494472740`
- FireRed session: `704d2d1bfcf04c5aa0d23ccedc90f02e`
- API payload did not pass `inputAssetIds`; it used the draft assets and normal worker material preparation.
- Worker material pool contained two member `talking_head` videos plus eight `merchant_material_library` videos.
- FireRed loaded ten videos, split eighteen clips, completed `understand_clips`, and `filter_clips` selected all eighteen clips without node-failure fallback.

Why the job is still invalid:

- `group_clips` returned nine visual groups:
  - `group_0001`: scene 1 opening.
  - `group_0002` to `group_0006`: scene 2 factory overview/detail subgroups.
  - `group_0007`: scene 3 facilities quick montage.
  - `group_0008`: scene 4 environment.
  - `group_0009`: scene 5 closing.
- These extra groups are visual subgroups/montage buckets, not additional authored voiceover scenes.
- `generate_script` produced only the correct five authored spoken lines and therefore only five cloned voiceover files.
- `lip_sync` then looked for `group_0009` voiceover and failed with `group_0009 has no cloned voiceover`.
- Final DB validation rejected the job as `failed_manual`, current stage `lip_sync_artifact_validation_failed`, because no valid retalked talking-head segments were produced.

New local fix on branch `5.23-worker-fix`:

- `group_clips.py`
  - detects Chinese scene markers such as `场景1`, `镜头1`, and English `Scene 1` from the locked user request.
  - infers the requested scene count from LLM group summaries when the user request is not enough.
  - merges excess LLM visual groups back into the locked authored scene count, preserving montage clips under the correct scene.
- `patch-zhiluan1-restored-video-script-contract.mjs`
  - normalizes the current zhiluan1 restored factory script.
  - keeps `targetDurationSeconds` only for frontend display/audit, not as backend render duration cap.
  - writes `content_variants.script_text` from the normalized scenes.
  - makes every scene `字幕` exactly equal to that scene `口播`.
  - changes scene 5 to generic member closing wording and removes `园区门口` / `园区入口` labels.
  - does not emit `画面` / `镜头要求` / `素材关键词` lines in `script_text`.
  - clears `generatedVideoScript.scenes[].materialSlot` and `generatedVideoScript.scenes[].shootingGuide`.
  - leaves `production_scenes` material-query fields blank so OpenStoryline chooses shots from the prepared material pool instead of receiving app-authored素材要求.
- `fix-factory-member-video-tasks.mjs`
  - applies the same normalization for future factory member task clones.

Verification:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `python -m py_compile workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/group_clips.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py`: passed.
- Focused worker tests: `12 passed`.
- Extended worker/OpenStoryline contract tests: `86 passed`.

Next valid step:

- Commit this fifth fix on `5.23-worker-fix`.
- Push `5.23-worker-fix`.
- Merge to `main`, push `main` to Gitee, and deploy a normal release.
- Apply the zhiluan1 script patch only from the released code path.
- Create a new fresh member-equivalent job without `inputAssetIds`.
- Treat only a post-release successful MP4 as the deliverable.

## Sixth Correction: Script Structure And Visual Description

User clarified the intended script shape:

- Use `CASE-003 小院咖啡-无素材指定版` as the structure reference.
- Keep numbered scenes, time ranges, `场景`, `画面`, and `台词/字幕`.
- Do not include `画面花字`.
- Do not include `素材` lines or material keywords.
- Keep visual descriptions based on the existing factory material pool, and send them to the backend as structured scene visual descriptions.
- Do not turn those descriptions into authored `素材` assignments, material keyword lists, or specific material filenames.

The previous fifth correction was missing the structure layer:

- no standalone scene numbers/time ranges in CASE-003 style.
- no `场景：...` lines.
- no `画面：...` lines.
- `generatedVideoScript.scenes[].camera` and `production_scenes[].visual` were not carrying the useful visual description.

New local fix on branch `5.23-worker-fix`:

- `patch-zhiluan1-restored-video-script-contract.mjs`
  - writes the restored zhiluan1 script as CASE-003-style text.
  - uses `台词/字幕` as the single spoken/subtitle field.
  - keeps no `素材：`, no `素材关键词：`, and no `画面花字：` lines.
  - restores concise `画面` descriptions for the five scenes.
  - writes those descriptions into `generatedVideoScript.scenes[].camera` and `production_scenes[].visual`.
- `fix-factory-member-video-tasks.mjs`
  - applies the same policy to future factory member clones.
- `video-job-payload.ts`
  - sends `production_scenes[].visual` to backend `sceneAssetQueries`.
  - avoids reparsing `script_text` `画面` lines when production scenes already exist, so the backend receives one structured visual description per scene instead of duplicate extracted lines.
- `member-workspace.tsx`
  - keeps `画面` in the member draft prompt and removes `素材`.

Verification:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `node --test --experimental-strip-types src/server/api/video-job-payload.test.ts`: `25 passed`.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Current required release rule from user:

- Commit and push only branch `5.23-worker-fix`.
- Do not push or merge `main`.
- Deploy the server release from `5.23-worker-fix`.
- Apply the script patch from the released code path.
- Then read back and show the script before starting any new video job.

## 2026-05-24 Release / Script Patch Completed

Completed after the sixth correction:

- Confirmed local branch: `5.23-worker-fix`.
- Confirmed Gitee `origin/5.23-worker-fix`: `182165a5fa1e67d83e2fad74e3adb97ee5fb4595`.
- Did not merge or push `main`.
- Deployed server release from `5.23-worker-fix`:
  - `/srv/jingjing-domestic/releases/20260524011000-182165a`
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260524011000-182165a`
- Server build passed:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`
  - `corepack pnpm@10.20.0 build`
- Services after restart/reload:
  - `jingjing-domestic-app.service`: active
  - `jingjing-content-generation-worker.service`: active
  - `jingjing-firered-openstoryline.service`: active
  - `jingjing-openstoryline-engine.service`: active
  - `jingjing-video-worker.service`: active
  - `nginx.service`: active
- Health checks passed:
  - `/api/health`: ok
  - OpenStoryline `/ready`: ready
  - FireRed `/api/ready`: ready

Applied zhiluan1 script patch from released path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

DB readback confirmed:

- `script_text` now uses CASE-003-style structure:
  - scene number
  - time range
  - `场景：...`
  - `画面：...`
  - `台词/字幕：...`
- `production_scenes[].visual` is populated and must be sent to backend as `sceneAssetQueries`.
- No `素材：...`, no `素材关键词：...`, no `画面花字：...`.
- `production_scenes[].materials` is `[]`, and `shotRequirement` / `fallbackShot` are blank.
- Scene 1 and 5 require member talking-head uploads.
- Scene 2, 3, and 4 use merchant B-roll material selection.
- `targetDurationSeconds=52` remains for frontend display.
- `recommendedProductionConfig.render` has no `maxDurationSeconds`, so the backend render cap is not constrained by the displayed estimate.

Important command lesson:

- Recorded as `PE-20260524-001` in `docs/codex-runtime-errors.md`.
- When running server commands from Windows PowerShell, avoid complex nested SSH quoting and PowerShell here-strings with BOM/CRLF.
- For released Node maintenance scripts that need root-only env files, use:

```bash
sudo node -- scripts/<script>.mjs --env-file /srv/jingjing-domestic/shared/env/app.env
```

No new video job has been started after this script correction.

## 2026-05-24 Seventh Correction Pending Release

Why this was reopened:

- The completed job `d53fd010-9d7b-4005-a1d1-408ecda0421d` produced a `56.71s` final video, but the script voiceover groups totaled only about `38.09s`.
- This caused too many visuals without matching narration, and some narration did not line up well with the shown factory material.
- User asked to adjust only the script, based on existing materials, with more complete coverage and matching `台词/字幕`.

Local change now prepared on `5.23-worker-fix`:

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
  - introduces canonical `factoryScriptSpec`.
  - changes the zhiluan1 script to 6 CASE-003-style scenes covering opening talking-head, main factory space, infrastructure, upper-floor supplemental space, management/public facilities, and living support/closing talking-head.
  - keeps `台词/字幕` exactly equal to voiceover.
  - keeps `production_scenes[].visual` populated for backend scene queries.
  - keeps no `素材：`, no `素材关键词：`, no `画面花字：`, no material filenames, and no asset ids.
- `app/scripts/fix-factory-member-video-tasks.mjs`
  - applies the same 6-scene script to future factory member clones.
  - strips render max-duration keys when cloning recommended production config.

Verification completed locally:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `node --test --experimental-strip-types src/server/api/video-job-payload.test.ts`: `26 passed`.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Next steps:

- Commit and push only `5.23-worker-fix`.
- Deploy normal server release from `5.23-worker-fix`.
- Apply `scripts/patch-zhiluan1-restored-video-script-contract.mjs --apply` from the released code path.
- Read back and show the script before any new video job is created.

## 2026-05-24 Seventh Correction Released

Completed:

- Code commit released: `54eae8b506b2106c72d782e2c06ed166c94e1600`
- Branch pushed: `origin/5.23-worker-fix`
- `main` was not merged or pushed.
- Server release:
  - `/srv/jingjing-domestic/releases/20260524023709-54eae8b`
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260524023709-54eae8b`
- Server build passed:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`
  - `corepack pnpm@10.20.0 build`
- Services are active:
  - `nginx.service`
  - `jingjing-domestic-app.service`
  - `jingjing-content-generation-worker.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`
- Health checks passed:
  - `/api/health`: ok
  - OpenStoryline `/ready`: ready
  - FireRed `/api/ready`: ready

Applied zhiluan1 patch from released path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

DB readback confirmed:

- `title`: `找厂房，别只看租金`
- `production_scenes`: 6 scenes.
- `generatedVideoScript.scenes`: 6 scenes.
- `targetDurationSeconds=64` remains for frontend display.
- `recommendedProductionConfig.render` has only `aspectRatio` and `includeOriginalAudio`; no `maxDurationSeconds`.
- `voiceover === subtitle` for all production scenes.
- `materials=[]`, `shotRequirement=""`, and `fallbackShot=""` for all production scenes.
- Scene 1 and 6 require member talking-head uploads.
- Scene 2 to 5 use merchant B-roll material selection.
- No new video job was created in this step.

Next valid user action:

- The user can continue in the frontend with the updated script.
- If the user wants a new render after reviewing the script, create a fresh video job; do not reuse the previous completed job as the new deliverable.
