# 2026-05-25 OpenStoryline CosyVoice TTS release progress

## Scope

- Worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`
- Branch: `5.23-worker-fix`
- Main workspace `D:\codexplan\jingjingstart` was not modified.
- Existing unrelated untracked files were left unstaged:
  - `docs/handoff/2026-05-25-openstoryline-scene-query-search-implementation-plan.md`
  - `jingjing-*.tar`

## Code changes

- System voiceover now defaults to `aliyun_cosyvoice`.
  - model: `cosyvoice-v3-flash`
  - voice: `longanyang`
  - websocket URL: `wss://dashscope.aliyuncs.com/api-ws/v1/inference`
- Voice profile clone now defaults to `aliyun_cosyvoice_clone`.
  - model: `cosyvoice-v3.5-plus`
  - customization URL: `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization`
- App contract/schema/payload builder and UI support the new providers.
- `voice_profiles` migrations and replacement RPC allow/default `aliyun_cosyvoice_clone`.
- Worker no longer forces `voice_profile` mode to `pixelle_clone`.
- Worker keeps using project voice clone contract:
  - `voice_profiles` + `asset_objects(audio)`
  - signed reference audio URL
  - `external_voice_id` reuse when present
  - missing `external_voice_id` creates provider voice and writes back to `voice_profiles`
- OpenStoryline adapter maps Aliyun system/clone service config into FireRed.
- FireRed `generate_voiceover` supports Aliyun system TTS and clone TTS.
- FireRed DashScope SDK path now maps audio `format` strings to SDK `AudioFormat` enums and does not pass unsupported `sample_rate` into the SDK constructor.
- LLM/VLM defaults were updated:
  - LLM: `glm-5.1`
  - VLM: `qwen3.6-plus`
  - base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`

## Local verification

Executed from `D:\codexplan\jingjingstart-5.23-worker-lip`.

- `git diff --check`
  - Passed. Only Git line-ending warnings were printed.
- Python compile for changed worker/OpenStoryline/FireRed files
  - Passed.
- Focused worker/OpenStoryline tests:
  - `python -m pytest workers/video-worker/tests/test_directive_contract.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_generate_voiceover_contract.py`
  - Passed: 97 tests.
- App typecheck:
  - `corepack pnpm@10.20.0 typecheck`
  - Passed.
- App contract tests:
  - `node --test src/server/api/video-job-payload.test.ts src/lib/voice-profile-state-machine.test.ts`
  - Passed: 31 tests.

## Commits and push

- `854b3bd feat: switch video worker tts to aliyun cosyvoice`
- `4ec9728 fix: add selfhost cosyvoice voice profile migration`
- `766944a fix: normalize dashscope cosyvoice sdk format`
- Pushed to Gitee:
  - `origin/5.23-worker-fix`
  - remote head after push: `766944abb26cdd0bbe552c6cda571044c6d2f247`

## Server release

- Superseded release:
  - `/srv/jingjing-domestic/releases/20260525194415-4ec9728`
  - Built and briefly released, then superseded after real TTS smoke exposed the DashScope SDK format handling bug.
- Current release:
  - archive: `D:\codexplan\jingjing-release\jingjing-766944a.tar`
  - uploaded archive: `/tmp/jingjing-766944a.tar`
  - release directory: `/srv/jingjing-domestic/releases/20260525200750-766944a`
  - `current`: `/srv/jingjing-domestic/releases/20260525200750-766944a`
- App build in current release:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`: passed.
  - `corepack pnpm@10.20.0 build`: passed.
- Release runtime initialization:
  - New release was changed to `ubuntu:ubuntu`, matching the FireRed systemd service user.
  - FireRed runtime symlinks were initialized in the new release:
    - `.storyline -> /srv/jingjing-video-worker/firered/.storyline`
    - `resource -> /srv/jingjing-video-worker/firered/resource`
    - `outputs -> /srv/jingjing-video-worker/firered/outputs`
  - This fixed the restart loop caused by `ln: failed to create symbolic link ... Permission denied`.

## Env and migration

- Environment file:
  - `/srv/jingjing-domestic/shared/env/worker.env`
- Backup:
  - `/srv/jingjing-domestic/shared/env/worker.env.bak-cosyvoice-20260525194049`
- Secret handling:
  - Real DashScope API key is stored only in server env.
  - No real key is written in Git or docs.
  - Explicit CosyVoice/LLM/VLM key variables are allowed to fall back to `DASHSCOPE_API_KEY`.
- Server DB migration applied:
  - `app/db/migrations/202605250001_selfhost_aliyun_cosyvoice_voice_profiles.sql`
- Migration readback:
  - `voice_profiles_provider_check` allows `pixelle_clone` and `aliyun_cosyvoice_clone`.
  - `voice_profiles.provider` default is `aliyun_cosyvoice_clone`.

## Server verification

- Health/readiness:
  - `curl -fsS http://127.0.0.1:3000/api/health`: passed.
  - `curl -fsS http://127.0.0.1:8000/ready`: passed.
  - `curl -fsS http://127.0.0.1:7860/api/ready`: passed.
- Services:
  - `jingjing-domestic-app`: active.
  - `jingjing-content-generation-worker`: active.
  - `jingjing-firered-openstoryline`: active.
  - `jingjing-openstoryline-engine`: active.
  - `jingjing-video-worker`: active.
  - `nginx`: active.
- System TTS smoke:
  - provider: `aliyun_cosyvoice`
  - model: `cosyvoice-v3-flash`
  - voice: `longanyang`
  - output: `/tmp/cosyvoice-system-smoke-1779711228.wav`
  - bytes: `33109`
  - duration: `2074 ms`
- Voice profile clone smoke:
  - Verified the project voice clone contract, not just a provider API call:
    - temp `voice_profiles` + `asset_objects(audio)`
    - OSS signed reference audio URL
    - missing `external_voice_id` creates provider voice
    - `voice_profiles.external_voice_id` writeback
    - FireRed clone TTS using the returned voice id
  - provider: `aliyun_cosyvoice_clone`
  - external model: `cosyvoice-v3.5-plus`
  - reference audio duration: `22182 ms`
  - clone output: `/tmp/cosyvoice-smoke-1779712362-5f5caf8b-clone.wav`
  - clone bytes: `33945`
  - clone duration: `2126 ms`
  - segment count: `1`
  - temp DB rows were cleaned after smoke; readback confirmed `0` rows for the temp profile/asset ids.

## Notes

- A 2-second reference audio failed clone enrollment with HTTP 400. This matches the project expectation that voice clone must use a real voice profile reference audio, not a tiny provider smoke clip. The passing clone smoke used a 22-second reference audio.
- The first post-switch readiness check saw transient `503`/connection-refused while FireRed was restarting. After release runtime symlink initialization and restart, all health checks and service states passed.
