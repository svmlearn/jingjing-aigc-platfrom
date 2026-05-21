# 2026-05-21 main a4be02e server release

## Scope

Re-release the clean `main` / `gitee/main` code to the Aliyun ECS server because the previous server version was not the expected main baseline.

## Source

- Local branch: `main`
- Gitee branch: `gitee/main`
- Released commit: `a4be02e9667673dde13e3afe805d84e357ea7442`
- Short commit: `a4be02e`
- Archive source: local `git archive` of the commit above

## Server

- ECS: `ubuntu@8.154.28.41`
- Previous release: `/srv/jingjing-domestic/releases/20260521153252-f80a8b3`
- New release: `/srv/jingjing-domestic/releases/20260521161200-a4be02e`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260521161200-a4be02e`

## Pre-Release Checks

- Confirmed local `HEAD`, `gitee/main`, and `FETCH_HEAD` all pointed to `a4be02e`.
- Local worktree had unrelated uncommitted changes; they were not included because the release used `git archive` from commit `a4be02e`.
- Previous server `current` pointed to `/srv/jingjing-domestic/releases/20260521153252-f80a8b3`; `f80a8b3` was not present in the local main object database.
- `video_edit_jobs` had no in-flight `pending`, `queued`, `preparing`, or `running` jobs.
- `content_generation_jobs` had one stale `running` job started at `2026-05-21 04:19:32+08`; no database mutation was made to that job during this release.

## Release Steps

1. Created `/tmp/jingjing-a4be02e.tar` from `git archive a4be02e`.
2. Uploaded it to `/tmp/jingjing-a4be02e.tar` on the ECS.
3. Created `/srv/jingjing-domestic/releases/20260521161200-a4be02e`.
4. Extracted the archive and set release ownership to `ubuntu:ubuntu`.
5. Re-applied the idempotent migration:
   `app/db/migrations/202605200001_member_multi_team_auth.sql`.
6. Built the app on the server:

```text
cd /srv/jingjing-domestic/releases/20260521161200-a4be02e/app
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

7. Switched `/srv/jingjing-domestic/current` to the new release.
8. Restarted:
   - `jingjing-domestic-app.service`
   - `jingjing-content-generation-worker.service`
   - `jingjing-firered-openstoryline.service`
   - `jingjing-openstoryline-engine.service`
   - `jingjing-video-worker.service`
9. Reloaded `nginx.service`.

## Verification

Delayed service status after release:

```text
nginx: active
jingjing-domestic-app.service: active
jingjing-content-generation-worker.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
```

Health checks:

```text
http://8.154.28.41/api/health: ok, database=postgres, storage=aliyun_oss
http://127.0.0.1:3000/api/health: ok, database=postgres, storage=aliyun_oss
http://127.0.0.1:8000/ready: ready, engine_adapter=fire_red
http://127.0.0.1:7860/api/ready: ready, tool_count=21, render_video_available=true
http://8.154.28.41/login: 200
http://8.154.28.41/member/login: 200
```

Server build result:

```text
corepack pnpm@10.20.0 install --frozen-lockfile: passed
corepack pnpm@10.20.0 build: passed
```

## Not Done

- No real video job was started.
- No Dify content generation job was started.
- The stale `content_generation_jobs.running` row was not changed.
- No DNS, HTTPS, ICP, RDS public access, OSS public permission, or env value changes were made.
