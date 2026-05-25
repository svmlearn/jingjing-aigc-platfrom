# 2026-05-25 OpenStoryline CosyVoice TTS release progress

## Scope

- Worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`
- Branch: `5.23-worker-fix`
- Base before this task: `b1c9bc2`
- Remote safety check: `origin/5.23-worker-fix` was confirmed as an ancestor of local `5.23-worker-fix` before implementation.
- Main workspace `D:\codexplan\jingjingstart` was not modified.

## Local changes

- Added app contract/schema/payload support for system TTS provider `aliyun_cosyvoice`.
- Defaulted system voiceover to:
  - provider: `aliyun_cosyvoice`
  - model: `cosyvoice-v3-flash`
  - voice: `longanyang`
  - websocket URL: `wss://dashscope.aliyuncs.com/api-ws/v1/inference`
- Added voice profile provider `aliyun_cosyvoice_clone` and kept `pixelle_clone` as compatibility.
- Updated `voice_profiles` migrations and replacement RPC defaults to allow/default `aliyun_cosyvoice_clone`.
- Updated worker directive normalization so `voice_profile` mode accepts clone providers instead of forcing `pixelle_clone`.
- Added worker-side signed reference audio URL creation for Aliyun OSS and Tencent COS.
- Added worker-side Aliyun clone enrollment flow:
  - Uses `voice_profiles.external_voice_id` when present.
  - When missing, creates a voice through DashScope customization and writes back `external_voice_id` / `external_model_id`.
  - Uses customization model `voice-enrollment` and target synthesis model `cosyvoice-v3.5-plus`.
- Added OpenStoryline FireRed service_config mapping for `aliyun_cosyvoice` and `aliyun_cosyvoice_clone`.
- Added FireRed `GenerateVoiceoverNode` support for Aliyun CosyVoice system TTS and clone TTS.
- Updated FireRed/OpenStoryline model defaults to:
  - LLM model: `glm-5.1`
  - VLM model: `qwen3.6-plus`
  - Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - API key variable fallback: `OPENSTORYLINE_LLM_API_KEY` / `OPENSTORYLINE_VLM_API_KEY`, with FireRed env fallback to `DASHSCOPE_API_KEY`.
- Updated env examples and docker-compose defaults. No real API key was written to code or docs.

## Local verification

Executed from `D:\codexplan\jingjingstart-5.23-worker-lip`.

- `git diff --check`
  - Passed. Only Git line-ending warnings were printed.
- `python -m py_compile workers/video-worker/worker/app/processor.py workers/video-worker/worker/app/cos_client.py workers/video-worker/openstoryline/app/config.py workers/video-worker/openstoryline/app/engine_adapters.py workers/video-worker/openstoryline/firered/agent_fastapi.py workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/generate_voiceover.py`
  - Passed.
- `$env:PYTHONPATH = "workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src"; python -m pytest workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py`
  - Passed: 96 tests.
- `cd app; corepack pnpm@10.20.0 typecheck`
  - Passed.
- `cd app; node --test src/server/api/video-job-payload.test.ts src/lib/voice-profile-state-machine.test.ts`
  - Passed: 31 tests.

## Commit and push

- Commit: pending.
- Push target: `origin/5.23-worker-fix`, pending.
- Unrelated existing untracked files were not staged:
  - `docs/handoff/2026-05-25-openstoryline-scene-query-search-implementation-plan.md`
  - `jingjing-*.tar`

## Release status

- Server release: pending commit and push.
- Planned archive source: committed Git tree from `5.23-worker-fix` HEAD.
- Planned server release root: `/srv/jingjing-domestic/releases/<timestamp>-<sha>`.
- Planned env backup: `/srv/jingjing-domestic/shared/env/worker.env` to a timestamped backup path.
- Env values to set/update on server, without recording secret values:
  - `DASHSCOPE_API_KEY`
  - `OPENSTORYLINE_LLM_MODEL=glm-5.1`
  - `OPENSTORYLINE_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
  - `OPENSTORYLINE_LLM_API_KEY` may reuse `DASHSCOPE_API_KEY` value if the service requires explicit variable.
  - `OPENSTORYLINE_VLM_MODEL=qwen3.6-plus`
  - `OPENSTORYLINE_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
  - `OPENSTORYLINE_VLM_API_KEY` may reuse `DASHSCOPE_API_KEY` value if the service requires explicit variable.
  - `OPENSTORYLINE_TTS_PROVIDER=aliyun_cosyvoice`
  - `ALIYUN_COSYVOICE_TTS_MODEL=cosyvoice-v3-flash`
  - `ALIYUN_COSYVOICE_TTS_VOICE=longanyang`
  - `ALIYUN_COSYVOICE_TTS_WS_URL=wss://dashscope.aliyuncs.com/api-ws/v1/inference`
  - `ALIYUN_COSYVOICE_CLONE_PROVIDER=aliyun_cosyvoice_clone`
  - `ALIYUN_COSYVOICE_CLONE_MODEL=cosyvoice-v3.5-plus`
  - `ALIYUN_COSYVOICE_CLONE_CUSTOMIZATION_URL=https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization`
  - `ALIYUN_COSYVOICE_CLONE_TTS_WS_URL=wss://dashscope.aliyuncs.com/api-ws/v1/inference`

## Server verification plan

- Build in the new release before switching `current`:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`
  - `corepack pnpm@10.20.0 build`
- After symlink switch and service restart:
  - `curl -fsS http://127.0.0.1:3000/api/health`
  - `curl -fsS http://127.0.0.1:8000/ready`
  - `curl -fsS http://127.0.0.1:7860/api/ready || curl -fsS http://127.0.0.1:7860/ready`
  - `systemctl is-active` for the app, content worker, FireRed, OpenStoryline engine, and video worker.
- Smoke still pending:
  - Short text system TTS through `aliyun_cosyvoice`.
  - Voice profile clone smoke confirming provider, `voice_id`, segment count/duration, and DB writeback.
