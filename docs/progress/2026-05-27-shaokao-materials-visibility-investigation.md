# 2026-05-27 shaokao 素材库“看起来没了”排查

## 结论

`shaokao@163.com` 的数据没有被清空。

生产库当前状态：

- 用户仍存在且 active：
  - `app_users.id = c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941`
  - `app_users.email = shaokao@163.com`
  - `role = merchant_owner`
- 商家仍存在且 active：
  - `merchant_profiles.id = a8df8d8a-38f2-49b0-bda7-40c48d3537cf`
  - `name = 烧烤商家`
- 社媒爆款内容仍在 `source_items`：
  - `materialLibrary = 174`
  - `ready viral_reference = 80`
  - `imported_comments = 966`
- 新视频素材 clip 库仍在 `merchant_media_*`：
  - `merchant_media_assets = 94`
  - `merchant_media_clips = 94`
  - `ready video clips = 94`

页面上“像是没了”的主要原因不是生产数据丢失，而是列表接口和前端页面仍在旧素材库合同上，和 2026-05-26 的视频素材迁移状态发生了错位。

## 具体原因

### 1. 社媒爆款内容为空：分页窗口被 archived 视频素材占满

内容中心当前调用：

```text
GET /api/materials?limit=80
```

代码路径：

- `app/src/components/merchant/content-center.tsx`
- `app/src/app/api/materials/route.ts`
- `app/src/server/api/material-library-service.ts`
- `app/src/lib/db/material-library-repository.ts`
- `app/src/lib/material-retrieval.ts`

当前 repository 查询逻辑是：

1. 先从 `source_items` 按 `created_at desc` 取最近 `limit` 条。
2. 再在内存里过滤 `archived / failed`。

2026-05-26 视频迁移后，最新的 94 条 legacy 视频 `source_items` 被归档为：

```text
materialStatus = archived
materialUsageType = video_asset
materialType = video
count = 94
created_at = 2026-05-26 15:07:13.709135+08
```

而 80 条爆款内容更早：

```text
materialStatus = ready
materialUsageType = viral_reference
materialType = video
count = 80
created_at = 2026-05-26 10:39:13 到 11:12:54 +08
```

因此 `/api/materials?limit=80` 取到的前 80 条全是 archived 视频，随后被 `rankMaterialLibraryItemsForRetrieval` 过滤掉，最终返回 0。内容中心再过滤 `usageType === "viral_reference"`，自然也显示空。

生产库复现实测：

| 窗口 | candidates | 过滤 archived 后可见 | 可见 viral | 可见 project video |
| --- | ---: | ---: | ---: | ---: |
| `limit=80` 内容中心默认窗口 | 80 | 0 | 0 | 0 |
| `limit=100` 项目素材页窗口 | 100 | 6 | 6 | 0 |
| `limit=160` 带 query / retrievalTarget 窗口 | 160 | 66 | 66 | 0 |

这个问题的修复方向是：`listMaterialLibraryItems` 应该在 SQL 阶段先排除 `archived / failed`，再排序和 limit，不能先 limit 再过滤。

### 2. 视频素材为空：新 clip 库没有接回“项目媒体素材”页面

2026-05-26 权限修复后，94 条烧烤视频已从 legacy `source_items + asset_objects` 迁入新表：

```text
merchant_media_assets = 94
merchant_media_clips = 94
ready video clips = 94
```

同时为了避免 private media 检索重复，旧的 94 条 `source_items` 视频素材被归档：

```text
source_items archived video_asset = 94
source asset_objects video = 94
```

这符合当时的迁移收口目标：video-worker / private media 检索应该使用 `merchant_media_*` 新表。

但商家端“项目媒体素材”页面当前仍只读：

```text
GET /api/materials?limit=100
```

然后在前端过滤：

```ts
material.usageType === "image_asset" || material.usageType === "video_asset"
```

它没有读取 `merchant_media_assets / merchant_media_clips`，所以迁入新表后的 94 条视频对这个页面不可见。

这个问题的修复方向有两种：

1. 推荐：给项目媒体素材页接入 `merchant_media_*` 新表，或者新增 app 侧 project media endpoint，把新 clip 库映射成页面需要的 DTO。
2. 临时方案：把 legacy `source_items` 视频重新标成 ready，但必须同时避免 private media 检索重复；否则 video-worker 候选池可能同时拿到 legacy 和新表两份同源素材。

不建议直接恢复 legacy ready 作为长期方案。

## 当前生产只读查询证据

查询时间：

```text
2026-05-27 00:09 CST
```

服务器：

```text
ubuntu@8.154.28.41
/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526234730-f4d5542
```

账号与商家：

```text
user_id     = c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941
merchant_id = a8df8d8a-38f2-49b0-bda7-40c48d3537cf
team role   = owner
status      = active
```

素材总览：

```text
source_items total       = 174
material_library         = 174
material_ready           = 80
material_archived        = 94
viral_reference          = 80
video_asset_usage        = 94
legacy_project_video     = 94

merchant_media_assets    = 94
merchant_media_clips     = 94
merchant_media_ready     = 94

source_asset_objects     = 94
source_video_objects     = 94
imported_comments        = 966
```

## 处理建议

优先级：

1. 先修 `/api/materials` 的分页窗口问题，让社媒爆款内容恢复可见。
2. 再做项目媒体素材页的新表接入，让 94 条 `merchant_media_*` 视频素材能在商家端可见。
3. 不要直接把 94 条 legacy `source_items` 视频改回 ready，除非同时修改 private media 检索去重或禁用 legacy 兼容路径。

这次排查没有执行任何写库、删除、OSS 修改或服务重启。

## 2026-05-27 恢复修复

本次恢复采用代码修复，不回写 legacy 数据。

原因：

- 把 94 条 legacy 视频 `source_items` 直接改回 `ready` 会让 private media 同时从 legacy 和 `merchant_media_*` 读到同一批视频，存在重复候选风险。
- 正确收口是：社媒爆款继续从 `source_items` 可见；项目视频素材从 `merchant_media_*` 可见。

修复内容：

1. `app/src/lib/db/material-library-repository.ts`
   - `listMaterialLibraryItems` 在 SQL 阶段排除 `archived / failed`：
     - `coalesce(structure_summary->>'materialStatus', 'ready') not in ('archived', 'failed')`
   - 避免先 `limit` 再过滤导致 ready 爆款内容被 archived 视频挡住。
2. `app/src/server/api/material-library-service.ts`
   - `/api/materials` 返回时追加 `merchant_media_*` ready clips 映射出的项目媒体素材 DTO。
   - 映射后的项目视频：
     - `usageType = video_asset`
     - `retrievalTargets = ["video_edit_asset"]`
     - `materialCategory = project_media_asset`
     - `id = merchant-media-clip:<clipId>`
   - 这样商家端“项目媒体素材”页能看见新 clip 库中的 94 条视频。
3. `app/src/lib/db/material-library-phase-2b-contract.test.mjs`
   - 增加 SQL 阶段排除 archived/failed 的合同断言。
4. `app/src/server/api/material-provider-media-assets-contract.test.mjs`
   - 增加 `merchant_media_*` clips 暴露为项目媒体素材的合同断言。

本地验证：

```text
cd app && node --test src/lib/db/material-library-phase-2b-contract.test.mjs src/server/api/material-provider-media-assets-contract.test.mjs
结果：11 passed

cd app && pnpm typecheck
结果：通过

cd app && pnpm lint
结果：通过

git diff --check
结果：通过
```

待 release 后必须验证：

1. `GET /api/materials?limit=80` 登录 `shaokao@163.com` 后返回的 `viral_reference` 不再是 0，预期为 80。
2. `GET /api/materials?limit=100` 登录 `shaokao@163.com` 后返回的 `video_asset` 不再是 0，预期为 94。
3. `merchant_media_clips` 仍为 94 ready；legacy `source_items` 视频仍保持 archived，避免重复候选。
