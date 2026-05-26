# 2026-05-24 zhiluan1 copy script forward

## Scope

- Merchant: `e7c94a17-cf7d-4eb2-8178-13daa780551a`
- Member: `zhiluan1`
- Member user id: `0b3351a6-778b-4e79-b5f1-6aa18fdb0020`
- Source task date: `2026-05-23`
- Target task dates: `2026-05-24` to `2026-05-31`
- Branch: `5.23-worker-fix`

## Pre-patch readback

Production DB readback showed:

- `2026-05-23` has the approved factory video script:
  - daily task: `39946899-d5ec-45a1-9203-18799554da24`
  - draft: `36fa1e4f-1c92-40e3-a8cd-f228b5e799ae`
  - variant: `3ff39eeb-e9b8-445d-827a-4d19595b28b3`
  - title: `找厂房，别只看租金`
  - `generatedVideoScript.scenes`: `6`
  - `content_variants.production_scenes`: `6`
  - `memberUploadPolicy`: `talking_head_required_only`
  - `recommendedProductionConfig`: BGM, render, lipSync, subtitles, voiceover
- `2026-05-24` to `2026-05-31` already have daily tasks, but they were still generic placeholder video tasks:
  - title pattern: `今日视频：真人口播讲项目机会 ...`
  - `generatedVideoScript.scenes`: `4`
  - no `contentDraftId`
  - no `contentVariantId`
  - no `recommendedProductionConfig`
  - no `memberUploadPolicy`

## Local patch

Added:

- `app/scripts/patch-zhiluan1-copy-yesterday-script-forward.mjs`

Patch behavior:

- Dry-run by default; writes only with `--apply`.
- Reads the source `2026-05-23` task, draft, and video script variant from production DB.
- Validates source script completeness before writing:
  - source video generation status is `succeeded`
  - generated script scenes exist
  - `production_scenes` exist
  - generated scene count equals production scene count
  - `recommendedProductionConfig` exists
  - `memberUploadPolicy` exists
  - `script_text` exists
- Requires target daily tasks to exist for every date in the range.
- Creates one independent `content_drafts` row and one independent `content_variants` row for each target date.
- Updates each target `daily_content_tasks.video_task` to point to that date's cloned draft/variant.
- Copies necessary structure and parameters:
  - `generatedVideoScript`
  - `memberUploadPolicy`
  - `recommendedProductionConfig`
  - `content_variants.script_text`
  - `content_variants.production_scenes`
  - `team_calendar_source.difyContractAudit`
  - `knowledge_refs`
  - `material_refs`
- Adds `scriptCopyProvenance` to task, draft, and variant linkage metadata.
- Does not copy uploaded draft input videos, rendered result assets, or `video_edit_jobs`.

Safety behavior:

- If a target date already points to another draft/variant, the script stops by default.
- Replacing an existing linked target requires explicit `--force-replace-linked`.
- Re-running after a successful apply refreshes the clones created by this patch instead of creating duplicates.

## Verification

- `node --check app/scripts/patch-zhiluan1-copy-yesterday-script-forward.mjs`: passed.

## Dry-run correction

The first server dry-run from release `20260524195000-5b57a21` rolled back before writing and reported `2026-05-31` as missing. Root cause: PostgreSQL `date` values are parsed by Node as `Date`; using `toISOString()` can shift a local date one day earlier under the server timezone. The script was corrected to format `Date` values with local `getFullYear() / getMonth() / getDate()` instead.

## Release/apply status

- Local commit pushed to Gitee branch `5.23-worker-fix`.
- Final commit used for script release/apply: `458600f6d3219a2ba1604e65f2229c634b5f45ea`.
- Final server release path: `/srv/jingjing-domestic/releases/20260524195600-458600f`.
- `current` symlink after release: `/srv/jingjing-domestic/releases/20260524195600-458600f`.
- Build passed with `corepack pnpm@10.20.0 build`.
- Services restarted and verified active:
  - `jingjing-domestic-app.service`
  - `jingjing-content-generation-worker.service`
  - `jingjing-firered-openstoryline.service`
  - `jingjing-openstoryline-engine.service`
  - `jingjing-video-worker.service`
  - `nginx.service`
- Health checks passed:
  - `http://127.0.0.1:3000/api/health`
  - `http://127.0.0.1:8000/ready`
  - `http://127.0.0.1:7860/api/ready`

## Apply result

Applied from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-copy-yesterday-script-forward.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

Affected target dates:

| task date | daily task | cloned draft | cloned variant |
| --- | --- | --- | --- |
| `2026-05-24` | `27307400-fbb2-4b8f-8cfa-2a3a8199543b` | `2372a941-15c3-49e4-b377-58b74f37c51e` | `cae7632a-749c-47f6-872c-30b2a7210e3f` |
| `2026-05-25` | `025cd5eb-b296-4f65-8df9-c026620175c6` | `8b965a2d-43c0-4721-afee-181cf6f9ad7c` | `a262fc8d-341a-4ff2-b3ae-8a7b7959bb6d` |
| `2026-05-26` | `d9b7e24f-3fb2-4192-9ca4-7a96ef1a12d7` | `20acde99-90b4-4b71-9944-77036efb2507` | `139c616a-e0b4-4ca4-aa5d-16a2ccb3603c` |
| `2026-05-27` | `d1e1aa55-9125-4601-b5a6-c16a2754f64d` | `3025da0f-b270-438c-992c-8881000496ee` | `97b753ff-e38b-44c4-aaeb-218179fdb199` |
| `2026-05-28` | `07fc7aaa-5913-460b-949c-e51673774ee0` | `62c7f739-c9b0-4c74-82ca-177eaa114347` | `4d8c59e4-1bd2-4553-a368-d60743ad9c79` |
| `2026-05-29` | `83f52a00-00b1-4f9f-a672-e954bb99b147` | `f380ed6b-976e-476d-ad1d-79ea4aa16963` | `8a8849c5-5947-4c18-b1df-8f942dcee3b8` |
| `2026-05-30` | `9de5a75f-d9ae-4e45-b93a-f828690422d3` | `50a59f73-9866-48d9-a86a-4ed698cb1951` | `d12c1f32-0406-4c5c-939d-777eefec1323` |
| `2026-05-31` | `56cebe2d-d28b-4587-86a4-d01cb2d69f29` | `4418a011-f084-4ee3-83ae-21659d90cfa9` | `fb74a055-f68d-4512-976f-9982ba11fa28` |

Readback after apply:

- All target dates now have title `找厂房，别只看租金`.
- All target dates now have theme `一楼厂房主推`.
- All target dates now have `daily_content_tasks.status = video_script_created`.
- All target dates have `generatedVideoScript.scenes = 6`.
- All cloned variants have `production_scenes = 6`.
- All target dates have required talking-head scene orders `[1, 6]`.
- All target dates have `targetDurationSeconds = 64`.
- All target dates have `memberUploadPolicy = talking_head_required_only`.
- All target dates have `recommendedProductionConfig` keys:
  - `bgm`
  - `render`
  - `lipSync`
  - `subtitles`
  - `voiceover`
- Each target date has an independent draft and independent variant; readback confirmed `uniqueDraftCount = 8` and `uniqueVariantCount = 8` for `2026-05-24` to `2026-05-31`.
- The cloned target drafts/variants have no copied uploaded draft input assets, no copied rendered result assets, and no copied `video_edit_jobs`.

Consequence:

- The member calendar now shows the approved factory script on `2026-05-24` through `2026-05-31`.
- Future video generation from those dates will start from the copied script and production parameters, but will not reuse yesterday's rendered video outputs.
