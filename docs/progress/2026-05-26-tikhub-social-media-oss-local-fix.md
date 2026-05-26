# 2026-05-26 TikHub 社媒爆款媒体 OSS 本地修复记录

## 状态

本记录对应本地 worktree：

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-tikhub-media-oss
branch: codex/tikhub-media-oss
```

该修复只在本地 worktree 完成，未合并 `main`，未 push，未发布到服务器。

## 现网导入动作

按用户要求，第二个抖音博主 `探烤三国昵昵` 不做全量 341/342 条导入，只导入作品网格中按可见点赞数排序的前 30 条。

导入目标：

```text
http://8.154.28.41/dashboard/content
社媒爆款内容库 -> 解析单条
```

导入结果：

```text
total: 30
ok: 30
failed: 0
finishedAt: 2026-05-26T11:13:03.890Z
```

说明：这次现网导入发生在 OSS 自动下载逻辑发布之前，因此导入内容仍按当前线上逻辑保存 TikHub 解析字段，不代表媒体文件已经下载到 OSS。

## 本地修复内容

本地修复目标：

1. TikHub 返回的图片 / 视频 URL 在导入社媒爆款内容库后，下载到当前配置的 Aliyun OSS。
2. OSS 对象挂在对应 `source_items` 下，即：

```text
asset_objects.owner_type = source_item
asset_objects.owner_id = source_items.id
storage_key = source-assets/{merchantId}/{sourceItemId}/social-viral/{assetType}-{sortOrder}-{hash}.{ext}
```

3. 社媒爆款内容库素材和商家上传视频素材保持分离：
   - 社媒爆款素材：`source-assets/.../social-viral/...` + `source_items.trace_payload.materialSourceKind = benchmark`
   - 商家上传素材：仍走项目素材 / merchant media 既有链路
4. 视频工作台读取商家可剪辑素材时，旧兼容查询只接受 `project_media_asset` 的视频，避免把 TikHub 爆款视频混入商家上传视频素材。

## 页面补充

用户确认截图中的 `社媒爆款内容库` 页面也需要支持未来下载后的图片 / 视频展示后，已在本地补充：

1. `MaterialLibraryItemDto` 新增可选 `mediaAssets` 字段。
2. `/api/materials` 列表返回前，会按 `sourceItemId` 读取 `asset_objects(owner_type='source_item')`，并生成 `/api/media/object-preview?path=...` 预览地址。
3. `社媒爆款内容库` 左侧列表卡片优先展示封面 / 图片缩略图；没有图片时保留原有图文 / 视频图标。
4. 右侧详情增加 `媒体预览` 区：
   - 视频资产用原生 `<video controls>` 预览。
   - 图片 / 封面资产用 `<img>` 展示，点击打开预览地址。
5. 该展示只读取社媒爆款内容挂在 `source_item` 下的资产，不改变商家上传视频素材库。

## 改动文件

```text
app/src/components/merchant/content-center.tsx
app/src/contracts/material.ts
app/src/server/api/material-provider-media-assets.ts
app/src/server/api/material-provider-media-assets-contract.test.mjs
app/src/server/api/material-library-service.ts
app/src/lib/db/merchant-media-repository.ts
app/src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
app/src/server/import-providers/tikhub/normalizers.test.ts
```

## 验证

已通过：

```bash
cd app
node --test src/server/api/material-provider-media-assets-contract.test.mjs
node --test src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
node --test src/server/import-providers/tikhub/normalizers.test.ts
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
```

其中 `normalizers.test.ts` 有既有 Node module type warning，不影响测试通过。

本地 dev server 验证：

```text
url: http://localhost:3015/dashboard/content
result: 重定向到 /login?error=unauthenticated&next=/dashboard
note: 本地 dashboard 需要登录态；本轮未使用线上账号登录验证 UI。
```

## 待处理

1. 本地修复尚未 commit。
2. 尚未 code-review。
3. 尚未合入 main。
4. 尚未发布服务器。
5. 现网已有旧逻辑导入的 TikHub 素材如需补 OSS 文件，需要在发布后做回填脚本或重新解析导入。
