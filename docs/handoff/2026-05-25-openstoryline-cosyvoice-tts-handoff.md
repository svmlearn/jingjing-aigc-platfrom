# 2026-05-25 OpenStoryline CosyVoice TTS handoff

## Goal

Switch OpenStoryline/video-worker TTS and voice cloning to Aliyun DashScope CosyVoice, update LLM/VLM runtime defaults, commit and push `5.23-worker-fix`, then release from a committed archive to the domestic server group without hot-editing `current`.

## Worktree and branch

- Worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`
- Branch: `5.23-worker-fix`
- Main workspace dirty state was intentionally left untouched.
- Existing unrelated untracked tarballs and old handoff draft must remain unstaged.

## Implemented

- App contracts and payload builder support `aliyun_cosyvoice`.
- UI defaults system voiceover to Aliyun CosyVoice with `longanyang`.
- Voice profile state/repository/migrations support `aliyun_cosyvoice_clone`.
- Self-host PostgreSQL has a dedicated incremental migration for the new voice profile provider check.
- Worker directive accepts clone providers for `voice_profile` mode and defaults voice profiles to `aliyun_cosyvoice_clone`.
- Worker prepares signed reference-audio URLs and enrolls Aliyun clone voices only when `external_voice_id` is missing.
- OpenStoryline adapter maps Aliyun system/clone TTS into FireRed `service_config`.
- FireRed `GenerateVoiceoverNode` can synthesize with Aliyun CosyVoice and create clone `voice_id` via DashScope customization.
- FireRed/OpenStoryline examples now use:
  - `OPENSTORYLINE_LLM_MODEL=glm-5.1`
  - `OPENSTORYLINE_VLM_MODEL=qwen3.6-plus`
  - `OPENSTORYLINE_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
  - `OPENSTORYLINE_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`

## Verification

- `git diff --check`: passed.
- Python compile check for changed worker/OpenStoryline/FireRed files: passed.
- Focused Python tests: 95 passed.
- App typecheck: passed.
- App changed contract tests: 31 passed.

## Pending

- Commit this work.
- Push `5.23-worker-fix` to Gitee `origin/5.23-worker-fix`.
- Archive committed HEAD and upload to `meng@8.154.28.41`.
- Build under `/srv/jingjing-domestic/releases/<timestamp>-<sha>/app`.
- Backup and update `/srv/jingjing-domestic/shared/env/worker.env`.
- Switch `/srv/jingjing-domestic/current`.
- Restart:
  - `jingjing-domestic-app`
  - `jingjing-content-generation-worker`
  - `jingjing-firered-openstoryline`
  - `jingjing-openstoryline-engine`
  - `jingjing-video-worker`
- Run health checks and TTS/clone smoke tests.

## Secret handling

- Do not write the real DashScope API key to Git, docs, terminal output summaries, or release artifacts.
- Server env should use existing/provided `DASHSCOPE_API_KEY`; explicit LLM/VLM/TTS API key variables may be populated from the same value inside `worker.env` if runtime requires it, but docs should record only variable names and backup paths.

## Useful commands already proven locally

```powershell
$env:PYTHONPATH = "workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src"
python -m pytest workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py
```

```powershell
cd app
corepack pnpm@10.20.0 typecheck
node --test src/server/api/video-job-payload.test.ts src/lib/voice-profile-state-machine.test.ts
```
