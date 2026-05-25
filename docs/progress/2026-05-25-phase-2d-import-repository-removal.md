# 2026-05-25 Phase 2D Import Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2D 第四小批：

- `app/src/lib/db/import-repository.ts`
- `app/src/lib/db/import-repository-phase-2d-contract.test.mjs`

本批继续在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。未切到主目录 `main`，未处理主目录 `main` 上的暂存/未提交变更。

未触碰 `agent-console`、`merchant-media`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `import_jobs` 的 Supabase `.from(...)` fallback。
- 删除 `source_items` 的 Supabase `.from(...)` fallback。
- 删除 `imported_comments` 的 Supabase `.from(...)` fallback。
- 删除 `shouldUseAppPostgres()` helper。
- 删除 `isAppPostgresConfigured` / `isAppPostgresPreferred` gate。
- 本文件不新增 local demo fallback；非 demo 主线直接走 app DB。数据库未配置时由 `queryAppDb()` / `withAppDbTransaction()` 暴露当前 app DB 口径错误。

### PostgreSQL app DB path

- `createImportJob()` 直接插入 `public.import_jobs`，`input_payload` 继续通过 `JSON.stringify({ url, options })` 写入。
- `getImportJobById()` 继续通过 `pgGetImportJobById()` 校验 `merchant_id`。
- `listImportJobs()` 继续按 `created_at desc` 查询最近 50 条。
- `countRunningImportJobs()` 继续一次查询 merchant running 和 global running 两个计数。
- `updateImportJob()` 保留 partial update 语义：
  - 无更新字段时读回当前 job。
  - 有字段时用 boolean flags 控制 status / total / success / error / log update。
  - `finished === true` 时写 `finished_at = timezone('utc', now())`。
- `upsertSourceItems()` 继续使用 transaction：
  - 有 `external_item_id` 时走 `pgUpsertSourceItemWithExternalId()`。
  - 无 `external_item_id` 时走 `pgUpsertSourceItemWithSourceUrl()`。
- `pgUpsertSourceItemWithExternalId()` 保留：
  - `on conflict (merchant_id, platform, external_item_id) where external_item_id is not null`
- `pgUpsertSourceItemWithSourceUrl()` 保留：
  - `on conflict (merchant_id, source_url) where source_url is not null`
- `ensureSourceItemForComments()` 保持通过 `upsertSourceItems()` 创建 comments import source item。
- `upsertImportedComments()` 继续使用 transaction：
  - 有 `external_comment_id` 时走 `pgUpsertImportedCommentWithExternalId()`。
  - 无 `external_comment_id` 时走 `pgInsertImportedComment()`。
- `pgUpsertImportedCommentWithExternalId()` 保留：
  - `on conflict (source_item_id, external_comment_id)`
- `listSourceItems()`、`getSourceItemById()`、`listImportedComments()` 继续使用 PostgreSQL helper。
- `listImportedComments()` 继续先调用 `pgGetSourceItemById()` 校验 source item 属于当前 merchant，再按 `sort_score desc nulls last, created_at asc` 排序列 comments。

## Schema

未新增 migration。当前本批依赖既有 app DB baseline：

- `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `public.import_jobs`
  - `public.source_items`
  - `public.imported_comments`
  - `ux_source_items_merchant_platform_external_item_id`
  - `ux_source_items_merchant_source_url`
  - `ux_imported_comments_source_external_id`

未连接真实 DB 做数据确认；本批只移除 repository fallback，并用源码契约、lint、typecheck 与范围扫描确认主线代码路径。

## Tests

新增源码契约测试：

- `app/src/lib/db/import-repository-phase-2d-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`、`isAppPostgresConfigured`、`isAppPostgresPreferred`、`shouldUseAppPostgres`。
- 公开函数仍存在：
  - `createImportJob`
  - `getImportJobById`
  - `listImportJobs`
  - `countRunningImportJobs`
  - `updateImportJob`
  - `upsertSourceItems`
  - `ensureSourceItemForComments`
  - `upsertImportedComments`
  - `listSourceItems`
  - `getSourceItemById`
  - `listImportedComments`
- PostgreSQL 主路径仍包含 `queryAppDb`、`withAppDbTransaction`、`public.import_jobs`、`public.source_items`、`public.imported_comments`。
- source item 两类 upsert conflict 逻辑仍可从源码契约看到。
- imported comment upsert / plain insert 逻辑仍可从源码契约看到。
- `listImportedComments()` 的 merchant ownership 校验和排序仍可从源码契约看到。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/import-repository-phase-2d-contract.test.mjs
```

结果：7 tests passed。

```bash
cd app && npm run lint -- src/lib/db/import-repository.ts src/lib/db/import-repository-phase-2d-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|@/lib/supabase/admin|supabase|Supabase|\.from\(|isAppPostgresConfigured|isAppPostgresPreferred|shouldUseAppPostgres" app/src/lib/db/import-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 未新增 local demo fallback。
- 未处理 agent-console / merchant-media。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
