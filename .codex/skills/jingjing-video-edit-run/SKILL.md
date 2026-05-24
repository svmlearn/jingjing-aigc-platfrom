---
name: jingjing-video-edit-run
description: "Run, rerun, monitor, verify, package, or release Jingjing content-platform video-edit jobs using the remote video worker, deployed database state, Aliyun OSS materials/results, voice cloning, FireRed/OpenStoryline, and local artifact delivery under D:\\Desktop\\测试素材. Current production default is systemd services plus aliyun_oss storage; Tencent COS and cloud Supabase wording are legacy compatibility only. Use for a known Jingjing video-edit job or documented video-edit case, not for unrelated generic server tasks. Enforces the no-fallback rule: create a fresh job for reruns, never reuse failed cases, never use mock/skeleton/local fake/all-clips fallback output, and record real failures as failures."
---

# Jingjing Video Edit Run

Use this skill for real Jingjing video-edit jobs: create/run/rerun a job, monitor a running job, verify the real outcome, package real outputs, or release a code/data patch that affects video-worker material retrieval.

Current production path:

```text
video_edit_jobs database
-> jingjing-video-worker.service
-> jingjing-openstoryline-engine.service
-> jingjing-firered-openstoryline.service
-> Aliyun OSS outputs
-> video_edit_jobs / asset_objects result writeback
```

Current production material-library truth source:

```text
source_items + asset_objects
```

Do not assume `merchant_media_assets` / `merchant_media_clips`; those names are legacy compatibility and may be absent in production.

## Hard Rules

- Do not use fallback generation: no mock output, no skeleton output, no local fake render, no "filter_clips failed, so use all clips" path, and no silent replacement with previous artifacts.
- For reruns, create a fresh `video_edit_jobs` row. Do not continue an old failed job and do not present an old failed result as the new result.
- If material matching, filtering, voice cloning, subtitle/timeline generation, lip sync, render, upload, or asset persistence fails, record the real failure.
- Do not hardcode secrets in docs, scripts, commands, or the skill. Read existing env files only to inspect key names or use already-configured services.
- The local artifact package is only a copy of real server/OSS outputs. It is not a render fallback.
- Do not infer success from logs alone. Success requires DB status/result fields plus real output files and object storage/asset evidence.
- Do not hot-update production data from a random local checkout. For data patches, commit locally, push to Gitee, deploy a normal server release, run dry-run from `/srv/jingjing-domestic/current`, then apply from that released code path.

## Inputs To Confirm

For a run or rerun, confirm:

- Case id and title, such as `CASE-006`, if this is a case run.
- Merchant, store, workspace, member, and target account context.
- User-uploaded videos and their OSS `storage_provider`, `bucket_name`, and `storage_key`.
- Material library assets the worker should select from.
- Voice clone requirement and reference-audio OSS key.
- Target duration, aspect ratio, desired outputs, and script locked state.
- Server host/user/path supplied by the user; do not store passwords.

For passive monitoring of an existing job, identify:

- `video_edit_jobs.id`, if available.
- Claimed job id from `jingjing-video-worker` logs, if the user did not provide it.
- FireRed/OpenStoryline session/output directory from logs or artifact paths.

## Server Runtime Inspection

Use this flow to see what is running on the current server.

```bash
systemctl list-units --type=service --state=running --no-pager | egrep -i 'jingjing|video|worker|story|fire|next|content|nginx' || true
systemctl --no-pager --full status \
  jingjing-video-worker \
  jingjing-openstoryline-engine \
  jingjing-firered-openstoryline \
  jingjing-domestic-app \
  jingjing-content-generation-worker
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:8000/ready
curl -fsS http://127.0.0.1:7860/ready || curl -fsS http://127.0.0.1:7860/api/ready
```

Read logs by layer:

```bash
sudo journalctl -u jingjing-video-worker -n 240 --no-pager
sudo journalctl -u jingjing-openstoryline-engine -n 200 --no-pager
sudo journalctl -u jingjing-firered-openstoryline -n 260 --no-pager
sudo journalctl -u jingjing-domestic-app -n 120 --no-pager
sudo journalctl -u jingjing-content-generation-worker -n 120 --no-pager
```

## Database Inspection

When DB access is available, query the exact job row instead of guessing from logs. Read:

- `id`
- `status`
- `current_stage`
- `progress_pct`
- `worker_id`
- `claimed_at`
- `heartbeat_at`
- `started_at`
- `finished_at`
- `failure_code`
- `failure_reason`
- `runtime_payload`
- `result_payload`
- `log_payload`
- `updated_at`

Useful status meanings:

- `pending`: not claimed.
- `queued`: claimed by worker.
- `preparing`: validating/downloading/preparing inputs.
- `running`: engine or upload path is active.
- `succeeded`: final success, only trust after checking outputs/assets.
- `failed_retryable`: infra/runtime failure.
- `failed_manual`: contract/content/user-input failure.
- `cancelled`: intentionally stopped.

## Run Workflow

1. Inspect repository context.
   - Read `AGENTS.md` if not already loaded.
   - Read the case/task doc, relevant worker docs, and latest matching `docs/progress/` notes.
   - Check dirty files before edits; do not revert unrelated changes.

2. Prepare database access.
   - Prefer existing deployed env and project scripts.
   - Do not assume `supabase` CLI is the right tool; current deployed services normally use configured database URLs.
   - Use SQL files or clearly reviewable scripts for nontrivial inserts/updates.
   - For merchant material-library tag fixes, inspect `source_items.trace_payload`, `source_items.structure_summary`, `source_items.script_text`, and attached `asset_objects` rows before choosing a patch path.

3. Create a fresh job when running or rerunning.
   - Cancel or ignore stale jobs only with an explicit reason.
   - Insert a new `video_edit_jobs` row.
   - Include real merchant/store/member context, script/test payload, OSS input assets, voice profile/reference audio, and engine settings.
   - Record the new job id immediately.

4. Monitor the server worker.
   - Start with systemd status and `journalctl`.
   - Confirm the worker claimed the expected job.
   - Follow `current_stage`, `heartbeat_at`, and `progress_pct`.
   - Follow FireRed node logs and session output files.
   - If restarting services is necessary, explain why and preserve no-fallback behavior.

5. Verify no-fallback success.
   Treat the run as successful only when all applicable checks pass:
   - `video_edit_jobs.status = 'succeeded'` and `current_stage = 'completed'`.
   - FireRed/OpenStoryline session id is present.
   - Material matching/filtering completed normally; no all-clips fallback path was used.
   - Voice clone used the requested provider, such as `pixelle_clone`, with non-empty generated segments and measurable durations when voice clone is required.
   - Lip sync evidence exists when lip sync is enabled.
   - Render produced a real final video in the worker output/cache path.
   - Upload produced Aliyun OSS keys for requested outputs.
   - `asset_objects` rows reference the new job/content variant and have nonzero byte sizes.

6. Package local artifacts when requested or expected.
   Place copies of real outputs under `D:\Desktop\测试素材`.

7. Write evidence docs for formal run/verify/package/release tasks.
   - Write a factual progress note in `docs/progress/YYYY-MM-DD-case-<NNN>-<short-topic>.md` or a task-specific progress note.
   - Include scope, cancelled/failed attempts, job id, database status, server/runtime changes, OSS keys, voice clone evidence, lip sync evidence, render evidence, local package path, and push/release status.
   - If the task remains unfinished or awaits another agent, also write a handoff under `docs/handoff/`.

## Server Release Notes

Use a clean release snapshot, not a patched `current` directory:

- Generate the package from a committed tree, such as `git archive`, so untracked local release tarballs are not included.
- Upload the archive to the server and extract into `/srv/jingjing-domestic/releases/<timestamp>-<sha>`.
- Build in the new release before switching `/srv/jingjing-domestic/current`.
- Ensure the user running `pnpm install`/`next build` owns the new release directory. If the release is owned by `ubuntu` but the SSH command runs as `meng`, `pnpm` can fail with `EACCES ... app/_tmp_*`.
- If needed, temporarily `chown -R <ssh-user>:<ssh-user> <release>` for install/build, then restore the expected service ownership before switching `current`.
- After build, switch `current`, restart/reload services, and verify app health plus OpenStoryline/FireRed readiness.

Reliable release verification commands:

```bash
readlink -f /srv/jingjing-domestic/current
systemctl is-active jingjing-domestic-app.service jingjing-content-generation-worker.service jingjing-firered-openstoryline.service jingjing-openstoryline-engine.service jingjing-video-worker.service nginx.service
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:8000/ready
curl -fsS http://127.0.0.1:7860/api/ready || curl -fsS http://127.0.0.1:7860/ready
```

## Material Library Tag Patch Notes

Use these rules when fixing uploaded/private material tags that affect video-worker retrieval:

- Current worker retrieval reads material videos from `source_items` joined to `asset_objects` where `owner_type = 'source_item'`.
- The worker indexes `source_items.title`, `source_items.script_text`, `asset_objects.storage_key`, and strings inside `structure_summary`, `engagement_snapshot`, and `trace_payload`.
- Keep Pexels-style clip labels visible-shot-first. Do not repeat broad sales facts, floor area, exact height, parking count, dorm/apartment count, or generic promotion claims across every clip unless those facts are visible in that specific shot.
- Preserve row identity and attached media objects when only labels are wrong. Update `source_items` text/JSON fields; do not re-upload media just to fix labels.
- Include a revision marker in both `structure_summary` and `trace_payload` so readback can prove which patch ran.
- For the 2026-05-24 factory package, the concrete correction is: `4fd14cd4421d3ea08073180c1a18af3e.mp4` is a `平峦山公园周边道路` / `林荫道路` clip, while `5165c70ee2e6914393cbe44a6d1ff17f.mp4` is the `平峦山远景` / `山体远景` clip.

## Daily Script Forward-Copy Notes

Use these rules when copying a member's approved daily video script to today or later calendar dates:

- Treat the existing approved day as the source of truth; read `daily_content_tasks.video_task`, its linked `content_drafts`, and linked `content_variants` from the deployed DB before writing.
- Copy the full script contract, not only visible text: `generatedVideoScript`, `memberUploadPolicy`, `recommendedProductionConfig`, `script_text`, `production_scenes`, `team_calendar_source`, `knowledge_refs`, and `material_refs` must stay coherent.
- Create an independent `content_drafts` and `content_variants` pair for every target date. Do not point multiple days at the same mutable draft/variant unless the user explicitly asks for shared linkage.
- Do not copy uploaded draft input videos, rendered result assets, or `video_edit_jobs` when the user asks to place a script on future dates. Those are outputs/evidence from another day, not new-day results.
- Add provenance such as `scriptCopyProvenance` with source date/task/draft/variant and target date/task/draft/variant so readback can prove what changed.
- Default to dry-run. Apply only from a committed and released code path, then read back every affected date with scene counts, required talking-head scene orders, config keys, and linked draft/variant ids.

## Failure Handling

When a stage fails:

- Stop treating the run as a success.
- Record the failing stage, logs, exception, job id, DB status, and whether the job was marked `failed_retryable`, `failed_manual`, or `cancelled`.
- Preserve partial real artifacts as evidence only; do not present them as final output.
- Do not switch to a fallback output.
- For a user-requested rerun, create a fresh job after addressing the cause.

## Final Response Checklist

Report only facts that were verified:

- Job id and final/current status.
- Server path and whether worker/services were restarted.
- Storage provider, normally `aliyun_oss`.
- OSS keys for final, cover, subtitles, or requested outputs.
- Voice clone provider and segment count/duration evidence when applicable.
- Lip sync provider/evidence when applicable.
- Local artifact package path when packaging was requested.
- Progress or handoff document path when written.
- Any checks that could not be completed.
