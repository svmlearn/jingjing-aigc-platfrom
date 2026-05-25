# 2026-05-25 zhiluan1 video quality issue split progress

## Scope

Implemented only the first quality-gate batch. Material matching is not fixed in this progress entry.

The accepted scope was:

- block video slowdown compensation;
- fail talking-head timeline gaps;
- fail obvious subtitle tail gaps;
- keep small B-roll tail gaps allowed;
- remove material-matching experiment code from this batch.

## Why This Solves The Located Issues

The prior zhiluan1 evidence showed a short video source around `2852ms` being placed into an `11076ms` timeline slot with `playback_rate=0.2574936800288913`. That is a concrete planner/render failure mode, so the fix blocks it at both layers:

- planning now fails when a video clip is asked to cover longer than its source window;
- rendering now fails if an old or malformed timeline still contains `playback_rate < 1.0`.

The same run also showed final video duration around `73800ms` while subtitles ended around `52000ms`. The new processor validation catches this as an obvious tail gap, but still allows small B-roll tail gaps.

Talking-head risk is handled separately from B-roll: a talking-head timeline segment must have matching retalked/lip-sync coverage and voiceover coverage. This check can use `split_shots.clips` metadata when the timeline segment itself does not carry `role` or `tags`.

## Files Changed

- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/render_video.py`
- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/tests/test_firered_plan_timeline_contract.py`
- `workers/video-worker/tests/test_firered_render_lip_sync.py`
- `workers/video-worker/tests/test_processor_contract.py`

## Removed Or Excluded

- Reverted `workers/video-worker/worker/app/db.py` material query/metadata experiments.
- Removed material-matching hard-gate experiments from `processor.py`.
- Removed the untracked material-matching contract test from this batch.
- Confirmed no project-specific material terms were added as code rules.

## Tests

Focused tests:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src'
python -m pytest workers/video-worker/tests/test_firered_plan_timeline_contract.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_processor_contract.py -q
```

Result: `43 passed in 0.77s`.

Related regression tests:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline;workers/video-worker/openstoryline/firered/src'
python -m pytest workers/video-worker/tests/test_firered_plan_timeline_contract.py workers/video-worker/tests/test_firered_render_lip_sync.py workers/video-worker/tests/test_firered_lip_sync_node.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_processor_contract.py -q
```

Result: `106 passed in 3.06s`.

Static checks:

- `git diff --check`: passed.
- forbidden material-matching scan: no matches.

## Release Flow Status

- Commit: pending at document write time; final hash is recorded in the final handoff response.
- Push to remote `5.23-worker-fix`: pending at document write time.
- Local merge to `main`: not done, per latest user instruction.
- Push Gitee `main`: not done, per latest user instruction.
- Server release: not done.
- Hot update: not done.

## Remaining Risk

Fresh jobs can still select visually wrong material because material matching is intentionally deferred. The expected behavior for short material after this batch is failure with a clear reason, not slow playback or silent success.
