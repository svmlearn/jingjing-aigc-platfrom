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

- Pending commit, Gitee push, release, server dry-run, server apply, and readback.
