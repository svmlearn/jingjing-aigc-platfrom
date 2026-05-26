# 2026-05-25 OpenStoryline 私有素材自主搜索进度

## 目标

恢复“OpenStoryline 自己找素材”的制作路径：worker 不再把商家素材库做一次全局 Top 8 预取；OpenStoryline/FireRed 在剪辑节点内按脚本场景主动调用 `search_media`，而 `search_media` 指向当前商家的私有 Pexels-compatible 素材接口。

## 已完成

- 移除正常 worker run 的素材库全局预取：
  - 不再调用 `_download_material_library_inputs()`。
  - 不再把 `sceneAssetQueries` 拼成全局 query 后查 `limit=8`。
  - 正常输入只包含显式上传素材，日志写入 `material_library_prefetch=disabled_openstoryline_search_media`。
- OpenStoryline FireRed payload 改为 merchant-scoped 私有搜索：
  - `service_config.search_media.pexels.base_url` 生成到 `/api/private-media/pexels/merchants/<merchantId>`。
  - `PRIVATE_PEXELS_API_KEY` 必须存在；worker 缺少私有搜索配置会直接失败。
  - worker prompt 明确要求优先上传素材，素材不足时调用 `search_media` 搜当前商家私有库，并禁止官方 Pexels / 跨商家素材。
- FireRed 链路补强：
  - `search_media` 对私有 base URL 使用 `Authorization: Bearer <key>`。
  - worker `search_media` 注入器校验 merchant-scoped base URL，防止回退官方 Pexels。
  - `load_media` 在 path-only 模式合并同一 session 内所有历史 `search_media` 结果并去重，不再只取最新一次搜索。
- App 新增 service-auth 私有搜索路由：
  - `/api/private-media/pexels/merchants/[merchantId]/videos/search`
  - `/api/private-media/pexels/merchants/[merchantId]/v1/search`
  - 使用 `Authorization: Bearer <PRIVATE_PEXELS_API_KEY>`，不依赖用户 cookie。
- App 私有素材结果源补强：
  - `getPrivateMediaRepository()` 在 Postgres 生产模式优先读取 `source_items + asset_objects` 中 `trace_payload.materialLibrary=true` 的 ready 视频素材。
  - Supabase 兼容模式会合并 legacy material-library 视频和 `merchant_media_clips` ready clip，并按存储 identity 去重。
  - 私有搜索返回的视频不再强制要求缩略图对象，避免 legacy `asset_objects` 视频因无 thumb 被过滤。

## 验证

- Python focused tests:

```powershell
$env:PYTHONPATH='workers/video-worker;workers/video-worker/openstoryline'
python -m pytest workers/video-worker/tests/test_processor_contract.py workers/video-worker/tests/test_openstoryline_engine_adapters.py workers/video-worker/tests/test_firered_node_interceptors.py workers/video-worker/tests/test_firered_search_media_private_base_url.py
```

结果：`104 passed in 4.03s`。

- App private media service tests:

```powershell
$env:NODE_OPTIONS='--conditions=react-server'
npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts
```

结果：`7 pass, 0 fail`。

- App TypeScript:

```powershell
npm run typecheck
```

结果：通过。

## 当前状态

- 本地 worktree：`D:\codexplan\jingjingstart-5.23-worker-lip`
- 分支：`5.23-worker-fix`
- 未热更新服务器。
- 未合并主线。
- 下一步：提交并 push 到 Gitee 远端 `5.23-worker-fix`。
