# 2026-05-22 Phase 2B Merchant Strategy Asset Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2B 第二小批：

- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-phase-2b-contract.test.mjs`

未触碰 `merchant-media-repository.ts`、`material-library-repository.ts`、`knowledge-repository.ts`、`platform-admin-repository.ts`、`agent-console-repository.ts`、storage provider、worker、package / lockfile，也未删除 `app/src/lib/supabase/*`。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `merchant_strategy_assets` 的 Supabase `.from()` fallback branch。
- 删除以 Supabase admin 配置决定 fallback 的 `shouldUseAppPostgres()` / `shouldUseDemoFallback()`。

### PostgreSQL app DB path

- `getMerchantStrategyAssetDocument()` 当前主线直接查询 `public.merchant_strategy_assets`。
- `upsertMerchantStrategyAssetDocument()` 当前主线直接 `insert into public.merchant_strategy_assets ... on conflict (merchant_id) do update`。
- 保留原策略资产语义：
  - `strategy_snapshot`
  - `strategy_markdown`
  - `canonical_snapshot`
  - `compiled_context`
  - `buildStrategyAssetMarkdown()`
  - `toStrategySnapshot()`
  - `normalizeStrategyMarkdown()`
- `ensureMerchantStrategyAsset()` / `ensureMerchantStrategyAssetDocument()` 仍先读取当前资产，不存在时再用 fallback snapshot 创建。

未新增 migration：`public.merchant_strategy_assets` 已在 `app/db/migrations/202605160001_selfhost_p0_foundation.sql` 中定义，包含本批需要的 `strategy_snapshot`、`strategy_markdown`、`canonical_snapshot`、`compiled_context` 字段和 JSON object constraint。

### Local demo fallback

保留纯本地 demo fallback，但条件改为显式 `isLocalDemoRuntime()`：

- 仅在无 app database / PostgreSQL runtime 的本地 demo 条件下使用内存 `demoMerchantStrategyAssets`。
- 不再依赖 `isSupabaseAdminConfigured()` 或任何 Supabase 配置判断。
- app DB 主线未配置时由 `queryAppDb()` / PostgreSQL helper 抛当前 app database 口径错误，不再回落到 Supabase。

## Tests

新增源码契约测试：

- `app/src/lib/db/merchant-strategy-asset-phase-2b-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase`、`supabase`、`Supabase`、`.from("merchant_strategy_assets")`。
- get/upsert document path 仍包含 `queryAppDb`、`public.merchant_strategy_assets`、`JSON.stringify(input.strategySnapshot)`、`canonical_snapshot`、`compiled_context`。
- upsert 仍保留 markdown/canonical/compiledContext 合并规则。
- `ensure*` helper 仍先 get 后 upsert fallback。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/merchant-strategy-asset-phase-2b-contract.test.mjs
```

结果：6 tests passed。

```bash
cd app && npm run lint -- src/lib/db/merchant-strategy-asset-repository.ts src/lib/db/merchant-strategy-asset-phase-2b-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase|supabase|Supabase|\.from\(\"merchant_strategy_assets\"\)" app/src/lib/db/merchant-strategy-asset-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 local demo 内存 fallback，条件是 `isLocalDemoRuntime()`，用于无 app database 的本地 demo runtime。
- 未处理 `merchant-media-repository.ts`，它仍按第二阶段矩阵留到后续独立批次。
- 未处理 material-library / knowledge / platform-admin / agent-console。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
