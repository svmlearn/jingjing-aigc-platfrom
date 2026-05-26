# 2026-05-25 OpenStoryline 私有素材搜索服务器 release

## 范围

- 发布分支：`5.23-worker-fix`
- 运行时代码 commit：`633a8694f722b98d4e84d9cf6cc7229c8609c889`
- 发布目标：`meng@8.154.28.41:/srv/jingjing-domestic`
- 发布方式：从已提交 Git tree 使用 `git archive` 打包，抽取到新 release 目录后构建并切换 `current`，没有热改 `/srv/jingjing-domestic/current`。

## 本地验证

- Python focused tests：`104 passed`
  - `workers/video-worker/tests/test_processor_contract.py`
  - `workers/video-worker/tests/test_openstoryline_engine_adapters.py`
  - `workers/video-worker/tests/test_firered_node_interceptors.py`
  - `workers/video-worker/tests/test_firered_search_media_private_base_url.py`
- App service-auth tests：`7 pass, 0 fail`
  - `src/server/api/private-media-pexels-service.test.ts`
- App typecheck：`npm run typecheck` passed。

## 服务器配置

- 发布前确认 `shared/env/app.env` 和 `shared/env/worker.env` 均缺少 `PRIVATE_PEXELS_BASE_URL` / `PRIVATE_PEXELS_API_KEY`。
- 已补齐两份 env：
  - `PRIVATE_PEXELS_BASE_URL=http://127.0.0.1:3000/api/private-media/pexels`
  - `PRIVATE_PEXELS_API_KEY` 已生成同一随机值写入两份 env，未在日志或文档中打印。
- env 备份后缀：`20260525150335-private-pexels-final`。

## 发布记录

- 本地 archive：`D:\codexplan\jingjing-release\jingjing-633a869.tar`
- 服务器 archive：`/tmp/jingjing-633a869.tar`
- 新 release：`/srv/jingjing-domestic/releases/20260525150505-633a869`
- 旧 current：`/srv/jingjing-domestic/releases/20260524213700-ab2d02c`
- 新 current：`/srv/jingjing-domestic/releases/20260525150505-633a869`
- 构建命令：
  - `corepack pnpm@10.20.0 install --frozen-lockfile`
  - `corepack pnpm@10.20.0 build`
- Next build route 列表包含：
  - `/api/private-media/pexels/merchants/[merchantId]/videos/search`
  - `/api/private-media/pexels/merchants/[merchantId]/v1/search`

## 重启与健康检查

已重启：

- `jingjing-domestic-app.service`
- `jingjing-content-generation-worker.service`
- `jingjing-firered-openstoryline.service`
- `jingjing-openstoryline-engine.service`
- `jingjing-video-worker.service`

最终状态：

- `jingjing-domestic-app.service`: `active`
- `jingjing-content-generation-worker.service`: `active`
- `jingjing-firered-openstoryline.service`: `active`
- `jingjing-openstoryline-engine.service`: `active`
- `jingjing-video-worker.service`: `active`
- `nginx.service`: `active`
- `systemctl is-failed` 对上述服务均返回 `active`。

健康检查：

- `curl -fsS http://127.0.0.1:3000/api/health`：`ok`，database `ok`，storage `aliyun_oss` configured。
- `curl -fsS http://127.0.0.1:8000/ready`：OpenStoryline engine `ready`，FireRed ready。
- `curl -fsS http://127.0.0.1:7860/api/ready`：FireRed `ready`，`render_video_available=true`。
- 私有素材搜索 service-auth 探针：
  - 使用合法空商家 UUID `00000000-0000-0000-0000-000000000000`
  - `GET /api/private-media/pexels/merchants/<merchantId>/videos/search?query=release-probe&page=1&per_page=1`
  - Bearer 使用服务器 env 中的 `PRIVATE_PEXELS_API_KEY`
  - 返回 Pexels-like JSON，`videos=[]`，`page=1`，`per_page=1`。

## 注意事项

- 同时重启时，`jingjing-video-worker.service` 第一次 healthcheck 早于 OpenStoryline ready，收到一次 `503` 后由 systemd 自动重启；随后 healthcheck `200 OK`，poll loop 正常启动。
- 第一次私有搜索探针曾使用非法 merchant id `__release_probe__`，数据库按 UUID 解析返回 `invalid input syntax for type uuid`；改用合法 UUID 后通过。
- 当前线上私有素材补充路径已经具备 service-auth route 与 worker/OpenStoryline 环境配置。生产任务如果缺少私有搜索配置，会按本轮代码逻辑显式失败，不回退官方 Pexels。
