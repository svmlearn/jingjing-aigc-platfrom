# 2026-05-22 Phase 2A Content / Video Repository Supabase Fallback Removal

## Scope

本批只处理第二阶段矩阵中的低风险内容 / 视频工作台 repository：

- `app/src/lib/db/content-draft-repository.ts`
- `app/src/lib/db/video-edit-job-repository.ts`
- `app/src/lib/db/media-repository.ts`
- `app/src/lib/db/daily-content-task-repository.ts`

未进入 merchant-media、knowledge、platform-admin、agent-console、storage provider、worker、package removal，也未删除 `app/src/lib/supabase/*`。

## Runtime Changes

### `content-draft-repository.ts`

- 删除 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`cloudSupabaseRequiredError` imports。
- 删除 `source_items`、`content_drafts`、`content_variants` 的 Supabase fallback branches。
- 删除 fallback-only row mapper、select 常量、legacy local-real-chain unused imports。
- 公开函数直接委托现有 PostgreSQL helpers：
  - `pgCreateManualSourceItem`
  - `pgCreateDraftWithVariants`
  - `pgListDraftBundlesByMerchant`
  - `pgGetDraftBundleByMerchant`
  - `pgApproveContentVariant`
  - `pgAppendContentVariantToDraft`
  - `pgUpdateContentVariantScript`
  - `pgAssertContentVariantAccess`
  - `pgAppendContentDraftRevisionTrace`

### `video-edit-job-repository.ts`

- 删除 Supabase admin fallback 和 fallback-only `video_edit_jobs` row mapper。
- 保留 PostgreSQL 状态机 helper：
  - `pgFindInFlightVideoEditJobForScope`
  - `pgCreateVideoEditJob`
  - `pgListVideoEditJobs`
  - `pgGetVideoEditJobById`
  - `pgRetryVideoEditJob`
  - `pgCancelVideoEditJob`
- `createVideoEditJob()` 仍先调用 `findInFlightVideoEditJobForScope()`，再调用 `pgCreateVideoEditJob()`，保持 in-flight dedupe 语义。
- 本文件之前只 import local-real-chain helpers 但没有实际调用，本批删除这些 unused imports；server-level local real-chain 分支仍在 `video-edit-jobs-service.ts`，未触碰。

### `media-repository.ts`

- 删除 Supabase admin fallback。
- 删除 fallback-only `getNextAssetSortOrder()`、row mapper 和 select 常量。
- `assertMediaOwnerAccess()` 直接委托 `pgAssertMediaOwnerAccess()`。
- `createAssetObject()` 直接委托 `pgCreateAssetObject()`。
- `listAssetObjectsByOwner()` 直接委托 `pgListAssetObjectsByOwner()`。
- 源码契约确认 PostgreSQL helper 仍覆盖 `source_item`、`content_draft`、`voice_profile`，并通过 `pgAssertContentVariantAccess()` 覆盖 content variant owner access。

### `daily-content-task-repository.ts`

- 删除 Supabase admin fallback。
- 删除 `isPostgresDailyContentTaskEnabled()` gate 和 Supabase not-configured branch。
- `getDailyContentTask()`、`upsertDailyContentTask()`、`getDailyContentTaskById()`、`updateDailyContentTaskGeneratedContent()` 全部直接走 `queryAppDb()`。
- PostgreSQL 未配置时由 `queryAppDb()` / `getAppPostgresPool()` 抛当前 `APP_DATABASE_NOT_CONFIGURED` 口径错误，不再出现 Supabase 文案。

## Tests

- 删除旧 `app/src/lib/db/content-draft-repository-contract.test.ts`。
- 新增可直接用 Node 20 运行的源码契约测试：
  - `app/src/lib/db/content-video-repository-phase-2a-contract.test.mjs`
- 契约覆盖：
  - 4 个 Phase 2A repository 不再包含 Supabase/admin fallback 字符串。
  - content draft 公开函数仍委托对应 `pg*` helper。
  - video edit job 仍保留 in-flight dedupe、create/list/get/retry/cancel PostgreSQL helpers。
  - media repository 仍委托 `pgAssertMediaOwnerAccess`、`pgCreateAssetObject`、`pgListAssetObjectsByOwner`。
  - daily content task 4 个公开函数仍有 app database query path。

说明：旧 `.ts` 契约测试不能被本项目当前 Node 20 `node --test` 直接执行，本批改为 `.mjs` 源码契约测试，避免新增 loader。

## Verification

已通过：

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|cloudSupabaseRequiredError|requireCloudSupabaseAdmin|@/lib/supabase|Supabase|supabase" \
  app/src/lib/db/content-draft-repository.ts \
  app/src/lib/db/video-edit-job-repository.ts \
  app/src/lib/db/media-repository.ts \
  app/src/lib/db/daily-content-task-repository.ts
```

结果：无命中。

```bash
cd app && node --test src/lib/db/content-video-repository-phase-2a-contract.test.mjs
```

结果：5 tests passed。

```bash
cd app && npm run lint -- \
  src/lib/db/content-draft-repository.ts \
  src/lib/db/video-edit-job-repository.ts \
  src/lib/db/media-repository.ts \
  src/lib/db/daily-content-task-repository.ts \
  src/lib/db/content-video-repository-phase-2a-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 未处理 `merchant-media-repository.ts`；它仍是高风险 Supabase-only repository，需单独设计 PostgreSQL 替代或确认删除。
- 未处理 `knowledge-repository.ts`、`platform-admin-repository.ts`、`agent-console-repository.ts`。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。

## Review Follow-Up: PostgreSQL `productionScenes`

Review 发现 Phase 2A 删除 Supabase fallback 后暴露了一个 PostgreSQL 主线缺口：

- `content-draft-repository.ts` 仍接受 `variant.productionScenes` / `input.productionScenes`。
- 但真正执行写入的 `postgres-video-chain-repository.ts` 没有把 `productionScenes` 写入 `content_variants`。
- `mapContentVariant()` 固定返回 `productionScenes: []`。
- 当前 app DB baseline 也没有 `content_variants.production_scenes`。
- 下游 `video-edit-jobs-service.ts` 会读取 approved variant 的 `productionScenes` 构造视频任务 payload，所以这是 Phase 2A 必须补上的 PostgreSQL 主线缺口，不是 Phase 2B 范围。

本次 follow-up 修复：

- 新增 app DB migration：
  - `app/db/migrations/202605220001_content_variant_production_scenes.sql`
  - 增加 `production_scenes jsonb not null default '[]'::jsonb`
  - 增加 idempotent check constraint：`content_variants_production_scenes_array`
- 更新 `app/src/lib/db/postgres-video-chain-repository.ts`：
  - `ContentVariantRow` 增加 `production_scenes`
  - `contentVariantSelect` 增加 `"production_scenes"`
  - `pgCreateDraftWithVariants()` 写入 `JSON.stringify(variant.productionScenes ?? [])`
  - `pgAppendContentVariantToDraft()` 写入 `JSON.stringify(input.productionScenes ?? [])`
  - `mapContentVariant()` 改为 `toProductionScenes(row.production_scenes)`
  - `pgAssertContentVariantAccess()` 返回 `productionScenes`，保证视频任务 access path 能读到该字段
- 更新 `app/src/lib/db/content-video-repository-phase-2a-contract.test.mjs`：
  - 覆盖 app DB migration 中的 column/default/constraint
  - 覆盖 PostgreSQL insert/select/mapper 里的 `production_scenes`
  - 覆盖 `productionScenes` 不再固定为 `[]`

Follow-up 验证已通过：

```bash
cd app && node --test src/lib/db/content-video-repository-phase-2a-contract.test.mjs
```

结果：6 tests passed。

```bash
cd app && npm run lint -- \
  src/lib/db/postgres-video-chain-repository.ts \
  src/lib/db/content-video-repository-phase-2a-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|cloudSupabaseRequiredError|requireCloudSupabaseAdmin|@/lib/supabase|Supabase|supabase" \
  app/src/lib/db/content-draft-repository.ts \
  app/src/lib/db/video-edit-job-repository.ts \
  app/src/lib/db/media-repository.ts \
  app/src/lib/db/daily-content-task-repository.ts
```

结果：无命中，未恢复任何 Supabase fallback。

```bash
git diff --check
```

结果：通过。
