# 2026-05-05 TikHub 对标素材工具封装记录

## 背景

本轮目标是把 TikHub 的小红书、抖音素材检索能力先封装成服务端 provider，供两个场景复用：

1. 商家端素材中心：用户通过关键词或博主主页链接补充对标素材。
2. 咨询 Agent：后续营销专家可调用同一工具检索赛道内容，并把结果沉淀到素材中心缓存。

## 已完成

1. 新增 TikHub provider 封装：
   - `app/src/server/import-providers/tikhub/client.ts`
   - `app/src/server/import-providers/tikhub/materials.ts`
   - `app/src/server/import-providers/tikhub/normalizers.ts`
   - `app/src/server/import-providers/tikhub/types.ts`
2. 支持检索方式：
   - 小红书关键词检索：TikHub Web V3 search notes。
   - 小红书主页链接检索：TikHub App V2 user posted notes。
   - 抖音关键词检索：TikHub Douyin video search。
   - 抖音主页链接检索：先解析 `sec_user_id`，再拉取用户视频。
3. 素材中心服务改为 provider/cache 优先：
   - `createBenchmarkMaterialsForUser()` 继续兼容旧接口。
   - 新增 `createBenchmarkMaterialsForMerchant()`，可被 API route 和 Agent tool 共用。
   - 优先查 `source_items.trace_payload` 中的 provider cache key，命中后复制/复用到当前商家素材中心。
   - TikHub 未配置时不再伪装真实素材，而是写入失败态占位，提示配置服务端密钥。
4. 数据库落点：
   - 继续使用现有 `source_items` 表。
   - TikHub 结果写入 `platform`、`source_type`、`external_item_id`、`creator_id`、`source_url`、`title`、`raw_content`、`structure_summary`、`engagement_snapshot`、`trace_payload`。
   - `trace_payload` 增加 `materialProvider: "tikhub"` 与 `materialProviderCacheKey`，用于跨商家缓存查询。
5. 咨询 runtime 初步接入：
   - `ConsultationAgentToolKey` 增加 `search_benchmark_materials`。
   - 工具目录增加“检索对标素材”。
   - planner 可根据用户输入里的小红书/抖音主页链接或关键词生成工具参数。
   - consultation service 可执行该工具，并返回已入库素材摘要。
6. 环境变量：
   - `app/.env.example` 增加 `TIKHUB_API_KEY`、`TIKHUB_BASE_URL`、`TIKHUB_MATERIAL_CACHE_TTL_HOURS`。

## 验证

已在 `app/` 目录执行：

```bash
pnpm typecheck
pnpm lint
```

结果均通过。

另外，本轮实现前曾用临时 TikHub key 对官方 API 做过 raw request 验证：

1. 小红书 Web V3 关键词检索可返回真实笔记列表。
2. 小红书笔记详情接口可通过 `note_id + xsec_token` 返回详情。
3. 小红书 App V2 关键词检索 raw request 返回 400，因此当前关键词检索先采用 Web V3。
4. 抖音关键词检索、主页 `sec_user_id` 解析、用户视频列表接口已按官方 OpenAPI 形态封装。

## 未完成 / 后续

1. 商家端已存在 `/api/materials/benchmark-search` 和内容中心关键词/主页表单；本轮未做前端状态文案和浏览器验收。
2. 还没有在页面上区分展示“命中本地缓存 / 新查 TikHub / TikHub 未配置”的更细状态。
3. 还没有做 Supabase staging 的真实端到端写入验证，本轮只做了类型检查、lint 和 TikHub raw API 探测。
4. 后续如果营销专家默认启用该工具，需要在后台专家配置中明确勾选，避免普通咨询消息无意触发付费 API。
