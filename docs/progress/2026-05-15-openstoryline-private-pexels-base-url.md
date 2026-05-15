# 2026-05-15 OpenStoryline 私有 Pexels-compatible base URL 合同

## 目标

补齐 Worker / OpenStoryline 阶段的私有素材检索入口：OpenStoryline 仍消费 Pexels-like JSON，但不再硬依赖官方 Pexels URL 或真实 Pexels API key。

## 已完成

- `SearchMediaNode` 支持 `pexels_base_url`。
  - 未配置时继续使用官方 Pexels：
    - `https://api.pexels.com/videos/search`
    - `https://api.pexels.com/v1/search`
  - 配置私有 base URL 时自动拼接：
    - `{base}/videos/search`
    - `{base}/v1/search`
  - 私有 base URL 存在时允许 `pexels_api_key` 为空。
  - 如提供 key，仍会透传 `Authorization` header，便于后续私有接口加服务端 token。
- FireRed / OpenStoryline session runtime 支持透传 `pexels_base_url`。
- `openstoryline` worker adapter 支持通过环境变量传入私有素材接口：
  - `PRIVATE_PEXELS_BASE_URL`
  - `PEXELS_BASE_URL` 作为兼容 fallback
  - `PRIVATE_PEXELS_API_KEY` 可选；为空不阻断
- 配置模板新增 `search_media.pexels_base_url = "${PRIVATE_PEXELS_BASE_URL:-}"`。
- 修正 clone provider 测试命名：`pixelle_clone` 明确作为 RunningHub clone 的当前代码适配名 / 历史命名，不再把 RunningHub 当成另一个被排除的 provider。

## 验证

本轮为本地合同 / mock / fixture-level workflow 验证，未调用真实 Pexels、真实 COS 下载、真实 RunningHub clone 或真实 OpenStoryline 出片。

已执行：

```powershell
cd workers/video-worker
python -m pytest tests/test_firered_search_media_private_base_url.py tests/test_firered_node_interceptors.py tests/test_openstoryline_engine_adapters.py
python -m py_compile openstoryline/firered/src/open_storyline/nodes/core_nodes/search_media.py openstoryline/firered/src/open_storyline/config.py openstoryline/firered/src/open_storyline/agent.py openstoryline/firered/src/open_storyline/mcp/hooks/node_interceptors.py openstoryline/app/config.py openstoryline/app/engine_adapters.py
```

结果：

- `23 passed`
- `py_compile` 通过
- app 侧补充替代 smoke：
  - `app/src/lib/private-media-workflow-fixture.test.ts`
  - 覆盖 Dify fixture 生成的 `video_script` scene asset query -> private Pexels-compatible fixture search -> 60 天 download token -> download 302 signer -> doctor clean gate。
  - 该测试证明 OpenStoryline 所需的 Pexels-like JSON 和私有下载入口合同在本地闭环可消费；真实渲染仍为后续服务器 smoke。

## Mock / Real 记录

- 私有 Pexels-compatible base URL：mock HTTP response，验证 URL 拼接、header、无 key 模式。
- OpenStoryline adapter payload：mock `httpx.post`，验证 `service_config.search_media.pexels.base_url` 下发。
- 私有下载 / workflow：app fixture-level substitute，验证 60 天 token 和 302 signer，不访问真实 COS。
- RunningHub clone：仅验证 `voice_profile` 仍映射到 `pixelle_clone` legacy adapter 配置；未做真实 provider smoke。

## 后续

- App 侧当前已把 `/api/private-media/pexels/videos/search` 和 `/api/private-media/pexels/v1/search` 接到 local fixture repository；真实 repository 作为后续替换。
- 60 天下载 token 路由和下架拦截已有本地合同；真实 COS 重签 smoke 后续补。
- 真实服务器侧 RunningHub clone / 私有素材检索 smoke 作为后续 staging gate，不阻塞本地合同测试。
