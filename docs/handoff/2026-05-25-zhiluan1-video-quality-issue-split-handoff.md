# 2026-05-25 zhiluan1 video quality gate handoff

## Goal

Implement the first batch of zhiluan1 video quality gates without changing material matching.

This batch only enforces:

- video material must not be stretched with `playback_rate < 1.0`;
- talking-head timeline segments must be covered by lip-sync/retalked output and voiceover windows;
- obvious subtitle tail gaps must fail, while small B-roll tail gaps remain allowed.

Material mismatch, including first-floor scene selecting sixth-floor material, is explicitly out of scope for this batch.

## Branch And Release State

- Workspace: `D:\codexplan\jingjingstart`
- Working branch: `codex/5.23.1.video-fix`
- Target remote branch: `5.23-worker-fix`
- Main merge: not performed by request
- Main push: not performed by request
- Server release: not performed
- Hot update: not performed
- Fallback logic: none added

## Completed Changes

- `plan_timeline.py`: video source duration shortage now raises `scene_material_insufficient` instead of generating slow playback.
- `plan_timeline_pro.py`: video duration expansion now raises `scene_material_insufficient`; normal speed remains `1.0` when source duration is sufficient.
- `render_video.py`: render rejects any video segment with `playback_rate < 1.0` using `timeline_video_slowdown_blocked`.
- `processor.py`: before marking a job succeeded, validates timeline quality:
  - rejects `playback_rate < 1.0`;
  - rejects obvious subtitle tail gap with `timeline_subtitle_tail_gap_too_long`;
  - rejects talking-head without retalked coverage with `lip_sync_talking_head_unretalked`;
  - rejects talking-head without voiceover coverage with `lip_sync_talking_head_voiceover_window_gap`;
  - uses `split_shots.clips` metadata as evidence when timeline segments do not carry `role/tags` directly.
- Tests added for the above contracts.

## Explicitly Not Changed

- No `db.py` material metadata/query changes were kept.
- No scene-by-scene material retrieval changes were kept.
- No `MaterialMatchContractError` or floor/business-word hard gate was kept.
- No `test_material_matching_contract.py` was kept.
- No code rules were added for project terms such as `一楼`, `六楼`, `柱网`, `地坪`, or `厂房空间`.

## Validation

Passed:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src'
python -m pytest workers/video-worker/tests/test_firered_plan_timeline_contract.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_processor_contract.py -q
```

Result: `43 passed in 0.77s`.

Passed:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src'
python -m pytest workers/video-worker/tests/test_firered_plan_timeline_contract.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py -q
```

Result: `106 passed in 3.06s`.

Also passed:

- `git diff --check`
- forbidden material-matching scan returned no matches in touched code/test files.

## Next Steps

1. Commit this batch.
2. Push branch HEAD to remote `5.23-worker-fix`.
3. Do not merge to `main`, do not push `main`, and do not release from `main` unless the user gives a new explicit instruction.
4. Treat any fresh zhiluan1 run after this batch as only validating the first-batch gates. It may still select wrong visual material until the later material-matching batch is implemented.
