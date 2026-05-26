# 2026-05-26 zhiluan1 factory script search fix

## Scope

Updated the `厂房宣传` / `zhiluan1` factory video script and tightened worker private material search behavior before release. This progress note records the local branch work only; no server hot update was performed.

Branch:

- `codex/zhiluan1-factory-script-search-fix`

## Changes

- Replaced the canonical zhiluan1 factory script with a 60-second, six-scene version based on actual ready factory material coverage.
- Updated both current-task patch and future-task template scripts:
  - `app/scripts/patch-zhiluan1-restored-video-script-contract.mjs`
  - `app/scripts/fix-factory-member-video-tasks.mjs`
- Added per-scene `searchKeywords` into structured `materials` and `fallbackShot`, so `video_edit_jobs.input_payload.materialContext.sceneAssetQueries` receives search terms instead of relying only on display text.
- Worker private `search_media` now sanitizes Agent-provided filters for worker jobs:
  - removes `orientation`
  - removes `min_video_duration` / `max_video_duration`
  - forces `video_number=10`
  - forces `photo_number=0`
- FireRed private Pexels-compatible video filtering no longer applies default duration bounds when the worker did not explicitly send duration bounds. This lets short proof clips such as management-service footage enter candidates.
- Worker scene-search matching now accepts keyword overlap, so a scene query such as `消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处` can be satisfied by searches like `管理服务站` or `管理处`.
- Worker rejects a third search attempt for the same scene with `scene_material_insufficient`, including scene number, query, candidate count, search attempts, and max attempts.
- Existing `group_clips` normalization keeps `clip_id` values unique across groups; a regression test now proves repeated model output is dropped instead of reused.
- Existing `lip_sync` node retalks only clip/segment-level `talking_head` targets; B-roll project material remains unchanged even inside a mixed group.

## Final Script

```text
标题：找厂房，别只看租金
目标时长：约 60 秒
结尾引导：你要找工业园区厂房，建议实地来看一圈。

1
00:00-00:07
场景：成员口播开场
画面：成员在园区现场出镜，穿插园区大门、入口道路、厂房外立面。
素材检索关键词：园区入口 园区大门 厂房外立面 停车通道
台词/字幕：找厂房别只盯低租金。空间能不能用、动线顺不顺、配套和管理跟不跟得上，都要现场看。

2
00:07-00:20
场景：一楼主力厂房空间
画面：一楼大开间、连续柱网、绿色地坪、消防管线、空间纵深。
素材检索关键词：一楼厂房大开间 厂房柱网 绿色地坪 消防管线 空间纵深
台词/字幕：这边主力是一楼厂房，约2000平。大开间、柱网、绿色地坪和消防管线都能看到，生产、仓储、轻加工都比较好规划。

3
00:20-00:29
场景：厂房基础设施
画面：采光窗、消防栓、配电箱、安全警示牌、消防疏散图和平面标识。
素材检索关键词：厂房采光窗 消防栓 配电箱 安全警示 消防疏散图 平面标识
台词/字幕：基础设施也要看细节。采光窗、消防栓、配电箱、安全警示和疏散图都有实拍，后期布置设备更有底。

4
00:29-00:38
场景：六楼补充空间
画面：六楼空置空间、绿色地坪、吊顶柱网、电梯厅、玻璃门和公共走廊。
素材检索关键词：六楼空置空间 六楼绿色地坪 电梯厅 玻璃门 公共走廊
台词/字幕：楼上还有六楼补充空间，电梯厅、玻璃门、走廊和空置空间都清楚，适合把办公或仓储功能分开安排。

5
00:38-00:47
场景：园区公共配套
画面：消防疏散图、楼层索引、货梯入口、电梯轿厢、管理服务站门头快切。
素材检索关键词：消防疏散图 楼层索引 货梯入口 电梯轿厢 管理服务站 管理处
台词/字幕：公共配套也有实拍：疏散图、楼层索引、货梯入口和管理服务站都能看到，现场判断更踏实。

6
00:47-01:00
场景：住宿生活配套与成员收尾
画面：公寓楼、宿舍楼、电动车停放区、停车通道，最后回到成员出镜收尾。
素材检索关键词：公寓楼 宿舍楼 电动车停放 停车通道 厂房外立面
台词/字幕：员工这边有公寓、宿舍、电动车停放和停车通道。找厂房别只看面积和价格，空间、设施、配套、管理一起看，建议现场走一圈。
```

## Local Validation

Completed:

```powershell
node --check app/scripts/patch-zhiluan1-restored-video-script-contract.mjs
node --check app/scripts/fix-factory-member-video-tasks.mjs
```

Result: passed.

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_firered_node_interceptors.py -q
```

Result: `42 passed`.

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_status_contract.py -q
```

Result: `125 passed`.

```powershell
$env:NODE_OPTIONS='--conditions=react-server'
cd app
npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts src/server/api/video-edit-jobs-service-contract.test.ts src/lib/private-media-workflow-fixture.test.ts
```

Result: `12 passed`.

```powershell
cd app
npm run typecheck
```

Result: passed.

```powershell
git diff --check
```

Result: passed, with Windows line-ending warnings only.

Re-run after adding private search duration-bound tests:

- `test_firered_search_media_private_base_url.py`
- `test_firered_node_interceptors.py`
- full worker regression set above

Result: private search + interceptor focused tests `47 passed`; full worker regression `125 passed`.

Additional checks after adding duplicate-material proof:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py -q
```

Result: `10 passed`. This covers no duplicate clip reuse across groups and B-roll not entering lip-sync.

Final combined worker command:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_status_contract.py workers/video-worker/tests/test_firered_group_clips_contract.py workers/video-worker/tests/test_firered_lip_sync_node.py -q
```

Result: `135 passed`.

## Release Notes

- Do not hot-update `/srv/jingjing-domestic/current`.
- After local branch validation, commit this branch, fast-forward merge to local `main`, and push `main` to `origin/5.26-worker-fix`.
- Build and release from the final local `main` commit into a new `/srv/jingjing-domestic/releases/<timestamp>-<sha>` directory.
- Only after the new release is active, run the zhiluan1 script patch from the released code path:

```bash
cd /srv/jingjing-domestic/current/app
sudo node -- scripts/patch-zhiluan1-restored-video-script-contract.mjs --env-file /srv/jingjing-domestic/shared/env/app.env --apply
```

Read back the script and `production_scenes` after apply. No new video job is created by this code/data release step.
