# 2026-05-15 商家团队素材库本地合同

## 目标

在 Supabase 不作为硬依赖的前提下，把商家团队素材库的核心业务规则先落成纯合同测试，供后续真实 DB / Postgres repository 接入。

## 已完成

- 新增纯合同模块：
  - `app/src/lib/merchant-media-library-contract.ts`
- 合同覆盖：
  - `merchant_id` 必填。
  - `uploaded_by_user_id` 必填。
  - 只有 `merchant_upload` / `merchant_confirmed` 可进入团队素材库。
  - `member_task_temp` / `content_draft_temp` / `voice_profile` / `worker_output` 不得进入 `merchant_media_*`。
  - 原始素材 key 必须在 `merchant-media/{merchant_id}/originals/{asset_id}/` 下。
  - ready asset 必须至少有一个同商家、同媒体类型的 ready clip。
  - ready clip 必须有 clip COS key、thumbnail key、description、至少 3 个 tags、orientation、width、height。
  - video ready clip 必须有 `duration_seconds`。
  - ready clip listing 显式按 `merchantId` 和 `status=ready` 过滤。

## 验证

已执行：

```powershell
cd app
node --test src/lib/merchant-media-library-contract.test.ts src/lib/private-media-pexels-adapter.test.ts src/server/api/private-media-pexels-service.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `12` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- 商家素材库：纯本地 fixture / contract，未接真实 Supabase。
- 媒体解析：本切片未做真实 ffprobe / metadata extraction。
- 本地二进制测试素材：未读取 `D:\Desktop\测试素材`，未复制二进制进 git。

## 后续

- 将该纯合同接入真实 `merchant_media_assets` / `merchant_media_clips` repository 或通用 Postgres repository。
- 后续媒体解析 / metadata extraction slice 如需本地素材，可使用 `D:\Desktop\测试素材` 下 MP4，但不得提交二进制。
