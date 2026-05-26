# 2026-05-26 zhiluan1 factory script search fix release

## Scope

- Local implementation branch: `codex/zhiluan1-factory-script-search-fix`
- Released code commit: `aff43a444571`
- Remote updated before release: `origin/5.26-worker-fix -> aff43a444571`
- Target server: `meng@8.154.28.41:/srv/jingjing-domestic`
- Release method: clean release directory from local `git archive`; no hot patch under `/srv/jingjing-domestic/current`.

This document was written after release as docs-only follow-up evidence. It should not trigger a second deploy.

## Release Record

- Local archive: `D:\codexplan\jingjing-release\jingjing-aff43a444571.tar`
- Server archive: `/tmp/jingjing-aff43a444571.tar`
- Previous release: `/srv/jingjing-domestic/releases/20260526162411-17cd93e`
- New release: `/srv/jingjing-domestic/releases/20260526194805-aff43a4`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526194805-aff43a4`

Build commands run on server:

```bash
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

Result: install and build passed.

## Service Restart

Restarted:

- `jingjing-domestic-app.service`
- `jingjing-content-generation-worker.service`
- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`
- `nginx.service` reloaded

Final status:

- `nginx.service`: active
- `jingjing-domestic-app.service`: active
- `jingjing-content-generation-worker.service`: active
- `jingjing-firered-openstoryline.service`: active
- `jingjing-openstoryline-engine.service`: active
- `jingjing-video-worker.service`: active

## Health Checks

- `curl -fsS http://127.0.0.1:3000/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- `curl -fsS http://127.0.0.1:8000/ready`: ready, FireRed adapter ready.
- `curl -fsS http://127.0.0.1:7860/api/ready`: ready, `render_video_available=true`.
- `curl -fsS http://8.154.28.41/api/health`: ok, database `postgres`, storage `aliyun_oss`.
- Server `node scripts/check-domestic-app-env.mjs --env-file /srv/jingjing-domestic/shared/env/app.env`: ok, including `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`.

## zhiluan1 Patch Apply

The zhiluan1 script patch was run from the released code path only after the new release became active:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

Result:

- `mode`: `applied`
- `productionSceneCount`: `6`
- `talkingHeadSceneNumbers`: `[1, 6]`
- `totalDisplayDurationSeconds`: `60`

Database readback confirmed:

- `daily_content_tasks.video_task.generatedVideoScript.targetDurationSeconds`: `60`
- generated script scene count: `6`
- `content_variants.production_scenes` scene count: `6`
- scene 5 time range: `00:38-00:47`
- scene 5 materials:
  - `消防疏散图`
  - `楼层索引`
  - `货梯入口`
  - `电梯轿厢`
  - `管理服务站`
  - `管理处`
- scene 5 fallback shot: `消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处`

## Worker Env Check

No LLM model change was made in this task. Server readback after restart:

- `OPENSTORYLINE_LLM_MODEL=qwen3.7-max`
- `ALIYUN_VIDEORETALK_API_KEY=SET`

The VideoRetalk key value was not printed.

## Notes

- `origin/main` was not pushed.
- The code release is commit `aff43a444571`.
- Any docs-only commit after this release is a record update and is not deployed unless a future release is explicitly requested.
