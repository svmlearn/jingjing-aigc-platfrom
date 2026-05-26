# 2026-05-26 worker Top8 prefetch removal handoff

## 当前目标

在本地分支 `codex/release-5.26-worker-fix` 上彻底删除 merge 后复活的 worker 旧 Top8 素材库预取路径，完成本地验证后提交并推送到 Gitee 远端 `5.26-worker-fix`。本轮不热更新服务器、不做 release。

## 已完成内容

- 已确认旧路径影响面：
  - `processor.py` 旧 helper 把 `sceneAssetQueries` / 脚本文案拼成全局 query。
  - `processor.py` 旧调用在下载阶段执行 repository `list_video_material_input_assets(..., limit=8)`。
  - `db.py` 旧 repository 方法直接从 `source_items + asset_objects` 取 OSS 对象并交给 worker 下载。
  - 该路径绕过动态 private-media token 下载。
- 已从运行代码中删除：
  - `_material_library_query`
  - `_download_material_library_inputs`
  - `list_video_material_input_assets`
  - 旧 Top8 预取专用分词/打分/metadata 组装 helper
  - `material_library_inputs_downloaded`
  - `material_library_asset_ids`
- 已保留并验证新口径：
  - worker 下载阶段只下载显式上传素材。
  - OpenStoryline / FireRed 运行时按分镜 `search_media` 动态检索私有素材。
  - 下载阶段日志写 `material_library_prefetch=disabled_openstoryline_search_media`。

## 改动文件

- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/worker/app/db.py`
- `workers/video-worker/tests/test_processor_contract.py`
- `docs/progress/2026-05-26-worker-top8-prefetch-removal.md`
- `docs/handoff/2026-05-26-worker-top8-prefetch-removal-handoff.md`
- `docs/codex-runtime-errors.md`
- `.codex/feedback/FEEDBACK-INDEX.md`
- `.codex/feedback/impact-analysis-before-deletion.md`

## 验证结果

- Worker focused tests：`121 passed in 2.46s`
- `py_compile processor.py db.py`：通过
- `git diff --check`：通过
- 旧路径静态搜索：无命中

静态搜索命令：

```powershell
rg -n "list_video_material_input_assets|material_input_assets|material_queries|_download_material_library_inputs|_material_library_query|material_library_inputs_downloaded|material_library_asset_ids|limit=8" workers\video-worker\worker workers\video-worker\tests app\src -g "*.py" -g "*.ts" -g "*.mjs"
```

## 当前状态

- Worktree：`D:\codexplan\jingjingstart`
- Branch：`codex/release-5.26-worker-fix`
- Commit：本文件随最终提交一起产生；最终以 `git log origin/5.26-worker-fix -1` 和本轮 final 为准
- Push：待推送到 Gitee `5.26-worker-fix`
- Merge / release：未执行

## 下一步建议

1. 在 Gitee `5.26-worker-fix` 上验收 commit。
2. release 前再次执行旧路径静态搜索，确认没有 Top8 预取入口。
3. 服务器验证时用日志判断：
   - `material_library_prefetch=disabled_openstoryline_search_media` 表示 worker 预取已关闭。
   - FireRed 日志里的 `search_media.search_keyword` 和 `scene_search.result_count` 表示动态私有素材检索实际发生。
   - `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET is required` 是动态素材 token 配置问题。
   - `429 insufficient_quota` 是 DashScope/百炼额度或限流问题，不是 OSS 素材问题。
