# 2026-05-21 lip-sync branch main merge progress

## Goal

Keep the talking-head lip-sync test branch current with the server-side `gitee/main` baseline, then verify and push the updated branch without deploying.

## Branch

- Local branch: `codex/lip-sync-script-alignment-no-asr`
- Remote branch: `gitee/codex/lip-sync-script-alignment-no-asr`
- Merge commit: `237fd36`
- Merge source: `gitee/main @ 31526db`
- Previous remote branch head: `21356b2`
- Final remote branch head after push: `237fd36`

## Completed

- Fetched latest `gitee/main`.
- Merged `gitee/main` into `codex/lip-sync-script-alignment-no-asr`.
- Merge completed automatically with no conflicts.
- Reviewed the merge-sensitive files:
  - `app/src/components/member/member-workspace.tsx`
  - `app/src/server/api/schemas.ts`
  - `workers/video-worker/openstoryline/app/config.py`
  - `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
- Confirmed member video production config still enables `lipSync` only when a `voice_profile` is available.
- Confirmed `script_audio_alignment` remains the no-ASR lip-sync path.
- Confirmed `asr_original_audio` remains the explicit rollback ASR path.
- Pushed `codex/lip-sync-script-alignment-no-asr` to Gitee.

## Verification

Ran after merge:

```text
PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline/firered/src python -m pytest workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py
```

Result:

```text
90 passed
```

Also ran:

```text
git diff --check
npm run typecheck
```

Results:

```text
git diff --check passed
app typecheck passed
```

## Server Version Check

Read-only server check before the merge found:

- ECS: `8.154.28.41`
- Current server release: `/srv/jingjing-domestic/releases/20260520233654-31526db`
- Current server commit: `31526db`
- Current server branch lineage: `gitee/main`
- Services were active.
- Server did not contain `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py`.

Conclusion: before the merge, the server was newer than the old lip-sync branch in general mainline changes, but it did not include the lip-sync implementation. After this merge and push, the remote lip-sync branch contains latest `main` plus the lip-sync work. No server deployment was performed.

## Not Done

- Did not release to server.
- Did not restart services.
- Did not hot update servers from this branch.
- Did not change DNS, ICP, RDS public access, OSS permission, or env config.
- Did not run a real `voice_profile` upload.
- Did not run a real VideoRetalk provider job.
- Did not run the full member E2E chain:
  `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`.

## Remaining Real Checks Before Release

- Successful `voice_profile` upload.
- Clone TTS output.
- Provider-accessible `video_url` and `audio_url`.
- Real Aliyun VideoRetalk `lip_sync`.
- Render consuming retalked talking-head segments.
- OSS final asset persistence.

## Guardrails

- Do not mark the clone/lip-sync chain passed until a real `voice_profile` upload and real VideoRetalk run succeed.
- Do not use ASR for `script_audio_alignment`; keep ASR only for explicit `asr_original_audio` rollback.
- Do not print secrets or signed URL query values.
- Do not change DNS, ICP, RDS public access, or OSS public permissions.
- Do not restore old Supabase, COS, or Vercel configs.
- Do not change worker output prefix back to smoke paths.
- Do not move member main path back to `/dashboard/video`.
- Do not add `merchant_media_*` tables.
- Do not route member Dify main path back to `video-workbench-agent`.
