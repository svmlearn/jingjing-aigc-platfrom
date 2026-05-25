# 2026-05-25 OpenStoryline 私有素材自主搜索 handoff

## 当前目标

恢复以前 OpenStoryline 在制作流程里主动找素材的路径，但素材搜索源改为当前商家的私有素材库，禁止 worker 外层全局 Top 8 预取和官方 Pexels fallback。

## 分支与工作区

- Worktree：`D:\codexplan\jingjingstart-5.23-worker-lip`
- Branch：`5.23-worker-fix`
- 基线包含此前 `codex/5.23.1.video-fix` 的慢放阻断和 `scene_material_insufficient` 相关质量门禁。
- 未热更新 `/srv/jingjing-domestic/current`。
- 主目录 `D:\codexplan\jingjingstart` 的 unrelated dirty docs 未处理。
- worktree 中未跟踪的 `jingjing-*.tar` 发布包未纳入本次改动。

## 已完成内容

- Worker：
  - 删除正常视频制作主链路里的商家素材库预取下载。
  - 正常 run 不再调用 `list_video_material_input_assets(limit=8)`。
  - 只把显式上传素材传给 OpenStoryline，素材补充交给 OpenStoryline 内部 `search_media`。
- OpenStoryline adapter：
  - FireRed worker payload 带 merchant-specific private search base URL。
  - 缺少 `PRIVATE_PEXELS_BASE_URL` / `PRIVATE_PEXELS_API_KEY` / `merchant_id` 时直接失败。
  - prompt 改为“优先上传素材；素材不足时调用 `search_media` 搜当前商家私有库；禁止官方 Pexels 和跨商家素材”。
- FireRed：
  - worker search_media 注入器强制校验私有 key 和 `/merchants/<merchantId>` base URL。
  - 私有搜索请求使用 bearer auth。
  - `load_media` 合并本 session 所有 `search_media` 结果并去重。
- App：
  - 新增 merchant service-auth 私有 Pexels-compatible 搜索路由。
  - bearer token 走 `PRIVATE_PEXELS_API_KEY`，不依赖 cookie。
  - 私有结果源覆盖 `source_items + asset_objects` material library 视频，并保留 `merchant_media_clips` 兼容。

## 主要改动文件

- `workers/video-worker/worker/app/processor.py`
- `workers/video-worker/openstoryline/app/engine_adapters.py`
- `workers/video-worker/openstoryline/firered/agent_fastapi.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/nodes/core_nodes/search_media.py`
- `workers/video-worker/openstoryline/firered/src/open_storyline/storage/agent_memory.py`
- `app/src/server/api/private-media-pexels-service.ts`
- `app/src/lib/private-media-pexels-service-core.ts`
- `app/src/lib/private-media-pexels-adapter.ts`
- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/app/api/private-media/pexels/merchants/[merchantId]/videos/search/route.ts`
- `app/src/app/api/private-media/pexels/merchants/[merchantId]/v1/search/route.ts`
- 相关 worker / FireRed / app tests。

## 验证结果

- `python -m pytest ...` focused worker/OpenStoryline/FireRed tests：`104 passed`。
- `npm exec --yes tsx -- --test src/server/api/private-media-pexels-service.test.ts`：`7 pass`。
- `npm run typecheck`：通过。

## 后续验收建议

- 用一个真实商家素材库 case 验证 FireRed session 里出现多次 `search_media` 调用，且 URL 都落到 `/api/private-media/pexels/merchants/<merchantId>/...`。
- 构造“1 楼 / 6 楼”或等价双场景 case，确认 worker 不再把全局 Top 8 素材提前塞入 `input_assets`。
- 如果商家私有搜索仍找不到足够相关素材，应保留 `scene_material_insufficient` 失败，不慢放、不静默替代。

## Push / Merge 状态

- 本文档写入时尚未 commit / push。
- 按用户要求，下一步是 commit 全部相关代码和文档，并 push 到 Gitee 远端分支 `5.23-worker-fix`。
- 不直接合并主线。
