# 2026-05-22 factory member video BGM and glm-5.1 release

## Scope

- Prepare member-side factory promotion video tasks for `zhiluan1` in team `厂房宣传`.
- Keep the original Dify/source script chain unchanged.
- Enable BGM for the two factory test scripts through task-level `recommendedProductionConfig`.
- Change FireRed/OpenStoryline worker LLM runtime model to `glm-5.1` through `worker.env`.

## Source

- Branch: `codex/member-factory-video-upload-bgm`
- Released commit: `9e771a00dc47cf39bc65b629f913d1ea1b2dabd5`
- Gitee branch pushed: `codex/member-factory-video-upload-bgm`

## Code Changes

- Member video creation reads task-level BGM recommendation only when `videoTask.memberUploadPolicy === "talking_head_required_only"`.
- Daily task DTO/repository now preserves:
  - `recommendedProductionConfig`
  - `memberUploadPolicy`
- Added `app/scripts/fix-factory-member-video-tasks.mjs`.
  - Clones the existing source Dify draft/variant to `zhiluan1`.
  - Updates only the member daily tasks for the target dates.
  - Marks only talking-head scenes as member-upload-required.
  - Leaves source Dify tasks unchanged.
- Added domestic migration for `content_variants.production_scenes`.
- Updated worker env examples to default FireRed LLM model to `glm-5.1`.

## Local Verification

- `corepack pnpm@10.20.0 typecheck`: passed.
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed.
- `git diff --check`: passed.
- Server dry-run of data script: passed with transaction rollback.
  - Target task ids:
    - `56c7f587-344d-4977-b387-c10380c5662b`
    - `39946899-d5ec-45a1-9203-18799554da24`
  - Required scenes after transformation: `[1, 5]`.
  - BGM enabled with volume `0.22`.
  - Clone count after dry-run rollback: `0`.

## Server Release

- New release: `/srv/jingjing-domestic/releases/20260522193941-9e771a0`
- Current symlink after release:
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260522193941-9e771a0`
- Applied migration:
  - `app/db/migrations/202605220001_content_variant_production_scenes.sql`
- Build:
  - `corepack pnpm@10.20.0 install --frozen-lockfile`: passed.
  - `corepack pnpm@10.20.0 build`: passed.
- Worker env changed:
  - File: `/srv/jingjing-domestic/shared/env/worker.env`
  - Changed only `OPENSTORYLINE_LLM_MODEL=glm-5.1`
  - Backup: `/srv/jingjing-domestic/backups/worker.env.before-glm51-20260522T194216`
- Release ownership was corrected to `ubuntu:ubuntu` because FireRed runs as `ubuntu` and needs to create runtime symlinks inside the release directory.

## Data Fix Applied

Command:

```bash
node scripts/fix-factory-member-video-tasks.mjs --apply
```

Results:

| Target task | Title | Draft | Variant | Required scenes | BGM |
| --- | --- | --- | --- | --- | --- |
| `56c7f587-344d-4977-b387-c10380c5662b` | 找厂房，先看这三个点 | `7758b270-ccfc-4829-a0b2-6f833e386e50` | `4d3dcf7e-d1e6-458d-a9a5-66e41b0cceb6` | `[1, 5]` | enabled |
| `39946899-d5ec-45a1-9203-18799554da24` | 一楼2000平厂房，重点看层高和空间 | `dcc3f0b5-2101-4bf8-9137-7f20dda236d4` | `38d0eefd-6750-4aeb-83e6-e702236d2d58` | `[1, 5]` | enabled |

Source tasks remained unchanged:

- `18451440-8ebe-4fe0-bd5f-d3391741fd11`: source required scenes still `[1, 2, 3, 4, 5]`.
- `11ea1851-918d-4211-a1fa-02a3add73993`: source required scenes still `[1, 2, 3, 4, 5]`.

## Verification

- Services active:
  - `nginx.service`
  - `jingjing-domestic-app.service`
  - `jingjing-content-generation-worker.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`
- Health:
  - `http://8.154.28.41/api/health`: ok, database `postgres`, storage `aliyun_oss`.
  - `http://127.0.0.1:8000/ready`: ready, `engine_adapter=fire_red`.
  - `http://127.0.0.1:7860/api/ready`: ready, `tool_count=21`, `render_video_available=true`.
  - `http://8.154.28.41/member/login`: 200.
  - `http://8.154.28.41/login`: 200.
- Worker model check:
  - `OPENSTORYLINE_LLM_MODEL=glm-5.1`
- Video jobs:
  - In-flight `video_edit_jobs`: `0`.
  - No video edit job was started during this release.

## Notes

- `app.env` was not changed.
- Platform settings were not changed:
  - `platform_settings.llm_runtime`
  - `consultation_agent`
  - `script_production_agent`
- Original Dify source tasks/drafts were not modified; the member tasks point to cloned drafts owned by `zhiluan1`.
