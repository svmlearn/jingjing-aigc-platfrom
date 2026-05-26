# 2026-05-26 zhiluan1 factory script search fix handoff

## Goal

Finish the `厂房宣传` / `zhiluan1` factory video script correction and worker private material search guard, then release through the normal committed-source server group flow. Do not hot-update the active server release.

## Current Branch

- Branch: `codex/zhiluan1-factory-script-search-fix`
- Base: local `main`
- Remote target after merge: `origin/5.26-worker-fix`
- Server release: completed with clean release `/srv/jingjing-domestic/releases/20260526194805-aff43a4`

## What Changed

- The zhiluan1 factory script is now a 60-second, six-scene script with searchable terms matched to known factory material:
  - one-floor factory space
  - fire/power/signage details
  - sixth-floor supplemental space
  - freight elevator / floor index / management office
  - dormitory, apartment, e-bike, and parking support
- The script patch and future-task template both use the same canonical scene spec.
- Structured production scenes now carry search keywords in `materials` and `fallbackShot`, so app payload generation can build useful `sceneAssetQueries`.
- Worker private `search_media` strips Agent-provided duration/orientation filters and forces video-only top 10.
- FireRed private Pexels-compatible video filtering allows short and long private clips when no duration bounds are explicitly provided.
- Worker rejects a third search attempt for the same scene as `scene_material_insufficient` instead of allowing a long OpenStoryline timeout.
- `group_clips` keeps `clip_id` values unique across groups, so repeated model output does not reuse the same material in multiple scenes.
- `lip_sync` remains clip/segment scoped to `talking_head`; factory B-roll such as management office, elevator, dormitory, apartment, parking, and facade clips does not enter retalk.

## Changed Files

- `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
- `app/scripts/fix-factory-member-video-tasks.mjs`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/search_media.py`
- `workers/video-worker/tests/test_firered_group_clips_contract.py`
- `workers/video-worker/tests/test_firered_node_interceptors.py`
- `workers/video-worker/tests/test_firered_search_media_private_base_url.py`
- `docs/progress/2026-05-26-zhiluan1-factory-script-search-fix.md`
- `docs/handoff/2026-05-26-zhiluan1-factory-script-search-fix-handoff.md`

## Validation

Completed:

- `node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`: passed
- `node --check app/scripts/fix-factory-member-video-tasks.mjs`: passed
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py -q`: `42 passed`
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py -q`: `47 passed`
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py -q`: `10 passed`
- `PYTHONPATH=workers/video-worker;workers/video-worker/openstoryline python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_status_contract.py -q`: `125 passed`
- Final combined worker regression including group/lip-sync proof: `135 passed`
- `NODE_OPTIONS=--conditions=react-server npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/lib/private-media-workflow-fixture.test.ts`: `12 passed`
- `cd app && npm run typecheck`: passed
- `git diff --check`: passed, with Windows line-ending warnings only

Worker checks were re-run after adding FireRed private duration-bound tests.

## Release Result

- Local `main` fast-forwarded to `aff43a444571`.
- Pushed local `main` to Gitee `origin/5.26-worker-fix`; `origin/main` was not pushed.
- Built and released from local archive `D:\codexplan\jingjing-release\jingjing-aff43a444571.tar`.
- New server release: `/srv/jingjing-domestic/releases/20260526194805-aff43a4`.
- `/srv/jingjing-domestic/current` points to the new release.
- App, content worker, FireRed, OpenStoryline engine, video worker, and nginx were active after restart.
- Health checks passed for local app, OpenStoryline `/ready`, FireRed `/api/ready`, and public `/api/health`.
- The zhiluan1 patch was applied from the released code path after release activation.
- DB readback confirmed 60 seconds, 6 generated scenes, 6 production scenes, and scene 5 materials `消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处`.

See `docs/progress/2026-05-26-zhiluan1-factory-script-search-fix-release.md` for the release log.

## Release Procedure

1. Commit the branch after all local validation passes.
2. Switch to local `main`.
3. Fast-forward merge:

```bash
git merge --ff-only codex/zhiluan1-factory-script-search-fix
```

4. Push local `main` to Gitee worker branch only:

```bash
git push origin main:5.26-worker-fix
```

5. Build a clean release archive from the final local `main` commit.
6. Deploy into a new `/srv/jingjing-domestic/releases/<timestamp>-<sha>` directory.
7. Run install/build in the new release directory.
8. Switch `/srv/jingjing-domestic/current` only after build passes.
9. Restart services and verify health.
10. Apply the zhiluan1 script patch from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

11. Read back `daily_content_tasks.video_task.generatedVideoScript`, `content_variants.script_text`, and `content_variants.production_scenes`.

## Notes

- This work does not change the LLM model.
- This work preserves the no duplicate material reuse rule and adds explicit regression proof.
- This work does not create a new video job during release.
- The management-station clip `管理处.mp4` remains a short proof shot; scene 5 should be assembled as a fast-cut set with signage, elevator/freight-elevator, and management-service clips.
