# 2026-05-25 Phase 2F Merchant Media Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2F：

- `app/src/lib/db/merchant-media-repository.ts`
- `app/db/migrations/202605250001_merchant_media_tables.sql`
- `app/src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs`

本批在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。未切到主目录 `main`，未处理主目录 `main` 上的暂存/未提交变更。

未触碰：

- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/lib/supabase/*`
- `app/package.json` / lockfile
- worker / storage / COS / OSS 相关文件
- 既有 untracked inventory 文档

## Schema Check

先查 `app/db/migrations`，未发现 `merchant_media_assets` / `merchant_media_clips` 当前 app DB 表定义。

历史表只存在于：

- `app/supabase/migrations/202605150002_merchant_media_library.sql`
- `app/supabase/migrations/202605150004_merchant_media_segment_clips.sql`

因此本批新增 app DB migration：

- `app/db/migrations/202605250001_merchant_media_tables.sql`

该 migration 从历史迁移整理当前 PostgreSQL 需要的表、索引、约束和 `updated_at` trigger，但不照搬 RLS、policy、legacy auth 函数或 service-role grant。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured`。
- 删除 `cloudSupabaseRequiredError`。
- 删除 `SupabaseMerchantMediaRepository` / `SupabaseMerchantMediaPrivateClipRepository` 命名。
- 删除 `merchant_media_assets` / `merchant_media_clips` 的 Supabase `.from(...)` data access。
- `getMerchantMediaRepository()` 现在直接返回 `PostgresMerchantMediaRepository`。
- `getPrivateMediaRepository()` 现在直接返回 `PostgresMerchantMediaPrivateClipRepository`。

### PostgreSQL app DB path

- `upsertAsset()` 直接写 `public.merchant_media_assets`：
  - 保留 `assertMerchantMediaRepositoryAsset()` contract gate。
  - 保留 `merchant_id + idempotency_key` 幂等 upsert。
  - 返回 `merchantMediaAssetSelect` 映射后的 DTO。
- `upsertReadyClip()` 使用 `withAppDbTransaction()`：
  - 先通过 `assertMerchantMediaAssetExists()` 确认 asset 属于同一 merchant。
  - 再写 `public.merchant_media_clips`。
  - 保留 `asset_id + clip_index` 幂等 upsert。
  - 保留 tag arrays、bucket/key、mime、timing/dimension 字段写入。
- `listAssetsByMerchant()` 直接按 `merchant_id` 查询 `public.merchant_media_assets`，按 `created_at desc` 排序。
- `listReadyClipsByMerchant()` / private clip repository 直接按 `merchant_id` + `status = 'ready'` 查询 `public.merchant_media_clips`。
- `getReadyClipByMerchant()` 直接限定 `id` + `merchant_id` + `status = 'ready'`，不会返回其他商家或非 ready clip。
- `getClipById()` 保留 private repository 语义：按 clip id 查询单条 clip，供下载链路再做调用侧约束。

## Migration Details

新增 `public.merchant_media_assets`：

- 主键：`id uuid primary key default gen_random_uuid()`
- `merchant_id` 引用 `public.merchant_profiles(id)`
- `uploaded_by_user_id` 改为引用当前 app-owned `public.app_users(id)`，不再引用 historical auth users
- 保留 `media_type`、`source`、`source_cos_key`、`status`、`idempotency_key`
- 保留约束：
  - media type: `image` / `video`
  - source: `merchant_upload` / `merchant_confirmed`
  - status lifecycle
  - `source_cos_key like 'merchant-media/%/originals/%/%'`
- 保留索引：
  - `ux_merchant_media_assets_idempotency`
  - `idx_merchant_media_assets_merchant_status_created_at`
  - `idx_merchant_media_assets_uploaded_by`

新增 `public.merchant_media_clips`：

- `asset_id` 引用 `public.merchant_media_assets(id)`
- `merchant_id` 引用 `public.merchant_profiles(id)`
- 保留 clip metadata、tags、bucket/key、thumb key、mime、timing/dimensions 字段
- 保留 v2 约束：
  - media type
  - nonnegative clip index
  - clip type
  - orientation
  - status
  - tags array and minimum tags
  - tag source
  - tag confidence range
  - dimensions
  - video/image timing rules
- 保留索引：
  - `ux_merchant_media_clips_asset_index`
  - `idx_merchant_media_clips_merchant_status_created_at`
  - `idx_merchant_media_clips_merchant_media_status`

未连接真实 DB 做数据确认；本批只补当前 app DB migration 草案和 repository 主线路径。

## Tests

新增源码契约测试：

- `app/src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`、`cloudSupabaseRequiredError`。
- entrypoints 返回 PostgreSQL repository class。
- repository 使用 `queryAppDb`、`withAppDbTransaction`、`mapPostgresError` 和 `public.merchant_media_assets` / `public.merchant_media_clips`。
- asset upsert 保留 `merchant_id + idempotency_key`。
- ready clip upsert 保留同 merchant asset 校验和 `asset_id + clip_index`。
- readers 保留 merchant-scoped 和 ready-only 过滤。
- migration 包含必要表、索引、约束，并确认未带 RLS / policy / legacy auth function。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/merchant-media-repository.ts src/lib/db/merchant-media-repository-phase-2f-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase/admin|supabase|Supabase|\.from\(|cloudSupabaseRequiredError" app/src/lib/db/merchant-media-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- `PrivateMediaClipRecord` 字段仍保留现有 `bucketName`、`cosKey`、`thumbCosKey` contract；storage/COS/OSS 命名清理由后续 storage 阶段处理。
- 未处理 `video-edit-jobs-service.ts`。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未处理 `app/src/lib/supabase/*`。
- 未 push，未部署，未合并 main。
