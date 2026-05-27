# 2026-05-27 社媒爆款内容库筛选与小红书图文可见性修复

## 背景

`shaokao@163.com` 的社媒爆款内容库已恢复历史抖音视频素材媒体预览。随后用户又手动导入了 1 条小红书图片/图文内容，但在「社媒爆款内容库」页面里不容易找到。

这次不要把该小红书图文计入此前回填的 80 条历史抖音视频。两者是不同批次：

- 历史恢复对象：`douyin / video / viral_reference = 80`。
- 用户新导入对象：`xiaohongshu / article / viral_reference = 1`，并已在导入链路中带图片资产。

## 根因判断

前端页面 `MerchantContentCenter` 原先固定请求：

```text
GET /api/materials?limit=80
```

然后再在浏览器内过滤 `usageType === "viral_reference"`。

这个做法有两个隐患：

1. 当前数据量已经达到 `80 条旧抖音 + 1 条新小红书 = 81 条`，固定 `limit=80` 会天然丢掉至少 1 条候选。
2. 页面没有平台和内容形态筛选，用户只能靠关键词搜索；当列表被截断时，即使数据库里有小红书图文，前端也可能没有拿到它。
3. API 原先也没有显式支持 `platform / materialType / usageType` 查询参数，未来素材数量继续增长后，仅靠前端本地过滤会再次出现“入库了但找不到”的错觉。

本轮远程 SSH 查询生产库时遇到 `Permission denied (publickey)`，因此没有继续强行做服务器读库验证。修复基于本地代码链路和此前已确认的线上数据结构完成。

## 本次改动

新增 API 筛选合同：

- `GET /api/materials?platform=xiaohongshu`
- `GET /api/materials?platform=douyin`
- `GET /api/materials?materialType=article`
- `GET /api/materials?materialType=video`
- `GET /api/materials?usageType=viral_reference`

服务端行为：

- `app/src/server/api/schemas.ts`：`listMaterialLibraryQuerySchema` 支持 `platform / materialType / usageType`，并把 `limit` 上限从 `100` 调到 `500`。
- `app/src/app/api/materials/route.ts`：把上述筛选参数传给 service。
- `app/src/server/api/material-library-service.ts`：当 `usageType=viral_reference` 时跳过项目私有素材，避免项目图片/视频夹进社媒爆款内容库。
- `app/src/lib/db/material-library-repository.ts`：在 SQL 查询 `source_items` 时先应用平台、图文/视频、用途筛选，再做 `limit`，避免前端拿到的是被截断后的错误候选集。

前端行为：

- `app/src/components/merchant/content-center.tsx`：
  - 社媒内容库默认请求 `limit=100&usageType=viral_reference`。
  - 增加平台筛选：`全量 / 小红书 / 抖音`。
  - 增加形态筛选：`全量 / 图文 / 视频`。
  - 列表和详情都展示平台与图文/视频标签。
  - 解析单条成功后自动切到该素材的平台和形态，避免新导入内容被当前筛选条件藏起来。
  - 找爆款成功后自动切到目标平台，形态回到全量。

## 验证

本地 worktree：

```text
/Users/wy/.codex/worktrees/social-content-filters-20260527
branch: codex/social-content-filters-20260527
base: main @ d60b354
```

已通过：

```text
NODE_OPTIONS=--conditions=react-server npm exec --yes tsx -- --test \
  src/server/api/material-library-filters-contract.test.mjs \
  src/server/api/material-provider-media-assets-contract.test.mjs \
  src/lib/db/material-library-phase-2b-contract.test.mjs

npm run typecheck

npm run lint -- \
  src/components/merchant/content-center.tsx \
  src/app/api/materials/route.ts \
  src/server/api/material-library-service.ts \
  src/lib/db/material-library-repository.ts \
  src/server/api/schemas.ts

git diff --check
```

说明：

- worktree 没有自己的 `node_modules`，运行 `typecheck/lint` 时临时复用主工作区 `app/node_modules` 软链；验证后已删除软链，未进入 Git。
- 生产服务器尚未 release 本次页面/API 改动。当前只是本地代码修复与验证通过。

## 后续注意

如果未来再出现“导入成功但社媒内容库找不到”：

1. 先检查页面请求是否带了 `usageType=viral_reference`。
2. 再检查是否被 `platform` 或 `materialType` 筛选条件隐藏。
3. 再查 `/api/materials?usageType=viral_reference&platform=xiaohongshu&materialType=article&limit=100` 是否返回。
4. 如果 API 返回但页面没有，查前端状态和 selectedId。
5. 如果 API 不返回，再查 `source_items.trace_payload.materialLibrary`、`structure_summary.materialUsageType`、`structure_summary.materialType`。

