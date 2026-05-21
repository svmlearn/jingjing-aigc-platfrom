# 2026-05-21 社媒爆款内容库实现记录

## 目标

将商家端原“素材中心”调整为“社媒爆款内容库”，用于沉淀 TikHub 解析来的小红书/抖音爆款内容。该库与项目图片素材库、项目视频素材库分层，不把爆款视频当作 video worker 可剪辑素材。

## 已完成

1. 新增/确认 PRD：`docs/产品文档/V2.6-社媒爆款内容库PRD.md`。
2. 导航和页面命名改为“社媒爆款内容库”。
3. 页面仅展示 `usageType = viral_reference` 的社媒爆款内容，不混入 `image_asset` / `video_asset` 项目媒体素材。
4. TikHub provider 支持三种获取方式：
   - `keyword`：关键词搜索。
   - `profile`：博主主页。
   - `detail`：单条小红书笔记/抖音视频链接。
5. 单条链接解析不再创建“待接 provider”的假素材，而是走 TikHub detail 解析。
6. 入库时默认尝试抓取评论：
   - 小红书：`web_v3/fetch_note_comments`。
   - 抖音：`app/v3/fetch_video_comments`。
   - 评论抓取失败不阻塞主内容入库。
7. TikHub 原始 provider response 进入素材 trace payload；评论同时写入 `trace_payload.materialComments`，并尝试落到已有 `imported_comments` 表。
8. 咨询 Agent 的 `search_benchmark_materials` 工具支持 `detailUrl`，并在工具 payload 中返回正文、互动快照、结构化字段和评论摘要。
9. 页面详情展示正文/文案、标签、互动数据、评论、TikHub 解析状态；不展示 raw JSON。

## 验证

已在 worktree `/private/tmp/jingjing-social-viral-content-library-20260521` 执行：

```bash
cd app
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
node --test src/server/import-providers/tikhub/normalizers.test.ts
```

结果：

- `typecheck` 通过。
- `lint` 通过，但仓库原有 10 个 unused warning 仍存在，本次未处理。
- TikHub normalizer 单测 2 条通过。

## 注意

- TikHub API key 不写入代码和文档。服务端仍通过 `TIKHUB_API_KEY` / `TIKHUB_TOKEN` 读取。
- 默认评论抓取条数由 `TIKHUB_MATERIAL_COMMENT_COUNT` 控制，默认 20，设为 0 可关闭默认评论抓取。
- 跨商家缓存复用沿用已有 provider cache key 机制；命中缓存时会复制 trace 中的规范化评论并再次尝试写入当前 source item 的评论表。
- 本轮没有新增 raw JSON 管理后台入口，符合用户确认。
