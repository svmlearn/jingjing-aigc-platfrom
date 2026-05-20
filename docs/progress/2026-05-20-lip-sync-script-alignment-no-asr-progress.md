# 2026-05-20 lip-sync script alignment no-ASR progress

## Branch

- `codex/lip-sync-script-alignment-no-asr`

## Completed

- Added a real FireRed `lip_sync` node for talking-head segments.
- Added Aliyun VideoRetalk adapter using the official async `image2video/video-synthesis/` endpoint with `model=videoretalk`.
- Kept ASR as explicit rollback only: `script_audio_alignment` must not trigger ASR; `asr_original_audio` remains available.
- Wired lip-sync provider config through the same chain as other model providers:
  `Settings.from_env -> service_config.lip_sync -> FireRed ClientContext -> ToolInterceptor.inject_lip_sync_config`.
- Updated render so `render_video` prefers `lip_sync.plan_timeline` and records consumed lip-sync segments.
- Updated worker progress/failure mapping so VideoRetalk/lip-sync failures land on `lip_sync`.
- Updated the architecture document with real implementation notes, provider URL requirements, and face-quality/error-code exploration items.

## Verification

- `python -m py_compile ...` passed for the touched Python runtime modules.
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline/firered/src python -m pytest workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py`
- Result: `90 passed`.
- `git diff --check` reported no whitespace errors. Windows line-ending warnings only.

## Not Verified

- No real `voice_profile` upload was run in this turn.
- No real member task was run through `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`.
- No real Aliyun VideoRetalk job was submitted because provider-accessible temporary URL plumbing and secrets were not used.
- Therefore the clone/lip-sync production chain is not marked passed yet.

## Known Gaps

- The current `lip_sync` node intentionally fails closed when only local video/audio paths are available. Production verification still needs temporary OSS/DashScope-accessible `video_url` and `audio_url` plumbing.
- Face-quality preflight is not implemented yet. Track single face, frontal angle, visible mouth, face size ratio, clarity, lighting, and motion blur before VideoRetalk.
- Supplier error-code mapping needs expansion for `InvalidURL.*`, `InvalidFile.*`, `InvalidFile.FaceNotMatch`, audio duration/format, and video quality failures.

## Guardrails

- No server hot update was performed.
- No DNS / ICP / RDS public network / OSS public permission changes were made.
- No Supabase/COS/Vercel legacy config was reintroduced by this lip-sync change.
- No worker output prefix was changed back to smoke paths.
- No member route was changed back to `/dashboard/video`.
- No `merchant_media_*` table was added.
- No member Dify main path was changed to call `video-workbench-agent`.
