# 2026-05-23 Phase 2B Material Library Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2B 第三小批：

- `app/src/lib/db/material-library-repository.ts`
- `app/src/lib/db/material-library-phase-2b-contract.test.mjs`

未触碰 `merchant-media-repository.ts`、`knowledge-repository.ts`、`platform-admin-repository.ts`、`agent-console-repository.ts`、`consultation-repository.ts`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `source_items` 的 Supabase `.from()` list/get/create/provider-cache/provider-upsert fallback branches。
- 删除 `material_workbench_references` 的 Supabase `.from()` create/get/list/consume fallback branches。
- 删除 `shouldUseAppPostgres()` / `shouldUseDemoFallback()` gate。

### PostgreSQL app DB path

- `listMaterialLibraryItems()` 直接查询 `public.source_items`，保留 `trace_payload @> {"materialLibrary": true}` 过滤与 retrieval ranking。
- `getMaterialLibraryItemById()` 直接委托 `pgGetMaterialLibraryItemRow()`。
- `createMaterialLibraryItem()` 直接委托 `pgInsertMaterialLibraryItem()`，并在 duplicate `originalUrl` 时继续通过 `findExistingMaterialByUrl()` 返回既有素材。
- `listCachedMaterialProviderItems()` 直接查询 `public.source_items` 的 provider cache trace payload。
- `upsertMaterialLibraryItemsFromProvider()` 继续使用 `withAppDbTransaction()`，保留 `pgFindExistingProviderMaterialId()`、`pgUpdateMaterialLibraryItem()`、`pgInsertMaterialLibraryItem()` 和 `persistProviderComments()`。
- `createMaterialWorkbenchReference()` 继续在 transaction 内校验 `pgGetMaterialLibraryItemRow()`，插入 `public.material_workbench_references`，并调用 `pgMarkMaterialSelectedForRewrite()`。
- `getMaterialWorkbenchReference()` / `listMaterialWorkbenchReferencesByDraft()` / `consumeMaterialWorkbenchReference()` 直接查询或更新 `public.material_workbench_references`。
- `consumeMaterialWorkbenchReference()` 继续按 `merchant_id`、`target_workbench` 和可选 `material_item_id` 限定。

### Removed fallback-only helpers

删除只服务 Supabase 缺表兼容路径的 helper：

- `isMissingMaterialReferenceTable()`
- `createTracePayloadWorkbenchReference()`
- `appendTracePayloadReferenceConsumption()`
- fallback wrapper `markMaterialSelectedForRewrite()`

当前主线的 workbench reference 已由 app DB 表 `public.material_workbench_references` 承载，不再把 reference 临时塞回 `source_items.trace_payload`。

### Local demo fallback

保留纯 local demo fallback，但条件改为显式 `isLocalDemoRuntime()`：

- 本地 demo 仍使用内存 `demoMaterialItems` 和 `demoWorkbenchReferences`。
- 不再依赖 `isSupabaseAdminConfigured()` 或任何 Supabase 配置判断。
- 非 local demo 环境下直接走 app PostgreSQL，未配置时由 `queryAppDb()` / `withAppDbTransaction()` 抛当前 app database 口径错误。

## Tests

新增源码契约测试：

- `app/src/lib/db/material-library-phase-2b-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase`、`supabase`、`Supabase`、`.from("source_items")`、`.from("material_workbench_references")`。
- 9 个公开函数仍存在。
- material item list/get/create 仍包含 `queryAppDb`、`public.source_items`、`trace_payload @>` 和 retrieval ranking。
- provider cache/upsert 仍包含 `withAppDbTransaction`、existing material dedupe、insert/update、`persistProviderComments()`。
- workbench reference create/get/list/consume 仍包含 `public.material_workbench_references`、insert/update 和 scoped consume 条件。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。
- duplicate `originalUrl` 语义仍可从 `on conflict (merchant_id, source_url)` 与 `findExistingMaterialByUrl()` 看出。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/material-library-phase-2b-contract.test.mjs
```

结果：7 tests passed。

```bash
cd app && npm run lint -- src/lib/db/material-library-repository.ts src/lib/db/material-library-phase-2b-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase|supabase|Supabase|\.from\(\"source_items\"\)|\.from\(\"material_workbench_references\"\)" app/src/lib/db/material-library-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 未处理 `merchant-media-repository.ts`，它仍留到后续独立批次。
- 未处理 knowledge / platform-admin / agent-console / consultation。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
