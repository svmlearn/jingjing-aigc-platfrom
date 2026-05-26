# 2026-05-24 zhiluan1 lip-sync clip scope fix

## Context

- User task id: `27307400-fbb2-4b8f-8cfa-2a3a8199543b`
- Failed video job: `53fc3013-02a2-48cd-9152-465eaf98f701`
- Draft id: `2372a941-15c3-49e4-b377-58b74f37c51e`
- Content variant id: `cae7632a-749c-47f6-872c-30b2a7210e3f`
- Final status before this fix: `failed_manual`
- Failure stage: `lip_sync_artifact_validation_failed`
- Failure reason: `lip_sync_artifacts_missing: lip_sync enabled but no retalked talking-head segments were produced`

## Material Evidence

The two uploaded talking-head inputs were correct:

1. `asset_id=84deb4ca-8893-4c20-b0a0-b98c318e4ae4`
   - Original filename: `e7173d0e-dc17-46e3-a283-9db0115b9174-upload.mp4`
   - FireRed `media_id=media_0003`
   - Persisted file: `media_0001.mp4`
   - Local archive: `D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_1_asset_84deb4ca_media_0001.mp4`
   - Frame strip: `D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_1_frames.jpg`
2. `asset_id=76f79705-b045-4d7f-b34a-b54cae58aa12`
   - Original filename: `078d988a-3cbe-4278-be14-d324c3ccd6b6-upload.mp4`
   - FireRed `media_id=media_0005`
   - Persisted file: `media_0002.mp4`
   - Local archive: `D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_2_asset_76f79705_media_0002.mp4`
   - Frame strip: `D:\Desktop\测试素材\27307400-talking-head-inputs\talking_head_2_frames.jpg`

Both were loaded as:

```text
role=talking_head
scene_type=talking_head
tags=["talking_head"]
labels=["talking_head"]
lip_sync_provider=aliyun_videoretalk
```

## Root Cause

`split_shots` cut the talking-head videos into smaller clips, and the labels were preserved. The bug was downstream.

Relevant split clips:

```text
media_0003 -> clip_0003, clip_0004
media_0005 -> clip_0006, clip_0007
```

`group_0006` mixed B-roll/project material with a final talking-head clip:

```text
group_0006 = clip_0009 + clip_0011 + clip_0002 + clip_0007
```

`clip_0007` is `talking_head`, but `clip_0009`, `clip_0011`, and `clip_0002` are ordinary project material. The previous `lip_sync` target logic marked an entire group as eligible when any clip inside the group had a `talking_head` label. That let `clip_0009` enter Aliyun VideoRetalk, causing `InvalidFile.FaceNotMatch`.

## Code Fix

Updated:

```text
workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/lip_sync.py
```

Behavior changed from group-level target expansion to clip/segment-level eligibility:

```text
Before: any talking_head clip in a group => all segments in that group can enter lip_sync
After: only the current segment/clip itself labeled talking_head can enter lip_sync
```

`group_id` is still used to find the corresponding voiceover, but it no longer expands lip-sync scope.

A pre-provider guard now blocks non-talking-head segments before calling Aliyun VideoRetalk:

```text
lip_sync_non_talking_head_segment_blocked
```

The guard includes `group_id`, `clip_id`, `media_id`, `role`, `scene_type`, and `source_path` for diagnosis.

## Regression Test

Updated:

```text
workers/video-worker/tests/test_firered_lip_sync_node.py
workers/video-worker/tests/test_directive_contract.py
app/src/server/api/video-job-payload.test.ts
```

Added `test_lip_sync_mixed_group_targets_only_talking_head_clip`, which reproduces the mixed `group_0006` shape:

```text
clip_0009 = project_material
clip_0011 = project_material
clip_0002 = project_material
clip_0007 = talking_head
```

Expected result:

```text
lip_sync targets = [clip_0007]
clip_0009, clip_0011, clip_0002 remain unchanged
```

## Local Verification

After rebasing onto the latest remote `5.23-worker-fix`, the local branch passed:

```text
cd workers/video-worker
python -m pytest tests/test_directive_contract.py tests/test_firered_lip_sync_node.py
```

Result:

```text
17 passed
```

```text
cd app
node --test src/server/api/video-workbench-agent-runtime.test.ts src/server/api/video-job-payload.test.ts
corepack pnpm typecheck
```

Result:

```text
30 passed
typecheck passed
```

```text
git diff --check
```

Result: passed with no whitespace errors.

## Skill / Runbook Update

Updated:

```text
.codex/skills/jingjing-video-edit-run/SKILL.md
docs/codex-runtime-errors.md
```

New rule: lip-sync scope must be clip/segment-level `talking_head`. Mixed narrative groups are allowed, but group membership must never send road, park, factory facade, apartment, dormitory, parking, distant-view, or other B-roll/project material to VideoRetalk.

## Expected Consequence

On the next release and rerun:

- The original two talking-head uploads remain valid.
- Talking-head split clips such as `clip_0003` and `clip_0007` can enter lip sync.
- B-roll/project-material clips in the same group remain in the timeline without VideoRetalk.
- `clip_0009` should no longer be submitted to Aliyun VideoRetalk.
- Render should consume retalked talking-head paths only.

## Push And Server Release

Pushed to Gitee:

```text
origin/5.23-worker-fix -> ab2d02cab0b8f3c35b7e7e2f2f21db112bbefa12
```

Released through the normal server release directory flow, not by hot-editing `current`:

```text
/srv/jingjing-domestic/releases/20260524213700-ab2d02c
/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260524213700-ab2d02c
```

Server build:

```text
corepack pnpm@10.20.0 install --frozen-lockfile
corepack pnpm@10.20.0 build
```

Release verification:

```text
jingjing-domestic-app.service: active
jingjing-content-generation-worker.service: active
jingjing-firered-openstoryline.service: active
jingjing-openstoryline-engine.service: active
jingjing-video-worker.service: active
nginx.service: active
```

Health:

```text
/api/health: ok, database=postgres, storage=aliyun_oss
OpenStoryline /ready: ready, engine_adapter=fire_red
FireRed /api/ready: ready, tool_count=21, render_video_available=true
```

Post-release source checks confirmed:

```text
lip_sync_non_talking_head_segment_blocked
max_duration_seconds
```

Post-release server typecheck also passed when run as the release owner.

## Observed Pre-Fix Consequence

Existing failed job after release:

```text
video_edit_job_id=53fc3013-02a2-48cd-9152-465eaf98f701
fire_red_run_id=154a49ac38a1405dbfc648cd2454af28
status=failed_manual
failure_code=lip_sync_artifacts_missing
```

The pre-fix FireRed cache proves the old behavior:

```text
clip_0003 group_0001 talking_head: source_window.mp4 + retalked_group_0001_clip_0003.mp4
clip_0009 group_0006 B-roll/project material: source_window.mp4 only, no retalked output
clip_0007 group_0006 talking_head: no lip_sync cache target in that failed run
```

So the observed consequence was: group-level expansion sent `clip_0009` into lip sync because it shared `group_0006` with the talking-head `clip_0007`. The released fix prevents that expansion. No new post-release video job had been created yet at the time of this note, so a fresh run is still needed to observe final render success.
