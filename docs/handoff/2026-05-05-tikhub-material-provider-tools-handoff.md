# 2026-05-05 TikHub 对标素材工具封装 Handoff

## 当前目标

把 TikHub 的小红书 / 抖音内容检索能力封装成可复用服务端工具，让商家素材中心和咨询 Agent 的营销专家共用，并把检索结果沉淀进数据库缓存，减少重复 API 调用成本。

## 当前状态

已完成服务端封装、素材中心入库/cache 逻辑、咨询 runtime 工具初步接入。

未提交、未 push、未 merge。

当前分支：

```bash
codex/v2.2-roundtable-multi-agent
```

本轮开工前主目录已有大量脏改动。为避免覆盖用户/前序 Agent 工作，开工前已导出基线 patch：

```bash
/tmp/xhs-douyin-platform-baseline-20260505-133747.patch
```

## 本轮主要改动文件

新增：

```text
app/src/server/import-providers/tikhub/client.ts
app/src/server/import-providers/tikhub/materials.ts
app/src/server/import-providers/tikhub/normalizers.ts
app/src/server/import-providers/tikhub/types.ts
docs/progress/2026-05-05-tikhub-material-provider-tools.md
docs/handoff/2026-05-05-tikhub-material-provider-tools-handoff.md
```

修改：

```text
app/.env.example
app/src/contracts/knowledge.ts
app/src/lib/db/material-library-repository.ts
app/src/server/api/material-library-service.ts
app/src/server/api/consultation-service.ts
app/src/server/api/consultation-runtime/planner.ts
app/src/server/api/consultation-runtime/tools.ts
```

注意：`app/src/server/api/consultation-runtime/` 当前整体在 git status 中显示为 untracked 目录，其中存在前序 V2.2 runtime 工作。本轮只在该目录内接入了工具目录和 planner 参数生成，不应把整个目录都视为本轮新增。

## 验证结果

在 `app/` 目录执行：

```bash
pnpm typecheck
pnpm lint
```

均通过。

## 重要实现约定

1. TikHub key 只从服务端环境变量读取：
   - `TIKHUB_API_KEY`
   - 或兼容 `TIKHUB_TOKEN`
2. 可选配置：
   - `TIKHUB_BASE_URL`
   - `TIKHUB_MATERIAL_CACHE_TTL_HOURS`
3. provider cache key 由 `platform + findMethod + normalized target` 生成。
4. 缓存查询先跨商家查已有 `source_items`，命中后再 upsert 到当前商家，避免重复调用 TikHub。
5. TikHub 未配置时，素材中心会得到失败态占位素材，方便前端明确展示“未配置”，不会假装已经采集成功。

## 下一步建议

1. 用现有 `POST /api/materials/benchmark-search` 做一次 staging 浏览器验收：
   - 关键词搜索对标素材。
   - 粘贴博主主页链接导入。
   - 页面上能看出成功、空结果、未配置、失败等状态。
2. 如果产品上需要明确解释 API 成本，可在前端补“本次命中缓存 / 新查平台”的弱提示。
3. 后台专家配置中给“营销专家”开放 `search_benchmark_materials` 工具，并在 prompt 中约束调用时机：
   - 用户明确要看赛道内容、对标账号、选题方向、爆款拆解时再调用。
4. 在 staging Supabase 环境用真实商家跑一次端到端验证：
   - 第一次调用应走 TikHub 并写入 `source_items`。
   - 第二次相同关键词/主页应优先命中缓存。
