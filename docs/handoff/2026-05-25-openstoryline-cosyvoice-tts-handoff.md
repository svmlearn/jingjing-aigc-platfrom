# 2026-05-25 OpenStoryline CosyVoice TTS handoff

## Goal

Switch OpenStoryline/video-worker TTS and voice cloning to Aliyun DashScope CosyVoice, update LLM/VLM runtime defaults, commit and push `5.23-worker-fix`, then release from a committed archive to the domestic server group without hot-editing `current`.

## Final state

- Branch: `5.23-worker-fix`
- Latest pushed commit: `766944a fix: normalize dashscope cosyvoice sdk format`
- Gitee remote: `origin/5.23-worker-fix`
- Current server release: `/srv/jingjing-domestic/releases/20260525200750-766944a`
- Current symlink: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260525200750-766944a`
- Main workspace `D:\codexplan\jingjingstart` was intentionally not modified.

## Implemented

- System voiceover defaults to Aliyun CosyVoice:
  - provider: `aliyun_cosyvoice`
  - model: `cosyvoice-v3-flash`
  - voice: `longanyang`
- Voice profile clone defaults to:
  - provider: `aliyun_cosyvoice_clone`
  - model: `cosyvoice-v3.5-plus`
  - customization URL: `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization`
- App contracts, schema, payload builder, UI options, DB migrations, and voice profile repository support the new providers.
- Worker keeps the existing project voice clone contract:
  - `voice_profiles` and `asset_objects(audio)` remain the business truth.
  - worker signs the reference audio URL.
  - existing `voice_profiles.external_voice_id` is reused.
  - missing `external_voice_id` creates a provider voice and writes it back.
- OpenStoryline adapter maps Aliyun system/clone configs to FireRed.
- FireRed `GenerateVoiceoverNode` can synthesize system and clone TTS through DashScope.
- DashScope SDK format handling was fixed after real smoke found that plain string `format` plus unsupported `sample_rate` caused provider failure.

## Verification

- Local:
  - `git diff --check`: passed.
  - Python compile check: passed.
  - Focused worker/OpenStoryline tests: 97 passed.
  - App typecheck: passed.
  - App contract tests: 31 passed.
- Server:
  - app health: passed.
  - OpenStoryline engine ready: passed.
  - FireRed ready: passed.
  - app/content worker/FireRed/OpenStoryline engine/video worker/nginx: active.
  - system TTS smoke: passed, `cosyvoice-v3-flash + longanyang`, 33109 bytes, 2074 ms.
  - voice profile clone smoke: passed through the project contract, not just provider API:
    - temp `voice_profiles` + audio asset
    - signed OSS reference audio URL
    - `external_voice_id` created and written back
    - FireRed clone TTS produced one segment, 33945 bytes, 2126 ms
    - temp DB rows were cleaned and read back as 0 rows.

## Server notes

- Env file: `/srv/jingjing-domestic/shared/env/worker.env`
- Env backup: `/srv/jingjing-domestic/shared/env/worker.env.bak-cosyvoice-20260525194049`
- Real DashScope key is only in server env. Do not put it in docs or Git.
- Current release required runtime initialization before services were stable:
  - chown release to `ubuntu:ubuntu`
  - symlink FireRed `.storyline`, `resource`, and `outputs` to `/srv/jingjing-video-worker/firered/*`
- A short 2-second reference clip failed clone enrollment. Use a real voice profile reference sample; the passing smoke used a 22-second reference.

## Follow-up

- Keep `docs/progress/2026-05-25-openstoryline-cosyvoice-tts-release.md` as the detailed release log.
- For future releases, include the FireRed runtime symlink/chown step in the release checklist before restarting worker services.
- User-facing voice clone QA should still be run from the member UI with an actual uploaded M4A/MP3 once product wants a full browser-to-worker E2E.
