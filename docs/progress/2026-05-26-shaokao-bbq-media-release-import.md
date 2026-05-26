# 2026-05-26 shaokao 烧烤视频素材发布与打标导入

## 结论

- 目标账号：`shaokao@163.com`
- 用户 ID：`c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941`
- 商家 ID：`a8df8d8a-38f2-49b0-bda7-40c48d3537cf`
- 商家名称：`烧烤商家`
- 生产 release 已切到 `7620bf0`：
  - `/srv/jingjing-domestic/current -> /srv/jingjing-domestic/releases/20260526221928-7620bf0`
- 已删除旧的 14 条 `shaokao@163.com` 视频素材：
  - DB：旧 `source_items` 14 条、旧 `asset_objects` 14 条已删除。
  - OSS：旧备份清单中的 14 个 `source-assets/...` object 已确认不存在。
- 已导入新的 94 条烧烤视频素材：
  - OSS：上传到 `jingjing-domestic-phase1-hz/source-assets/a8df8d8a-38f2-49b0-bda7-40c48d3537cf/...`
  - DB：写入 `source_items + asset_objects`
  - 检索状态：`ready_material_library_video_assets = 94`

## 为什么没有写入 `merchant_media_*`

原计划是按新表写入：

- `merchant_media_assets`
- `merchant_media_clips`
- OSS 前缀：`merchant-media/<merchantId>/...`

实际生产环境的 Aliyun OSS/RAM 权限不允许当前 app key 写 `merchant-media/` 前缀，上传时报 `AccessDenied`。同一组凭证可写：

- `source-assets/`
- `draft-inputs/`
- `video-results/`

因此本次为了避免账号素材库空窗，改用当前代码已经兼容的 legacy 素材库路径：

- `source_items.trace_payload.materialLibrary = true`
- `trace_payload.materialAnalysis.materialCategory = project_media_asset`
- `trace_payload.materialAnalysis.assetType = video`
- `structure_summary.materialStatus = ready`
- `asset_objects.storage_provider = aliyun_oss`
- `asset_objects.storage_key like source-assets/<merchantId>/%`

`app/src/lib/db/merchant-media-repository.ts` 的 `listLegacyMaterialClipsByMerchantFromPostgres` 会把这类 legacy 视频素材合并进 private media clip 检索池，所以 video-worker / private Pexels 兼容接口可以读取这些素材。

## 导入包

本地素材与标签包：

- 视频目录：`/Users/wy/Downloads/烧烤素材候选_100_20260526/02_合规尺寸转码测试版`
- 本地标签目录：`/Users/wy/Downloads/烧烤素材候选_100_20260526/metadata/local_tagging_v2`
- progress 归档：`docs/progress/2026-05-26-视频素材处理-手动打标签/`

服务器 staging 目录：

- `/srv/jingjing-domestic/imports/bbq-media-20260526/manifest.json`
- `/srv/jingjing-domestic/imports/bbq-media-20260526/videos`
- `/srv/jingjing-domestic/imports/bbq-media-20260526/thumbs`

服务器备份目录：

- `/srv/jingjing-domestic/backups/shaokao-media-reset-20260526T2220/old-project-media-targets.json`
- `/srv/jingjing-domestic/backups/shaokao-media-reset-20260526T2220/old-oss-keys.txt`
- `/srv/jingjing-domestic/backups/shaokao-media-reset-20260526T2220/source-assets-import-preflight.json`
- `/srv/jingjing-domestic/backups/shaokao-media-reset-20260526T2220/source-assets-import-records.json`

## 本轮脚本

新增一次性脚本：

- `app/scripts/import-shaokao-bbq-media.mjs`
  - 原计划路径：上传 `merchant-media/` 并写 `merchant_media_*`。
  - 在生产环境因 OSS 前缀权限失败，未完成新表导入。
- `app/scripts/import-shaokao-bbq-source-assets.mjs`
  - 实际执行路径：上传 `source-assets/` 并写 `source_items + asset_objects`。
  - 写库前会校验账号、商家、bucket、数量、local file、external id、source url 冲突。
  - 上传前会 `head` 检查同 key object 尺寸，避免中断后重复上传。
  - 服务器执行时临时使用 `oss-cn-hangzhou-internal.aliyuncs.com`，公网 endpoint 太慢且曾触发响应超时。

## 验证结果

生产健康检查：

- `http://127.0.0.1:3000/api/health`：`ok`，database=`postgres`，storage=`aliyun_oss`
- `http://127.0.0.1:8000/ready`：`ready`
- `http://127.0.0.1:7860/api/ready`：`ready`

导入脚本最终返回：

```json
{
  "finalCounts": {
    "source_items": 94,
    "asset_objects": 94,
    "ready_material_library_video_assets": 94
  }
}
```

独立 DB 核对：

```text
merchant_media_assets      = 0
merchant_media_clips       = 0
ready_legacy_video_assets  = 94
old_material_titles        = 0
old_source_asset_key_shape = 0
```

旧 OSS object 核对：

```json
{
  "oldKeys": 14,
  "oldKeysStillExisting": 0
}
```

private media 兼容接口核对：

```json
{
  "query": "烤串",
  "total_results": 57,
  "returned": 5,
  "first": {
    "id": "source-item-asset-00b03217-3f58-52e7-909f-1dfbafbf81bf",
    "width": 1280,
    "height": 720,
    "duration": 125,
    "has_download": true
  }
}
```

## 已知后续

1. 需要补 OSS/RAM policy，让当前生产凭证可写 `merchant-media/` 前缀。
2. 权限补齐后，可以把本次 94 条从 legacy `source_items + asset_objects` 迁移或复制到 `merchant_media_assets + merchant_media_clips`。
3. 本次没有物理切分长视频；标签 JSON 中已有 `segmentPlan` / `长视频待切片审核` 等信息，后续自动打标或切片 worker 可以沿用这套标准继续处理。
4. 当前 legacy 检索路径不返回独立 `thumbStorageKey`。视频检索和下载可用；如果前端素材列表强依赖缩略图，需要后续补 cover/thumb 对象或迁移新表。
