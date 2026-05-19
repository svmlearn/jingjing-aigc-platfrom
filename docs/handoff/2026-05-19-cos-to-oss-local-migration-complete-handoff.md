# 2026-05-19 COS to OSS local migration complete handoff

## Status

Local implementation and validation are complete for the COS-to-OSS production-default migration.

This worktree was kept local only:

- no deploy
- no server restart
- no database mutation
- no push
- no merge
- no commit yet

## Worktree

- Worktree: `D:\codexplan\personal\jingjing-content-platform\.worktrees\孟_5.13_5.14`
- Branch: `孟_5.13_5.14`
- Source handoff: `docs/handoff/2026-05-19-cos-to-oss-local-migration-in-progress-handoff.md`
- Progress note: `docs/progress/2026-05-19-cos-to-oss-local-migration.md`

## Completed changes

### OSS production default

- App object-storage default moved from `tencent_cos` to `aliyun_oss`.
- App `.env.example`, domestic smoke scripts, worker `.env.example`, and worker storage fallback now default to OSS.
- Baseline SQL default for `asset_objects.storage_provider` now uses `aliyun_oss`.
- New upload completion rejects `tencent_cos`; Aliyun OSS is required for new uploads.
- Existing COS read compatibility remains where needed for legacy/reference assets.

### Video payload contract

- `ProductionConfig` supports:
  - `subtitles.talkingHeadSource`
  - `render.preserveTalkingHeadOriginalAudio`
- Worker payload input assets preserve structured classification:
  - `role`
  - `scene_type`
  - `tags`
  - `labels`
  - `metadata`
- Normal non-talking-head jobs remain on script/default subtitles and do not preserve original audio by default.
- Talking-head jobs default to original video audio and original-audio ASR subtitles.
- Structured talking-head assets trigger the same default even when the file path is not under the draft-input heuristic.

### Worker and OpenStoryline/FireRed

- Missing input asset provider now falls back to configured worker storage provider, defaulting to OSS.
- Output upload fallback now follows the configured storage provider.
- OpenStoryline and FireRed ASR defaults now use `aliyun_paraformer`.
- Adapter-level and FireRed interceptor gates reject talking-head `asr_original_audio` jobs unless:
  - provider normalizes to `aliyun_paraformer`
  - `ALIYUN_ASR_API_KEY` or `DASHSCOPE_API_KEY` is present
- Local FunASR fallback is blocked for the talking-head original-audio ASR branch.

## Validation summary

Passed:

- `node --test app/src/server/api/video-job-payload.test.ts app/src/lib/media-upload-contract.test.ts`
- `$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_processor_contract.py'`
- `$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_openstoryline_engine_adapters.py'`
- `$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests -p 'test_firered_node_interceptors.py'`
- `$env:PYTHONPATH='.;openstoryline;openstoryline/firered/src'; python -m unittest discover -s tests`
- `python -m compileall workers/video-worker/worker workers/video-worker/openstoryline/app workers/video-worker/openstoryline/firered/src/open_storyline`
- `npm run typecheck --prefix app`
- `npm run lint --prefix app`
- `npm run build --prefix app`
- `git diff --check`

Notes:

- `npm run lint --prefix app` exits successfully with 14 existing unused-import warnings and 0 errors.
- `git diff --check` exits successfully; Git prints LF-to-CRLF working-copy warnings on Windows.

## Files changed

Tracked files currently modified:

```text
app/.env.example
app/db/migrations/202605130001_domestic_core_baseline.sql
app/scripts/check-domestic-app-env.mjs
app/scripts/check-domestic-storage-provider-smoke.mjs
app/scripts/check-domestic-video-chain-api-smoke.mjs
app/scripts/check-domestic-video-chain-worker-smoke.mjs
app/src/contracts/video.ts
app/src/lib/db/voice-profile-repository.ts
app/src/lib/media-upload-contract.test.ts
app/src/lib/media-upload-contract.ts
app/src/lib/ui/video-workflow.ts
app/src/server/api/cos.ts
app/src/server/api/schemas.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/server/api/video-job-payload.test.ts
app/src/server/api/video-job-payload.ts
app/src/server/storage/object-storage.ts
workers/video-worker/.env.example
workers/video-worker/openstoryline/app/config.py
workers/video-worker/openstoryline/app/engine_adapters.py
workers/video-worker/openstoryline/firered/config.toml
workers/video-worker/openstoryline/firered/config.video_edit_engine.toml
workers/video-worker/openstoryline/firered/src/open_storyline/config.py
workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py
workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/asr_node.py
workers/video-worker/tests/test_firered_node_interceptors.py
workers/video-worker/tests/test_openstoryline_engine_adapters.py
workers/video-worker/tests/test_processor_contract.py
workers/video-worker/tests/test_real_io_smoke.py
workers/video-worker/worker/app/config.py
workers/video-worker/worker/app/models.py
workers/video-worker/worker/app/processor.py
workers/video-worker/worker/app/real_io_smoke.py
```

New handoff/progress files from this local wrap-up:

```text
docs/progress/2026-05-19-cos-to-oss-local-migration.md
docs/handoff/2026-05-19-cos-to-oss-local-migration-complete-handoff.md
```

Existing untracked investigation files/directories were left untouched.

## Next recommended step

Review the local diff, then decide whether to commit as one migration commit or split into:

1. OSS production-default and upload/storage contract changes.
2. Talking-head original-audio ASR provider gate changes.

After that, run a separate deployment/real-server validation round only when explicitly approved.
