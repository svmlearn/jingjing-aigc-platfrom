# 2026-05-26 zhiluan1 visible script batch fix release

## Scope

- Local implementation branch: `codex/zhiluan1-visible-script-batch-fix`
- Released code commit: `b749d3536002`
- Remote updated before release: `origin/5.26-worker-fix -> b749d3536002`
- Target server: `meng@8.154.28.41:/srv/jingjing-domestic`
- Release method: clean release directory from local `git archive`; no hot patch under `/srv/jingjing-domestic/current`.

This document is a docs-only release record written after the release. It should not trigger a second deployment.

## Reason

After release `aff43a4`, the frontend still showed the old zhiluan1 scene 5 script:

- old title: `园区管理和公共配套`
- old wording included `厂区平面图` and `管理信息`

The cause was not frontend cache. The previous patch script updated only one fixed daily task, while the member UI could open later `zhiluan1` factory tasks that still had the old script.

## Release Record

- Local archive: `D:\codexplan\jingjing-release\jingjing-b749d3536002.tar`
- Server archive: `/tmp/jingjing-b749d3536002.tar`
- Previous release: `/srv/jingjing-domestic/releases/20260526194805-aff43a4`
- New release: `/srv/jingjing-domestic/releases/20260526201406-b749d35`
- Current symlink after release: `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526201406-b749d35`

Build commands run on server from the app directory:

```bash
cd /srv/jingjing-domestic/releases/20260526201406-b749d35/app
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

Result: install and build passed.

Note: an initial build attempt from the release root failed with `ERR_PNPM_NO_PKG_MANIFEST` because `package.json` is under `app/`. The build was rerun from `app/` and passed.

## Service Restart

Restarted:

- `jingjing-domestic-app.service`
- `jingjing-content-generation-worker.service`
- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`
- `nginx.service` reloaded

During first restart, FireRed failed to create:

```text
/srv/jingjing-domestic/current/workers/video-worker/openstoryline/firered/.storyline
```

Reason: the new release directory was owned by `meng:meng`, but FireRed/OpenStoryline/video-worker services run as `ubuntu:ubuntu`. The release directory ownership was corrected to `ubuntu:ubuntu`, matching the previous release, then video services were restarted.

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

## Batch Script Apply

Dry-run was executed first from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --all-matching-factory-tasks
```

Dry-run result:

- `mode`: `dry-run`
- `targetCount`: `9`
- first target was already corrected
- 8 later targets had previous scene 5 title `园区管理和公共配套`
- patched scene 5 title for all targets: `园区公共配套`

Apply command:

```bash
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --all-matching-factory-tasks --apply
```

Apply result:

- `mode`: `applied`
- `targetCount`: `9`
- `productionSceneCount`: `6`
- `talkingHeadSceneNumbers`: `[1, 6]`

## Database Readback

Post-apply readback found 9 matching `zhiluan1` factory tasks. For every row:

- `targetDurationSeconds`: `60`
- generated scene count: `6`
- production scene count: `6`
- scene 5 title: `园区公共配套`
- scene 5 materials:
  - `消防疏散图`
  - `楼层索引`
  - `货梯入口`
  - `电梯轿厢`
  - `管理服务站`
  - `管理处`
- `content_variants.script_text` no longer contains old scene title `园区管理和公共配套`.
- `content_variants.script_text` no longer contains old keyword `厂区平面图`.

Matching task ids:

- `39946899-d5ec-45a1-9203-18799554da24`
- `27307400-fbb2-4b8f-8cfa-2a3a8199543b`
- `025cd5eb-b296-4f65-8df9-c026620175c6`
- `d9b7e24f-3fb2-4192-9ca4-7a96ef1a12d7`
- `d1e1aa55-9125-4601-b5a6-c16a2754f64d`
- `07fc7aaa-5913-460b-949c-e51673774ee0`
- `83f52a00-00b1-4f9f-a672-e954bb99b147`
- `9de5a75f-d9ae-4e45-b93a-f828690422d3`
- `56cebe2d-d28b-4587-86a4-d01cb2d69f29`

## Frontend Testing Gate

Frontend testing can proceed after refreshing the member video page. If the page still shows the old scene 5 text, it is not reading one of the 9 corrected task ids above and the task URL/id should be checked directly.
