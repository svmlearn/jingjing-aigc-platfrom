# 2026-05-26 Worker Top8 material prefetch removal

## 目标

修复 `origin/5.26-worker-fix` merge 后复活的旧 Top8 素材库预取路径。目标不是只让 processor 不调用，而是把旧路径入口完整删除，避免 worker 继续绕过 `/api/private-media/download/<token>`，直接按 DB 里的 OSS `storage_key` 下载商家素材。

## 影响面判断

- 旧路径由 `processor.py` 在下载阶段调用 `_download_material_library_inputs()`。
- `_download_material_library_inputs()` 会把 `materialContext.sceneAssetQueries` 和脚本文案拼成全局 query，再调用 repository `list_video_material_input_assets(..., limit=8)`。
- repository 旧方法会从 `source_items + asset_objects` 取商家素材并组装成 `InputAsset`，随后直接通过 object storage client 下载 OSS 对象。
- 这条路径绕过动态私有素材搜索，也绕过 `/api/private-media/download/<token>`，因此缺少 `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET` 时仍可能找到素材。
- 57ce19d 的正确行为是：worker 下载阶段只处理显式上传素材；商家 B-roll 由 OpenStoryline/FireRed 运行时按分镜调用 `search_media`，日志写 `material_library_prefetch=disabled_openstoryline_search_media`。

## 已完成

- `workers/video-worker/worker/app/processor.py`
  - 删除 `_material_library_query()`。
  - 删除 `_download_material_library_inputs()`。
  - 下载阶段不再组装 `material_input_assets`，只把显式上传素材传给 OpenStoryline。
  - 下载阶段日志恢复为 `material_library_prefetch=disabled_openstoryline_search_media`。
  - 删除旧日志字段 `material_library_inputs_downloaded` / `material_library_asset_ids`。
- `workers/video-worker/worker/app/db.py`
  - 删除旧 repository 方法 `list_video_material_input_assets()`。
  - 删除仅服务旧预取路径的 query 分词、素材打分、metadata/file name 组装 helper。
- `workers/video-worker/tests/test_processor_contract.py`
  - 删除 FakeRepository 中的旧预取 fake 方法和状态。
  - 将契约测试改为证明 worker 不再预取素材库：即使存在 `materialContext.sceneAssetQueries`，OpenStoryline 收到的也只有显式上传素材，object storage 下载次数只包含用户输入素材。

## 验证

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_status_contract.py
```

结果：`121 passed in 2.46s`。

```powershell
python -m py_compile workers/video-worker/worker/app/processor.py workers/video-worker/worker/app/db.py
```

结果：通过。

```powershell
git diff --check -- workers/video-worker/worker/app/processor.py workers/video-worker/worker/app/db.py workers/video-worker/tests/test_processor_contract.py
```

结果：通过。

```powershell
rg -n "list_video_material_input_assets|material_input_assets|material_queries|_download_material_library_inputs|_material_library_query|material_library_inputs_downloaded|material_library_asset_ids|limit=8" workers\video-worker\worker workers\video-worker\tests app\src -g "*.py" -g "*.ts" -g "*.mjs"
```

结果：无命中。

## 当前状态

- Branch：`codex/release-5.26-worker-fix`
- Base/发现点：`3db3364`
- 未热更新服务器。
- 待提交并推送到 Gitee 远端 `5.26-worker-fix`。
