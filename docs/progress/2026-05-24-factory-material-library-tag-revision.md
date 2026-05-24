# 2026-05-24 Factory Material Library Tag Revision

## Scope

This note records the local review package, production table discovery, and release-time patch plan for the factory promotion material library used by team `厂房宣传`.

Target merchant:

- `merchant_id`: `e7c94a17-cf7d-4eb2-8178-13daa780551a`
- member context used by the current video task: `zhiluan1`, user id `0b3351a6-778b-4e79-b5f1-6aa18fdb0020`
- branch: `5.23-worker-fix`

## Local Package Archive

Original package was kept unchanged:

- `D:\Desktop\测试素材\cos素材库入库包_20260522_厂房招商`
- archive copy: `D:\Desktop\测试素材\cos素材库入库包_20260522_厂房招商_原始留档_20260524_180838`

Revised local package:

- `D:\Desktop\测试素材\cos素材库入库包_20260522_厂房招商_标签修正版_20260524_180838`
- full diff: `D:\Desktop\测试素材\cos素材库入库包_20260522_厂房招商_标签修正版_20260524_180838\全量修改对照_20260524.md`
- summary: `D:\Desktop\测试素材\cos素材库入库包_20260522_厂房招商_标签修正版_20260524_180838\标签修正总结_20260524.md`

Media files were not edited. The revised package changes metadata and manifest labels only.

## Tagging Rule

The revised labels follow the Pexels-style rule: tag what is visible in the shot first, then keep business facts out of per-clip searchable labels unless directly visible in the frame.

Examples of facts intentionally removed from broad per-clip tags:

- `2000平`
- `层高5.56米`
- `到梁5米`
- `一个厂3个车位`
- `2栋宿舍、1栋公寓`
- generic `招商主卖点` labels on every clip

Important user correction:

- `环境/4fd14cd4421d3ea08073180c1a18af3e.mp4` is `平峦山公园周边环境道路`, not the mountain long-shot clip.
- `环境/5165c70ee2e6914393cbe44a6d1ff17f.mp4` is `平峦山山体远景与园区周边环境` and should retain strong `平峦山` / `山体远景` retrieval labels.

## Production Table Discovery

The current production material library does not use `public.merchant_media_assets` / `public.merchant_media_clips`; a read-only relation check failed because those tables are absent in production.

Current material truth source is:

- `public.source_items`
- `public.asset_objects`

Existing 27 factory material records are `source_items` rows where `trace_payload @> {"materialLibrary": true}` for the target merchant, with `asset_objects.owner_type = 'source_item'` video rows attached.

The worker retrieval path reads:

- app side: `app/src/lib/db/material-library-repository.ts`
- worker side: `workers/video-worker/worker/app/db.py`, function `list_video_material_input_assets`

The worker indexes `source_items.title`, `source_items.script_text`, `asset_objects.storage_key`, plus strings inside `structure_summary`, `engagement_snapshot`, and `trace_payload`. Therefore the fix must update `source_items` JSON/text fields, not only a legacy manifest.

## Local Code Change

Added:

- `app/scripts/data/factory-material-tags-20260524.json`
  - embedded 27 revised clip records derived from the local revised package
  - keeps server execution independent from the Windows Desktop package path
- `app/scripts/patch-factory-material-library-tags.mjs`
  - dry-run by default; transaction rolls back without `--apply`
  - updates only `public.source_items`
  - matches existing rows by `trace_payload.materialAnalysis.sourceRelativePath`, `originalFilename`, `assetId`, `clipId`, or attached `asset_objects.storage_key`
  - fails if matching is not exactly 27 clips
  - updates `title`, `script_text`, `structure_summary`, `trace_payload`, and nested `trace_payload.materialAnalysis`
  - preserves existing row identity and attached `asset_objects`
  - writes revision marker `factory_material_tags_pexels_style_20260524`

`script_text` is kept to visible-shot description, visible labels, and query hints only, so broad sales facts do not pollute worker retrieval scoring.

## Release-Time Command Shape

Do not apply from a random local checkout and do not directly hot-update production data.

Expected flow:

1. Commit on local branch `5.23-worker-fix`.
2. Push branch to Gitee.
3. Deploy normal server release from the pushed branch.
4. Run dry-run from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-factory-material-library-tags.mjs --env-file /srv/jingjing-domestic/shared/env/app.env
```

5. If dry-run confirms 27 exact matches, apply from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-factory-material-library-tags.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

6. Read back the 27 source items and verify:

- all expected rows have `revisionMarker = factory_material_tags_pexels_style_20260524`
- `4fd14cd4421d3ea08073180c1a18af3e.mp4` is tagged as `平峦山公园周边道路` / `林荫道路`
- `5165c70ee2e6914393cbe44a6d1ff17f.mp4` is tagged as `平峦山远景` / `山体远景`
- broad business facts are not repeated across unrelated per-clip `tags`, `queryHints`, or `script_text`

## Local Validation

Completed before commit:

- `node --check app/scripts/patch-factory-material-library-tags.mjs`
- `node -e` readback of `app/scripts/data/factory-material-tags-20260524.json`
  - count: 27
  - `4fd14cd4421d3ea08073180c1a18af3e.mp4`: `平峦山公园周边林荫道路`
  - `5165c70ee2e6914393cbe44a6d1ff17f.mp4`: `平峦山山体远景与园区周边环境`
- `git diff --check`

Server dry-run/apply and readback must be recorded after the branch is pushed and released.
