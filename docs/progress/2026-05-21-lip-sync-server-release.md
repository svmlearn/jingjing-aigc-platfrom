# 2026-05-21 lip-sync server release

## Scope

Release the already-pushed `codex/lip-sync-script-alignment-no-asr` branch to the domestic server through the normal release directory flow.

## Source

- Branch: `codex/lip-sync-script-alignment-no-asr`
- Gitee commit: `858ab126d400aff6a4aee97b2d621c164f533257`
- Short commit: `858ab12`
- Release path: `/srv/jingjing-domestic/releases/20260521103724-858ab12`
- Previous release: `/srv/jingjing-domestic/releases/20260520233654-31526db`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260521103724-858ab12`

## Guardrails

- No hot update was performed.
- No code was edited inside the old `current` release directory.
- The release source was a `git archive` of commit `858ab12`.
- Local-only private architecture notes were not included in the release archive.
- No DNS, ICP, RDS public access, OSS public permission, or env file changes were made.
- No secrets or signed URL query values were printed.
- No real video job was started during this release.

## Pre-Release Checks

- Confirmed Gitee branch `codex/lip-sync-script-alignment-no-asr` pointed to `858ab12`.
- Confirmed no in-flight `video_edit_jobs` in statuses `pending`, `queued`, `preparing`, or `running`.
- Confirmed previous server services were active before release.
- Confirmed previous release health:
  - app `/api/health`: ok
  - OpenStoryline `/ready`: ready
  - FireRed `/api/ready`: ready

## Release Steps

1. Created a local archive from Git commit `858ab12`.
2. Uploaded the archive to `/tmp/jingjing-858ab12.tar`.
3. Created real release directory:
   `/srv/jingjing-domestic/releases/20260521103724-858ab12`.
4. Extracted the archive into the release directory.
5. Set release ownership to `ubuntu:ubuntu`, matching the current server release ownership.
6. Built the app on the server:

```text
cd /srv/jingjing-domestic/releases/20260521103724-858ab12/app
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

7. Switched `current` to the new release.
8. Restarted:
   - `jingjing-domestic-app.service`
   - `jingjing-content-generation-worker.service`
   - `jingjing-firered-openstoryline.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-video-worker.service`
9. Reloaded `nginx.service`.

## Release Notes

The first server build attempt failed before any `current` switch:

```text
EACCES: permission denied, open '/srv/jingjing-domestic/releases/20260521103724-858ab12/app/_tmp_*'
```

Cause: the new release was initially owned by `jingjing:jingjing`, while the build command ran as `meng`.

Resolution:

- Kept the old `current` release active.
- Changed the new release ownership to `ubuntu:ubuntu`, matching the existing active release.
- Removed the failed `_tmp_*` file.
- Re-ran install/build successfully.

A second build command attempt failed because PowerShell/SSH heredoc passed `build\r` to pnpm. This did not affect the active release. Re-running `corepack pnpm@10.20.0 build` as a clean single command succeeded.

## Verification

Server service status after release:

```text
jingjing-domestic-app.service: active
jingjing-content-generation-worker.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
nginx.service: active
```

Health checks:

```text
http://127.0.0.1:3000/api/health: ok
http://8.154.28.41/api/health: ok
http://127.0.0.1:8000/ready: ready, engine_adapter=fire_red
http://127.0.0.1:7860/api/ready: ready, tool_count=21, render_video_available=true
```

Source/runtime checks:

- `lip_sync.py` is present under the current release.
- FireRed ready now reports `tool_count=21`.
- FireRed real runtime uses `/srv/jingjing-video-worker/venv-firered/bin/python`.
- Runtime import check passed:

```text
requests=2.34.2
lip_sync_meta=lip_sync
```

App server-side typecheck:

```text
cd /srv/jingjing-domestic/current/app
corepack pnpm@10.20.0 exec tsc --noEmit --pretty false
```

Result: passed when run as the release owner.

Worker pytest was not run on the server because the server worker/openstoryline venvs do not include `pytest`. The equivalent local worker suite had already passed before release:

```text
90 passed
```

## Not Verified

- No real `voice_profile` upload was run.
- No real clone TTS output was generated.
- No real Aliyun VideoRetalk provider job was submitted.
- No full member E2E chain was run:
  `upload -> clone_tts -> lip_sync -> timeline -> render -> oss`.

The clone/lip-sync production chain is therefore released for runtime availability, but not yet marked as real-chain passed.
