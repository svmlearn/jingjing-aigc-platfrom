# 2026-05-26 private media token secret and qwen3.7 release

## Scope

- Local branch: `codex/TOKEN_SECRET`
- Merged local main commit: `17cd93e32e82`
- Remote updated: `origin/5.26-worker-fix -> 17cd93e`
- Target server: `meng@8.154.28.41:/srv/jingjing-domestic`
- Release method: clean release directory from local `git archive`; no hot patching under `/srv/jingjing-domestic/current`.

## Code changes

- Added `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET` to app env examples and `check-domestic-app-env.mjs`.
- Changed FireRed/OpenStoryline worker default `OPENSTORYLINE_LLM_MODEL` from `glm-5.1` to `qwen3.7-max`.
- Did not change app platform `platform_settings.llm_runtime`.
- Did not write provider keys or token secrets into the repository.

## Local validation

- `git diff --check`: passed.
- App env check:
  - without `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`: the new check reports `missing`.
  - with temporary test secret: the new check reports `ok` for `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`.
- App focused tests:
  - `node --test src/lib/private-media-download-service-core.test.ts src/lib/private-media-pexels-adapter.test.ts`: `10 passed`.
  - Direct `node --test` for alias-dependent higher-level tests was not used as a gate because the local Node runner cannot resolve the project `@/` alias in those files.
- `npm run typecheck`: passed.
- Worker focused tests with `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline`: `118 passed`.

## Server env updates

Backups created with suffix:

- `token-secret-qwen37-20260526162251`

Server env changes:

- `/srv/jingjing-domestic/shared/env/app.env`
  - `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET=SET`
- `/srv/jingjing-domestic/shared/env/worker.env`
  - `OPENSTORYLINE_LLM_MODEL=qwen3.7-max`
  - `ALIYUN_VIDEORETALK_API_KEY=SET`
  - `ALIYUN_VIDEORETALK_MODEL=videoretalk`

Secrets were not printed to logs.

## Release record

- Local archive: `D:\codexplan\jingjing-release\jingjing-17cd93e.tar`
- Server archive: `/tmp/jingjing-17cd93e.tar`
- Previous release: `/srv/jingjing-domestic/releases/20260526155627-f8c3e3c`
- New release: `/srv/jingjing-domestic/releases/20260526162411-17cd93e`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526162411-17cd93e`

Build commands run on server:

```bash
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

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
- Server `node scripts/check-domestic-app-env.mjs --env-file /srv/jingjing-domestic/shared/env/app.env`: ok, including `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`.

## Private media probe

- Service-auth private media search returned HTTP `200`.
- Current database probe found no `ready` `merchant_media_clips`, so there was no download URL to verify as `302`.
- This still confirms the app env gate and route do not fail on missing `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`.

## Notes

- `origin/main` was not pushed.
- `origin/5.26-worker-fix` was updated from local `main`.
- This progress document was written after release and is docs-only; it was not part of the deployed archive.
