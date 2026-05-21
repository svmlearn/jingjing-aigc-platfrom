# 2026-05-21 社媒爆款内容库 Handoff

## 当前目标

在独立分支实现“社媒爆款内容库”：替代原商家端“素材中心”语义，沉淀 TikHub 解析的小红书/抖音爆款内容，服务咨询 Agent 和选题 Agent，并与项目图片/视频素材库分层。

## 分支与工作区

- Branch：`codex/social-viral-content-library-20260521`
- Worktree：`/private/tmp/jingjing-social-viral-content-library-20260521`
- Base：`a4be02e9667673dde13e3afe805d84e357ea7442`
- Commit：本文件所在提交（以 `git log -1 --oneline` 为准）
- Push / merge：未 push，未 merge，待用户验收。

## 已完成内容

1. 新增 PRD：`docs/产品文档/V2.6-社媒爆款内容库PRD.md`。
2. 商家端导航和页面命名改为“社媒爆款内容库”。
3. 页面仅展示社媒爆款内容，过滤掉项目图片/视频素材。
4. 页面入口支持：
   - 关键词找爆款。
   - 博主主页找爆款。
   - 单条链接解析入库。
5. TikHub provider 增加 `detail` 模式：
   - 小红书单条：优先 `web_v2/fetch_feed_notes_v4`，无法提取 note id 时使用 `web_v2/fetch_feed_notes_v3`。
   - 抖音单条：优先 `app/v3/fetch_one_video`，无法提取 aweme id 时使用 `web/fetch_one_video_by_share_url`。
6. 入库时默认尝试拉评论：
   - 小红书评论：`web_v3/fetch_note_comments`。
   - 抖音评论：`app/v3/fetch_video_comments`。
   - 评论失败不阻塞主内容保存。
7. 评论数据写入：
   - `trace_payload.materialComments`，供页面和 Agent 快速读取。
   - `imported_comments`，沿用已有评论明细表。
8. 原始 TikHub provider response 随素材 trace payload 保存，但普通用户页面不展示 raw JSON。
9. 咨询 Agent 工具 `search_benchmark_materials` 支持 `detailUrl`，返回正文、互动数据、结构化字段和评论摘要。
10. 新增 TikHub normalizer 单测。

## 改动文件

- `app/src/app/api/materials/benchmark-search/route.ts`
- `app/src/components/app/dashboard-shell.tsx`
- `app/src/components/merchant/content-center.tsx`
- `app/src/lib/db/material-library-repository.ts`
- `app/src/server/api/consultation-runtime/tools.ts`
- `app/src/server/api/consultation-service.ts`
- `app/src/server/api/material-library-service.ts`
- `app/src/server/api/schemas.ts`
- `app/src/server/import-providers/tikhub/materials.ts`
- `app/src/server/import-providers/tikhub/normalizers.ts`
- `app/src/server/import-providers/tikhub/normalizers.test.ts`
- `app/src/server/import-providers/tikhub/types.ts`
- `docs/产品文档/V2.6-社媒爆款内容库PRD.md`
- `docs/progress/2026-05-21-social-viral-content-library.md`

## 验证结果

```bash
cd app
pnpm run typecheck
pnpm run lint
node --test src/server/import-providers/tikhub/normalizers.test.ts
```

结果：

- TypeScript：通过。
- ESLint：通过，有 10 个仓库既有 unused warning，非本轮引入。
- Normalizer test：2 条通过。

## 风险与后续建议

1. TikHub detail/comment 端点按 2026-05-21 官方文档接入，仍需要用真实链接在 staging 验证字段形态。
2. 小红书评论接口需要 `xsec_token`；如果单条或搜索结果中缺该字段，会标记评论跳过，但主内容仍入库。
3. 默认每条内容额外拉评论，可能增加 TikHub 调用成本；可通过 `TIKHUB_MATERIAL_COMMENT_COUNT=0` 临时关闭。
4. 本轮没有做 P2 的引用次数/引用时间统计。
5. 本轮没有新增平台管理员 raw JSON 调试入口。

## 下一步

1. 用户验收页面和交互。
2. 配置服务端 TikHub key 到目标环境的 `TIKHUB_API_KEY`。
3. 用 1 条小红书链接、1 条抖音链接、1 个关键词、1 个博主主页做 staging 联调。
4. 验收后再决定 push / merge / release。
