# 2026-05-15 商家素材库 Repository 本地合同

## 目标

在 Supabase 不是硬依赖的前提下，先把 `merchant_media_assets` / `merchant_media_clips` 需要的 repository 接口和核心业务规则落成 in-memory 合同，便于后续接通通用 Postgres 或 Supabase repository。

## 已完成

- 新增本地 repository 合同：
  - `app/src/lib/merchant-media-repository-contract.ts`
- 新增测试：
  - `app/src/lib/merchant-media-repository-contract.test.ts`
- 合同覆盖：
  - 所有 list / get 操作必须显式传 `merchantId`。
  - 商家 A 不能读取商家 B 的 asset / ready clip。
  - asset upsert 使用 idempotency key，重复 complete 不重复创建 asset。
  - V1 ready clip upsert 使用 `merchantId + assetId + clipIndex` 幂等，重复处理不生成多条 ready clip。
  - V1 只接受 `clipIndex = 0`。
  - 视频只接受 `clipType = full_video`。
  - 图片只接受 `clipType = image`。
  - `member_task_temp` 等临时素材不得进入商家素材库。
  - `voice_profile` 来源不得进入商家素材库；M4A 录音只能留在 voice profile 链路。

## 验证

已执行：

```powershell
cd app
node --test src/lib/merchant-media-repository-contract.test.ts src/lib/media-processing-contract.test.ts src/lib/merchant-media-library-contract.test.ts src/lib/private-media-pexels-adapter.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `19` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- Repository：in-memory fake，未接 Supabase。
- DB：未跑真实 migration / RLS smoke。
- Supabase keys：未作为本切片 blocker。
- 本地测试素材：未读取 `D:\Desktop\测试素材`，未复制二进制进 git。

## 后续

- 后续真实 DB 层可优先接通通用 Postgres repository，再决定是否绑定 Supabase。
- migration 需要补 `merchant_media_assets` / `merchant_media_clips`、`merchant_id` 索引、`asset_id + clip_index` 幂等约束、RLS / service role 边界。
