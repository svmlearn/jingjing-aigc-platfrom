# 2026-05-15 商家素材库 Migration 合同

## 目标

在不要求本机 Supabase key / staging DB 的前提下，补齐 `merchant_media_assets` / `merchant_media_clips` 的 schema、索引、幂等约束和 RLS 兜底证据，并用文本合同测试锁住关键门禁。

## 已完成

- 新增 migration：
  - `app/supabase/migrations/202605150002_merchant_media_library.sql`
- 新增 migration 合同测试：
  - `app/src/lib/merchant-media-migration-contract.test.ts`
- Migration 覆盖：
  - `merchant_media_assets` 直接带 `merchant_id`。
  - `merchant_media_clips` 直接带 `merchant_id`。
  - asset 记录 `uploaded_by_user_id`。
  - asset 来源只允许 `merchant_upload` / `merchant_confirmed`。
  - media type 只允许 `image` / `video`，voice M4A 不进入 `merchant_media_*`。
  - `merchant_id + idempotency_key` 幂等。
  - `asset_id + clip_index` 唯一。
  - V1 只允许 `clip_index = 0`。
  - V1 clip type 只允许 `full_video` / `image`。
  - full_video 必须 `start_time_seconds = 0` 且 `end_time_seconds = duration_seconds`。
  - image clip 不写 duration。
  - `tag_source` 允许 `fixture` / `mock` / `manual` / `vision_model`，mock/fixture 不伪装真实模型。
  - `merchant_id` / `status` / `media_type` 相关索引。
  - RLS enabled。
  - owner / active team member read policy。

## 验证

已执行：

```powershell
cd app
node --test src/lib/merchant-media-migration-contract.test.ts src/lib/merchant-media-repository-contract.test.ts src/lib/media-processing-contract.test.ts
./node_modules/.bin/tsc --noEmit
```

结果：

- `14` 个 Node tests 通过
- `tsc --noEmit` 通过
- Node 仅输出现有 `MODULE_TYPELESS_PACKAGE_JSON` warning

## Mock / Real 记录

- Migration：只做本地 SQL 文本合同，未连接 Supabase。
- RLS：只验证 migration 内存在策略，未在真实 staging DB 做双租户查询 smoke。
- Supabase app keys / service role：未作为 blocker。

## 后续

- 在 staging / 通用 Postgres 环境执行 migration 后，需要做真实双租户 smoke。
- 若服务端改用非 Supabase Postgres，应保留同等 schema、索引和 repository 显式 `merchant_id` 过滤。
