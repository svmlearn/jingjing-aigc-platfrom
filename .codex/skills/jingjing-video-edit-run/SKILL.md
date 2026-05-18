---
name: jingjing-video-edit-run
description: 'Run Jingjing content-platform video-edit jobs end to end. Use when the user asks to run, rerun, verify, or package a video editing test case or merchant video job using the remote video worker, cloud Supabase, COS materials/results, voice cloning, FireRed/OpenStoryline, or local artifact delivery under D:\Desktop\测试素材. Enforces the project no-fallback rule: create a fresh job for reruns, never reuse failed cases, never use mock/skeleton/local fake/all-clips fallback output, and record real failures as failures.'
---

# Jingjing Video Edit Run

Use this skill to execute a real Jingjing video-editing run from a documented test case through cloud Supabase, the server worker, COS upload, verification, and a local artifact package.

## Hard Rules

- Use cloud Supabase. Prefer the linked project from `app/` and discover CLI syntax with `supabase --help` before using unfamiliar commands.
- Also use the Supabase skill for Supabase-specific work.
- Reruns must create a new `video_edit_jobs` row. Do not continue an old failed job and do not present an old failed result as the new result.
- Do not use fallback generation: no mock output, no skeleton output, no local fake render, no "filter_clips failed, so use all clips" path, no silent replacement with previous artifacts.
- If material matching, model filtering, voice cloning, subtitle generation, render, or upload fails, mark the job failed or cancelled with the real reason.
- Do not hardcode secrets in docs, scripts, or the skill. Use credentials supplied by the user or existing environment files.
- The local artifact package is only a copy of real server/COS outputs. It is not a render fallback.

## Inputs To Confirm

Read the named test case or task doc first, then confirm these facts from the doc, user request, database, or COS:

- Case id and title, such as `CASE-006`.
- Merchant, store, workspace, and target account context.
- User-uploaded videos and their COS keys.
- COS material library assets the worker should select from.
- Voice clone requirement and reference-audio COS key.
- Target duration, aspect ratio, and script completeness level.
- Server host/user/path, normally provided by the user; do not store passwords.

For CASE test runs, keep the source document and progress record linked in the final answer.

## Run Workflow

1. Inspect repository context.
   - Read `AGENTS.md` if not already loaded.
   - Read the test case, relevant worker docs, and the latest matching `docs/progress/` notes.
   - Check dirty files before edits; do not revert unrelated changes.

2. Prepare cloud Supabase access.
   - Work from `app/` when using the project Supabase CLI setup.
   - Run `supabase --version` and relevant `supabase <group> --help` commands before depending on syntax.
   - Verify the linked cloud project before writing data.
   - Use SQL files for nontrivial inserts/updates so the exact payload is reviewable.

3. Create a fresh job.
   - Cancel or ignore stale jobs only with an explicit reason.
   - Insert a new `video_edit_jobs` row for the current run.
   - Include the real merchant/store context, script/test payload, uploaded media COS keys, voice profile/reference audio, and required engine settings.
   - Record the new job id immediately.

4. Run the server worker.
   - Connect with user-provided credentials, then `cd /srv/jingjing-video-worker` or the supplied worker path.
   - Start by checking `docker compose ps`.
   - Inspect worker logs and health before assuming the job was claimed.
   - If restarting services is necessary, explain why and preserve the no-fallback behavior.

5. Monitor stages.
   Track the job through these stages or their current-code equivalents:
   - download inputs
   - split_shots
   - understand_clips
   - filter_clips
   - group_clips
   - generate_script
   - generate_voiceover
   - select_bgm
   - render_video
   - upload
   - completed

6. Verify no-fallback success.
   Treat the run as successful only when all applicable checks pass:
   - Supabase job status is `succeeded` and final stage is completed.
   - FireRed/OpenStoryline session id is present.
   - `filter_clips` completed normally; there is no all-clips fallback log.
   - Voice clone used the requested clone provider, such as `pixelle_clone`, with non-empty generated segments and measurable durations.
   - Render produced a real final video in the worker cache/output path.
   - Upload produced COS keys for final video, cover, and subtitles.
   - COS asset rows reference the new job and have nonzero byte sizes.

7. Package local artifacts when requested or expected.
   Place a copy of real outputs under:

   ```text
   D:\Desktop\测试素材\cos素材库入库包_YYYYMMDD\metadata\case_<NNN>_artifacts
   ```

   Use this structure when available:

   ```text
   case_<NNN>_artifacts/
     cos/
       final.mp4
       cover.jpg
       subtitles.srt
       C.mp4
     cache/
       render_output.mp4
     voiceover/
       voiceover_0001.wav
       ...
     evidence/
       job.json
       assets.json
       logs.json
     manifest_local.json
     case_<NNN>_real_result_summary.md
   ```

   `C.mp4` is a compatibility copy only when the existing local material-package format expects it. Its hash should match the real final video when used.

8. Write evidence docs.
   - Write a factual progress note in `docs/progress/YYYY-MM-DD-case-<NNN>-<short-topic>.md`.
   - Include scope, cancelled/failed attempts, job id, Supabase status, server/runtime changes, COS keys, voice clone evidence, render evidence, local package path, and push/merge status.
   - If the task remains unfinished or awaits another agent, also write a handoff under `docs/handoff/`.

## Failure Handling

When a stage fails:

- Stop treating the run as a success.
- Record the failing stage, logs, exception, job id, and whether the job was marked `failed` or `cancelled`.
- Do not switch to a fallback output.
- For a user-requested rerun, create a fresh job after addressing the cause.

## Final Response Checklist

Report only facts that were verified:

- New job id and final status.
- Server path and whether worker/services were restarted.
- COS keys for final, cover, and subtitles.
- Voice clone provider and segment count/duration evidence.
- Local artifact package path.
- Progress or handoff document path.
- Any tests or checks that could not be completed.
