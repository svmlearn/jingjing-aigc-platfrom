# 2026-05-26 OpenStoryline scene search worker fix

## 目标

按 `docs/handoff/2026-05-26-openstoryline-scene-search-handoff.md` 的方向修复视频剪辑 worker：

- 不在 job 创建前把商家 B-roll 预绑定进 `input_assets`。
- FireRed 运行时按 `materialContext.sceneAssetQueries` 逐分镜调用 `search_media`。
- `load_media` 合并同一 session 内成员上传素材和所有 `search_media` 结果。
- 素材不足时显式失败为 `scene_material_insufficient`，不静默缩水出片。
- `dailyTaskId` 从前端/API 进入 `input_payload.materialContext.dailyTaskId`。
- worker 进度回调不覆盖已取消或已终态 job。

## 已完成

- FireRed prompt 改为中文短调度说明，明确 `search_media.search_keyword -> load_media -> generate_voiceover/select_bgm/plan_timeline/lip_sync/render_video` 顺序。
- `search_media` 返回中记录 `search_keyword` 和 `scene_search.result_count`，即使结果为 0 也能证明该分镜已检索。
- ArtifactStore 增加 `get_metas()`，支持读取同一 node/session 的全部历史结果。
- FireRed interceptor 增加 scene search coverage 门禁：
  - 仅在 worker 有锁定脚本和商家 B-roll 分镜需求时生效。
  - 跳过 `sourceRole=user_talking_head` 的成员口播分镜。
  - 下游节点继续前必须已有每条商家分镜 query 对应的 `search_media.search_keyword` 记录。
  - `load_media` path-only 模式合并所有 `search_media` payload，而不是只取最新一次。
  - `generate_script` 前校验素材组数量，不足时抛 `scene_material_insufficient` 并带 `sceneNo/query`。
- `createVideoEditJob` 请求、schema、前端调用和服务端 payload 构建补齐 `dailyTaskId`。
- 服务端创建 job 时验证 `dailyTaskId` 属于当前 merchant/user，并校验 draft/variant 关联。
- `VideoJobRepository.update_stage()` 对 `queued/preparing/running` 增加终态保护，避免旧进度回调覆盖 `cancelled/succeeded/failed_*`。
- OpenStoryline 运行错误中包含 `scene_material_insufficient` 时，worker 记录 `failure_code=scene_material_insufficient` 并落 `failed_manual`。
- `.gitignore` 增加 `/jingjing-*.tar`，避免 release archive 误提交。

## 验证

已通过：

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py workers/video-worker/tests/test_status_contract.py
```

结果：`103 passed`。

```powershell
$env:NODE_OPTIONS='--conditions=react-server'
$env:PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET='test-private-media-download-token-secret-2026'
npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts src/server/api/video-edit-jobs-service-contract.test.ts
```

结果：`6 passed`。

```powershell
npm run typecheck
```

结果：通过。

## 注意事项

- 仅完成本地分支实现、测试、commit 和 Gitee 分支 push；未 SSH 到服务器，未热更新，未做 release。
- app 测试前需要安装依赖；本次使用 `npm install` 安装本地 `node_modules`，生成的临时 `app/package-lock.json` 未提交。
- 私有素材 route 测试需要本地测试密钥 `PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET`，只用于测试命令，不写入仓库。

