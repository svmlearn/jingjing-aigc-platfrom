# 2026-05-27 shaokao 社媒爆款内容媒体预览回填

## 结论

`shaokao@163.com` 的社媒爆款内容库文字数据已经恢复可见，但图片/视频预览一开始没有回来，原因不是页面预览路由坏了，也不是 OSS 已有对象不可读，而是这批历史 `source_items` 当初入库时没有成功沉淀可下载媒体资产。

本次已在生产库对 `shaokao@163.com` 做一次回填：

- 抖音爆款内容：`80` 条。
- 每条补 1 个封面资产和 1 个视频资产。
- 新增/确认 `asset_objects`：`cover = 80`、`video = 80`。
- 回填期间用户新导入了 1 条小红书图片型爆款内容，带 `image = 10`。
- `/api/materials?limit=100` 验证：`viral = 81`，其中 `douyin = 80` 为本次回填对象，`xiaohongshu = 1` 为用户刚新导入的图片内容，`noAssetsCount = 0`。
- 预览 URL 形态：`/api/media/object-preview?path=oss://...`，路由返回 `302` 到 Aliyun OSS 签名地址。

所以用户在社交媒体爆款内容库里应能看到图片预览和视频预览。若浏览器已有旧接口缓存，刷新页面即可。

## 根因

问题不是“重新录入就一定会触发下载”这么简单。

当前导入链路是：

1. `createBenchmarkMaterialsForMerchant`
2. `fetchTikHubBenchmarkMaterials`
3. `normalizeTikHubMaterialItems`
4. `upsertMaterialLibraryItemsFromProvider`
5. `persistMaterialProviderMediaAssets`

媒体下载/转存发生在第 5 步，依赖第 3 步规范化出的：

- `structureSummary.coverUrl`
- `structureSummary.imageUrls`
- `structureSummary.videoUrls`

但这批 `shaokao@163.com` 的历史抖音单条详情内容里，`structure_summary.coverUrl/imageUrls/videoUrls` 都是空：

```text
viral_ready = 80
asset_objects = 0
with_media_candidate_urls = 0
cover_url_count = 0
image_url_count = 0
video_url_count = 0
```

进一步看 raw TikHub payload，媒体 URL 其实存在于：

```text
trace_payload.tikhubProviderResponses[0].responsePayload.data.aweme_detail.video
```

包括：

- `video.cover.url_list`
- `video.origin_cover.url_list`
- `video.dynamic_cover.url_list`
- `video.play_addr.url_list`
- `video.play_addr_h264.url_list`
- `video.download_addr.url_list`
- `video.bit_rate[].play_addr.url_list`

真正的代码根因是 `collectDouyinAwemeItems` 之前会递归收集所有含 `aweme_id` 的对象，TikHub 详情响应里同时存在：

- 真正素材对象：`data.aweme_detail`
- 元数据对象：`params.aweme_id`
- 其他只带 ID 的统计/状态对象

历史导入时 normalizer 可能选中了只有 `aweme_id` 的小对象，导致：

- 标题退化成 `https://www.douyin.com/video/... · 抖音对标视频 1`
- `coverUrl/imageUrls/videoUrls` 为空
- 后续 `persistMaterialProviderMediaAssets` 没有候选 URL，因此不会写 OSS / `asset_objects`

因此，单纯“重新录入 80 个”不一定是可靠修复：如果 cache 命中旧的 provider item，或者 normalizer 仍选错对象，仍可能不触发有效媒体转存。

## 本次代码修复

新增/修改：

- `app/src/server/import-providers/tikhub/normalizers.ts`
  - `collectDouyinAwemeItems` 优先读取 `data.aweme_detail / aweme_detail / aweme_list`。
  - 新增 `isDouyinAwemeMaterialRecord`，要求记录除 `aweme_id` 外还必须具备 `video / desc / author / share_url / item_title` 等素材特征。
  - 明确排除 `params/status/statistics` 这类只带 `aweme_id` 的元数据对象。
- `app/src/server/import-providers/tikhub/normalizers.test.ts`
  - 增加回归测试：TikHub Douyin detail payload 同时存在 `params.aweme_id` 和 `data.aweme_detail` 时，必须选择真正的 `aweme_detail`。
- `app/scripts/backfill-social-viral-media-assets.mjs`
  - 支持 `--email` / `--merchant-id`。
  - 默认 dry-run；只有加 `--apply` 才写库和 OSS。
  - 从历史 `trace_payload.tikhubProviderResponses` 中提取 `aweme_detail`。
  - 更新 `source_items.title/script_text/structure_summary/trace_payload`。
  - 下载封面/视频，转存到 Aliyun OSS：
    - `source-assets/<merchantId>/<sourceItemId>/social-viral/cover-...`
    - `source-assets/<merchantId>/<sourceItemId>/social-viral/video-...`
  - 写入 `asset_objects`，`owner_type = source_item`。

## 生产执行记录

目标账号：

```text
email = shaokao@163.com
merchant_id = a8df8d8a-38f2-49b0-bda7-40c48d3537cf
merchant_name = 烧烤商家
```

先 dry-run：

```bash
sudo node backfill-social-viral-media-assets.mjs \
  --env-file /srv/jingjing-domestic/shared/env/app.env \
  --email shaokao@163.com \
  --limit 80
```

结果：

```text
mode = dry-run
rowsScanned = 80
awemeExtracted = 80
candidateAssetGroups = cover + video
persistedAssets = 0
sourceItemsUpdated = 0
```

再 apply：

```bash
sudo node backfill-social-viral-media-assets.mjs \
  --env-file /srv/jingjing-domestic/shared/env/app.env \
  --email shaokao@163.com \
  --limit 80 \
  --apply
```

结果：

```text
mode = applied
rowsScanned = 80
awemeExtracted = 80
sourceItemsUpdated = 80
persistedAssets = 160
persistedCovers = 80
persistedVideos = 80
skippedCount = 0
```

示例：

```text
sourceItemId = dfe3bc48-a87c-425c-9a2f-e3980434d640
titleBefore = https://www.douyin.com/video/7497573124315090228 · 抖音对标视频 1
titleAfter = 不得了了，看着别人出去浪，我受不了啊～#探烤三国昵昵 #五一出游穿搭 #五一去哪儿 #00后创业女孩 #同城美食
assets:
  cover -> source-assets/.../social-viral/cover-0-30858a3584a200fb.webp
  video -> source-assets/.../social-viral/video-1-6ed5cac00baef166.mp4
```

## 验证结果

DB 验证：

```text
viral_items = 80
asset_objects = 160
covers = 80
videos = 80
items_with_assets = 80
items_with_cover = 80
items_with_video = 80
```

回填期间用户新导入了 1 条小红书图片型爆款内容，已带 10 张图片资产：

```text
douyin/video = 80
xiaohongshu/article = 1
asset_objects by type:
  cover = 80
  video = 80
  image = 10
```

API 验证：

```text
GET /api/materials?limit=100
status = 200
total = 175
viral = 81
byPlatform:
  douyin = 80
  xiaohongshu = 1
noAssetsCount = 0
```

预览路由验证：

```text
mediaAssets[].signedPreviewUrl = /api/media/object-preview?path=oss%3A%2F%2F...
GET signedPreviewUrl -> 302
locationHost = jingjing-domestic-phase1-hz.oss-cn-hangzhou.aliyuncs.com
```

本地代码验证：

```text
cd app
NODE_OPTIONS=--conditions=react-server npm exec --yes tsx -- --test \
  src/server/import-providers/tikhub/normalizers.test.ts \
  src/server/api/material-provider-media-assets-contract.test.mjs

结果：10 passed

node --check scripts/backfill-social-viral-media-assets.mjs
结果：通过

npm run typecheck
结果：通过
```

## 重要注意

本次已经对生产数据完成回填，但 normalizer 修复仍必须进入代码主线并发布到服务器，否则未来新导入 Douyin 单条详情时，仍有机会再次选中 params-only 对象，导致新内容没有媒体候选 URL。

建议后续发布时确认：

1. 当前 main 包含 `normalizers.ts` 修复。
2. 新导入一条 Douyin detail 链接后，`structure_summary.coverUrl/videoUrls` 非空。
3. `asset_objects` 自动新增 `cover/video`。

## 回滚/排查口径

如果后续发现某条预览有问题：

1. 先查 `source_items.id` 对应的 `asset_objects`：
   - `owner_type = source_item`
   - `owner_id = <source_item_id>`
2. 看 `storage_key` 是否在 `source-assets/<merchantId>/<sourceItemId>/social-viral/` 下。
3. 看 API 是否返回 `mediaAssets[].signedPreviewUrl`。
4. 再访问 `/api/media/object-preview?path=...`，应返回 302 到 OSS 签名 URL。
5. 如果只有视频失败但封面正常，优先怀疑原始抖音视频 URL 过期/403/过大，而不是页面问题。

本次脚本是幂等设计的一部分：已有相同 `origin_url` 的资产会跳过。但不要并发跑多个 apply。
