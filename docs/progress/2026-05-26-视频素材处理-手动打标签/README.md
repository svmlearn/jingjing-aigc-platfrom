# 烧烤店本地商家视频素材标签包 v2

生成时间：`2026-05-26T20:31:14+08:00`

## 包内容

本目录是离线标签包，只包含 JSON/JSONL/CSV 和逻辑切片计划。未触碰服务器，未写数据库，未上传对象存储，未物理切分 mp4。

- `bbq_merchant_media_assets.json` / `.jsonl`：94 条 merchant media asset。
- `bbq_merchant_media_clips.json` / `.jsonl`：94 条 ready `full_video` clip；`storageKey` 直接等于对应 asset 的 `sourceStorageKey`，表示后续可用合规转码源对象作为完整视频 clip。
- `bbq_tag_review.csv`：94 行人工复核表。
- `bbq_segment_plan.json`：43 个长视频逻辑切片计划，合计 183 个 pending segment。所有 segment 均为 `physicalClipCreated=false`，未生成 ready segment clip 行。
- `bbq_validation.json`：结构、尺寸、标签、role/lens、provider-neutral 字段和导入门禁校验。

## 关键假设

1. 本包使用 provider-neutral 字段：`sourceStorageKey`、`storageKey`、`thumbStorageKey`。没有生成新的 `sourceCosKey`、`cosKey`、`thumbCosKey`。
2. `tagSource=manual`，更细的打标方法写在 `metadata.taggingRevision.method` 和 CSV review notes。
3. ready clip 仅为 `full_video`，不包含任何未真实存在的 segment mp4。
4. `thumbStorageKey` 是后续导入/切片阶段的计划 key；本任务未生成缩略图，因此 `readyForDbImport=false`。
5. `merchantId`、`uploadedByUserId`、`bucketName` 都是占位值，正式导入前必须替换并先上传对象。
6. 所有 clip 均保留 `待人工最终确认`。弱相关素材额外带 `弱相关素材`，避免 video-worker 把它们当作烧烤强素材优先使用。

## 导入前门禁

正式导入数据库前至少需要：

1. 替换真实 `merchantId`、`uploadedByUserId`、`bucketName`。
2. 将合规转码 mp4 上传到 `sourceStorageKey` 对应对象位置，或按导入器策略重写 key。
3. 生成并上传 `thumbStorageKey` 对应缩略图。
4. 对 `bbq_segment_plan.json` 中 pending 的长视频片段做人工审核；审核通过后再由 worker/ffmpeg 物理切片并生成真实 segment clip 行。
5. 复核 `bbq_tag_review.csv`，尤其是所有 `弱相关素材` 与 `长视频待切片审核`。

## 本轮校验摘要

- ffprobe 尺寸门禁：0 个失败。
- ready full_video clips：94。
- ready segment clips：0。
- 弱相关素材：11。
- 需要人工复核资产：46。
- package `ok`：true。
- `readyForDbImport`：false，原因见 `bbq_validation.json.dbImportBlockers`。
