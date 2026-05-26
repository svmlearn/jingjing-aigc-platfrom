# 2026-05-26 zhiluan1 CN material search release

## Scope

- User / merchant: `zhiluan1` / `厂房宣传`.
- Working branch: `codex/merchant-material-prefetch-fix`.
- Target remote branch: Gitee `5.26-worker-fix`.
- Required release style: clean release from committed Git tree; no hot patching under `/srv/jingjing-domestic/current`.
- Goal: app no longer sends preselected material choices to worker; FireRed/OpenStoryline must keep `search_media.search_keyword` as the Chinese scene query from `sceneAssetQueries` and must not translate it into English labels.
- Script data scope: shorten only the `2026-05-27` zhiluan1 factory script after release by running the released patch script with `--task-date=2026-05-27`; do not batch-shorter every 2026-05-25 to 2026-05-31 task.

## Local Fix

- App payload no longer includes runtime preselection fields:
  - `merchantMediaMatches`
  - `assetMatchPlan`
  - confirmed material ids / selection mode fields
- Video job service no longer fetches merchant clip candidates or workbench material references while building the worker payload.
- `sceneAssetQueries[].query` now prefers production scene `materials` and `fallbackShot`; this preserves already-classified Chinese material tags such as `一楼厂房`, `货梯入口`, `管理服务站`, `消防疏散图`.
- FireRed prompt now explicitly says:
  - use `ProductionDirective.material_context.sceneAssetQueries[].query` verbatim;
  - do not translate Chinese query text into English;
  - do not use `tags/category/filter/filter_include/filter_exclude`.
- FireRed MCP interceptor now canonicalizes private `search_media` calls back to the Chinese scene query and strips tags/category/filter args before the tool reaches the private media library.
- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs` now accepts `--task-date=2026-05-27` and its canonical factory script has shorter `台词/字幕`, with `targetDurationSeconds=48`.

## Local Validation

Passed:

```powershell
cd app
$env:NODE_OPTIONS='--conditions=react-server'
npm exec --yes tsx -- --test src/server/api/video-job-payload.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/server/api/private-media-pexels-service.test.ts
```

Result: `37` passed.

```powershell
cd app
npm run typecheck
```

Result: passed.

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src'
python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_status_contract.py -q
```

Result: `126` passed.

```powershell
cd app
$env:NODE_OPTIONS='--conditions=react-server'
npm exec --yes tsx -- --test src/lib/private-media-workflow-fixture.test.ts
```

Result: `1` passed.

Static no-prefetch gate:

```powershell
rg -n "list_video_material_input_assets|material_input_assets|_download_material_library_inputs|material_library_inputs_downloaded|material_library_asset_ids|merchantMediaMatches|assetMatchPlan" app\src\server\api\video-job-payload.ts workers\video-worker\worker workers\video-worker\openstoryline -g "*.ts" -g "*.py"; if ($LASTEXITCODE -eq 1) { exit 0 } else { exit $LASTEXITCODE }
```

Result: passed, no matches.

## Release Plan

This file is created before server release so the branch commit carries the handoff evidence. Final server facts must be appended after release and real run.

Planned order:

1. Commit local branch.
2. Push branch to Gitee `5.26-worker-fix`.
3. Merge into local `main`.
4. Push local `main` to Gitee.
5. Build and activate a clean release under `/srv/jingjing-domestic/releases/<timestamp>-<sha>`.
6. From the released code path, dry-run then apply only the 2026-05-27 script patch:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --task-date=2026-05-27
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --task-date=2026-05-27 --apply
```

7. Run the `zhiluan1` / `厂房宣传` 2026-05-27 video task from the released code.
8. Confirm FireRed logs show Chinese `search_media.search_keyword`.
9. Confirm `final_video` exists.

## Pending Release Evidence

- Remote branch update: pending.
- Local main merge: pending.
- clean release path: pending.
- 2026-05-27 script patch result: pending.
- zhiluan1 job id: pending.
- `search_media.search_keyword` Chinese log evidence: pending.
- `final_video`: pending.
