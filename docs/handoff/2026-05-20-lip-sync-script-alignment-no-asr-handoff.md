# 2026-05-20 lip-sync script alignment no-ASR handoff

## Goal

Implement the new talking-head lip-sync test branch so cloned voiceover drives VideoRetalk and retalked talking-head segments feed timeline/render. Keep ASR available only as explicit rollback.

## Branch

- Local branch: `codex/lip-sync-script-alignment-no-asr`
- Remote tracking: `gitee/codex/lip-sync-script-alignment-no-asr`

## Changed Files

- `docs/架构规范/2026-05-20-真人口播口型替换与精准字幕架构方案.md`
- `docs/progress/2026-05-20-lip-sync-script-alignment-no-asr-progress.md`
- `workers/video-worker/openstoryline/app/config.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
- `workers/video-worker/openstoryline/firered/config.toml`
- `workers/video-worker/openstoryline/firered/config.video_edit_engine.toml`
- `workers/video-worker/openstoryline/firered/config.aliyun-no-asr.toml`
- `workers/video-worker/openstoryline/firered/src/open_storyline/agent.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/config.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/render_video.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/node_schema.py`
- `workers/video-worker/tests/test_firered_lip_sync_node.py`
- `workers/video-worker/tests/test_firered_render_lip_sync.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- `workers/video-worker/tests/test_processor_contract.py`
- `workers/video-worker/worker/app/processor.py`

## Implementation Summary

- Added FireRed `LipSyncNode` after `plan_timeline`.
- `LipSyncNode` only targets segments labelled as talking-head and requires cloned voiceover by `group_id`.
- Aliyun VideoRetalk adapter uses the official async `image2video/video-synthesis/` endpoint.
- The node returns `lip_sync.segments` and a retalked `lip_sync.plan_timeline`.
- `render_video` consumes `lip_sync.plan_timeline` when present.
- Interceptors require lip-sync output before render when `production_config.lip_sync.enabled=true`.
- Worker progress and failure logs now include `lip_sync` and map failures to `lip_sync`.

## Verification

- Targeted Python compile passed.
- Targeted tests passed: `90 passed`.
- `git diff --check` passed, with Windows line-ending warnings only.

## Not Passed Yet

- Real `voice_profile` upload: not run.
- Real VideoRetalk provider job: not run.
- End-to-end member task `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`: not run.
- Do not mark the clone/lip-sync production chain as passed until those are verified.

## Next Steps

1. Add provider-accessible temporary URL plumbing for talking-head video segments and cloned audio, preferably scoped OSS signed URLs.
2. Run one real `voice_profile` upload and clone TTS job.
3. Run one member task through `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`.
4. Capture a failing sample and verify the job log records `video_edit_job_id`, `daily_task_id`, `member_user_id`, final asset/object key if present, FireRed run id, summary, and failure stage.
5. Push this branch to Gitee only after the above validation decision is accepted.

## Guardrails

- Do not hot update servers from this branch.
- Do not print secrets or signed URL query values.
- Do not change DNS / ICP / RDS public network / OSS public permissions.
- Do not restore Supabase/COS/Vercel old configs.
- Do not change worker output prefix back to smoke paths.
- Do not change member main route back to `/dashboard/video`.
- Do not add `merchant_media_*` tables.
- Do not make the member Dify main path call `video-workbench-agent`.
