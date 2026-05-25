# 2026-05-25 OpenStoryline scene query coverage progress

## Scope

Worktree: `D:\codexplan\jingjingstart-5.23-worker-lip`

Branch: `5.23-worker-fix`

This pass only changed the local branch. It did not hot-update any server directory and did not touch `/srv/jingjing-domestic/current`.

## Implemented

- Restored the FireRed worker prompt to the project's original structure:
  - keep unattended worker authorization and no-confirmation instructions
  - keep a lightweight task line that tells FireRed to call `search_media` when uploaded media does not visually cover the full locked script
  - keep locked script, worker instruction, input assets, desired outputs, and `ProductionDirective`
  - keep current project capabilities in payload fields such as `production_config`, `service_config`, and private search config, not in prompt wording
- Removed prompt-level tool/source/security/failure instructions from the new prompt text:
  - no `sceneAssetQueries` coverage instruction
  - no official Pexels wording
  - no `scene_material_insufficient`
  - no search parameter/page/count instructions
  - no production node sequence such as `generate_voiceover`, `select_bgm`, `plan_timeline`, `lip_sync`, or ASR
  - no wording about compressing scenes, shortening scripts, reducing voiceover, slow motion, or partial rendering
- Added FireRed search diagnostics:
  - `search_media` results are annotated with `_worker_scene_search` containing matched scene index/query and result count.
  - `load_media` continues to merge all session search results.
- Added code-level gates instead of prompt-level judgment:
  - FireRed blocks `generate_script` when `group_clips.groups` is already fewer than the required locked scene count.
  - Worker final validation checks generated script group count, voiceover segment count, and timeline group coverage against `sceneAssetQueries` / locked script scene count.
  - Worker maps those failures to `scene_material_insufficient` at the `scene_material_validation` stage.
- Preserved existing timeline quality checks for slowdown and partial timeline risks in code, not in prompt.

## Verification

Python focused tests:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py
```

Result before the prompt restoration follow-up: `107 passed in 3.55s`

Follow-up focused regression after restoring the original prompt structure:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_firered_node_interceptors.py
```

Result: `104 passed in 3.78s`

App route tests:

```powershell
$env:NODE_OPTIONS='--conditions=react-server'
npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts
```

Result: `7 pass, 0 fail`

App typecheck:

```powershell
cd app
npm run typecheck
```

Result: passed.

Additional check:

```powershell
git diff --check
```

Result: no whitespace errors.

## Delivery Notes

- Untracked `jingjing-*.tar` files were left local and must not be staged.
- The untracked implementation-plan handoff file was left uncommitted because this delivery records the actual implemented behavior in this progress file.
- Next step: stage only the implementation files, tests, and this progress file; commit and push to `origin 5.23-worker-fix`.
