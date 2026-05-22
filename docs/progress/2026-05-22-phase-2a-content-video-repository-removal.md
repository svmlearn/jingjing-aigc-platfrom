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
