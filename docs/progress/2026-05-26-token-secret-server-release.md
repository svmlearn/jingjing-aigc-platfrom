# 2026-05-26 TOKEN_SECRET server release

## Scope

- Local branch: `codex/TOKEN_SECRET`
- Released commit: `f8c3e3cf392c4090aaae53718a4e379d115e49de`
- Target server: `meng@8.154.28.41:/srv/jingjing-domestic`
- Release method: clean release directory from local `git archive`; no hot patching under `/srv/jingjing-domestic/current`.

## Local validation

- `git diff --check HEAD`: passed.
- Focused worker tests with `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline`: `118 passed`.
  - `workers/video-worker/tests/test_processor_contract.py`
  - `workers/video-worker/tests/test_status_contract.py`
  - `workers/video-worker/tests/test_firered_node_interceptors.py`
  - `workers/video-worker/tests/test_openstoryline_engine_adapters.py`

## Release record

- Local archive: `D:\codexplan\jingjing-release\jingjing-f8c3e3c.tar`
- Server archive: `/tmp/jingjing-f8c3e3c.tar`
- Previous release: `/srv/jingjing-domestic/releases/20260526144940-c00ae07`
- New release: `/srv/jingjing-domestic/releases/20260526155627-f8c3e3c`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526155627-f8c3e3c`

Build commands run on server:

```bash
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

The release restored FireRed runtime symlinks:

- `.storyline -> /srv/jingjing-video-worker/firered/.storyline`
- `resource -> /srv/jingjing-video-worker/firered/resource`
- `outputs -> /srv/jingjing-video-worker/firered/outputs`

## Restarted services

- `jingjing-domestic-app.service`
- `jingjing-content-generation-worker.service`
- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`
- `nginx.service` reloaded

Final service status:

- `nginx.service`: active
- `jingjing-domestic-app.service`: active
- `jingjing-content-generation-worker.service`: active
- `jingjing-firered-openstoryline.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-video-worker.service`: active

## Health checks

- `curl -fsS http://127.0.0.1:3000/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- `curl -fsS http://127.0.0.1:8000/ready`: ready, FireRed ready.
- `curl -fsS http://127.0.0.1:7860/api/ready`: ready, `render_video_available=true`.
- `curl -fsS http://8.154.28.41/api/health`: ok, database `postgres`, storage `aliyun_oss`.

## Notes

- Local `main` and `codex/TOKEN_SECRET` point to `f8c3e3c`; remote `origin/main` was not pushed by this release.
- Remote `origin/5.26-worker-fix` already points to `f8c3e3c`.
- Windows PowerShell tried to expand remote `$(readlink ...)` during an early read-only probe. The release used the existing base64 remote script pattern from `docs/codex-runtime-errors.md` to avoid shell quoting issues.
