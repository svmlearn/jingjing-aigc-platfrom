# 2026-05-15 媒体上传完成本地合同

## 目标

在不把 Supabase / 真实 COS 回调 / 真实媒体处理管线作为硬依赖的前提下，先把上传完成入口的核心约束落成纯函数合同。

## 已完成

- 新增纯合同模块：
  - `app/src/lib/media-upload-contract.ts`
- 合同覆盖：
  - 新上传必须使用 `tencent_cos`。
  - 上传 bucket 必须匹配当前配置 bucket。
  - storage key 必须落在对应 owner 前缀下：
    - 商家原始上传：`source-assets/{merchant_id}/{asset_id}/...`
    - 内容草稿临时输入：`draft-inputs/{merchant_id}/{draft_id}/...`
    - 声音 profile 原始参考音频：`voice-profiles/{merchant_id}/{profile_id}/...`
  - `source_item` 只允许 `merchant_upload` 来源。
  - `content_draft` 只允许 `member_task_temp` / `content_draft_temp` 来源。
  - `voice_profile` 只允许 `voice_profile` 来源，且只接受 audio。
  - declared MIME 与 detected MIME 必须同族，且 detected MIME 必须匹配请求的资产类型。

## 验证

已执行：

```powershell
cd app
node --test src/lib/media-upload-contract.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `5` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- COS 上传完成：纯本地 contract，未调用真实 COS。
- Supabase：未作为硬依赖，未读取 Supabase app keys / service role。
- 本地测试素材：本切片未读取 `D:\Desktop\测试素材`，未复制二进制进 git。
- 重要素材语义：`D:\Desktop\测试素材` 下 MP4 只能作为 raw merchant upload 输入；M4A 只能作为 raw user voice recording / ref audio 输入。它们不是已裁剪、已缩略图、已分析、已打标签的 `merchant_media_clips`，也不是已可用的 voice profile。

## 后续

- 若接入真实上传回调，应把本合同放在 DB 写入前。
- 后续处理管线需要显式建模 `raw_upload -> processed_ready`，不能把本地 MP4 直接当成 ready clip。
- 声音链路需要显式建模 `raw_recording -> pending -> provider/mock success -> current profile swap`，不能把本地 M4A 直接当成 ready voice profile。
