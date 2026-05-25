# 2026-05-25 Phase 2D Content Generation Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2D 第二小批：

- `app/src/lib/db/content-generation-repository.ts`
- `app/src/lib/db/content-generation-repository-phase-2d-contract.test.mjs`

本批在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。主目录当前 `main` 的暂存/未提交变更未处理、未纳入。

未触碰 `agent-console`、`merchant-media`、`import`、`consultation`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `content_generation_batches` 的 Supabase `.from(...)` fallback。
- 删除 `content_generation_jobs` 的 Supabase `.from(...)` fallback。
- 删除 `isPostgresContentGenerationEnabled()` gating helper；非 local demo 主线直接走 app PostgreSQL。
- 删除基于 Supabase 配置缺失触发的 demo fallback 判断。

### PostgreSQL app DB path

- `createContentGenerationBatch()` 非 local demo 时直接使用 `withAppDbTransaction()`：
  - 插入 `public.content_generation_batches`。
  - 逐条插入 `public.content_generation_jobs`。
  - 保留 `idempotency_key`、`input_snapshot`、`workflow_provider`、`workflow_version`、`current_stage = 'queued'` 写入。
- `claimNextContentGenerationJob()` 非 local demo 时继续使用 transaction：
  - 查询 pending / retryable job。
  - 保留 `for update skip locked`。
  - claim 时设置 `running` / `calling_dify`，并递增 `attempt_count`。
  - claim 成功后继续 recompute batch。
- `markContentGenerationJobSucceeded()` 直接更新 `public.content_generation_jobs`：
  - 设置 `succeeded` / `persisted`。
  - 写入 output / quality review / Dify run id / draft and variant ids。
  - 清空 `error_message` 并设置 `finished_at`。
  - 成功后 recompute batch。
- `markContentGenerationJobFailed()` 直接更新 `public.content_generation_jobs`：
  - 根据 retryable 设置 `failed_retryable` 或 `failed_manual`。
  - 设置 `current_stage = 'failed'`、`error_message`、`finished_at`。
  - 成功后 recompute batch。
- `getContentGenerationBatchById()` 直接查询 `public.content_generation_batches`。
- `listContentGenerationJobsByBatchId()` 直接查询 `public.content_generation_jobs`，保留 `task_date asc, created_at asc` 排序。
- `recomputeContentGenerationBatch()` 直接读取 `public.content_generation_jobs` 状态并更新 `public.content_generation_batches` 的 succeeded / failed / running / status / timestamps。

### Local demo fallback

保留 content generation 的内存 fallback，但只在 `isLocalDemoRuntime()` 下触发：

- batch / jobs 创建写入 `demoStore`。
- claim 使用 `markLocalJobRunning()`。
- succeeded / failed 更新写入内存 job 并调用 `recomputeLocalBatch()`。
- batch get / job list 读取 `demoStore`。
- batch recompute 使用 `recomputeLocalBatch()`。

该 fallback 不再依赖 Supabase 配置判断。

## Schema

未新增 migration。当前本批依赖既有 app DB baseline：

- `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `public.content_generation_batches`
  - `public.content_generation_jobs`
  - `idx_content_generation_jobs_idempotency`
  - queue / batch status 相关索引与 updated_at triggers

未连接真实 DB 做数据确认；本批只移除 repository fallback，并用源码契约、lint、typecheck 与范围扫描确认主线代码路径。

## Tests

新增源码契约测试：

- `app/src/lib/db/content-generation-repository-phase-2d-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`。
- 公开函数仍存在：
  - `createContentGenerationBatch`
  - `claimNextContentGenerationJob`
  - `markContentGenerationJobSucceeded`
  - `markContentGenerationJobFailed`
  - `getContentGenerationBatchById`
  - `listContentGenerationJobsByBatchId`
- PostgreSQL 主路径仍包含 `queryAppDb`、`withAppDbTransaction`、`public.content_generation_batches`、`public.content_generation_jobs`。
- 创建 batch / jobs 的 transaction 和 idempotency key 写入仍可从源码契约看到。
- claim 的 `for update skip locked`、attempt increment、running 状态更新仍可从源码契约看到。
- succeeded / failed 状态更新与 batch recompute 仍可从源码契约看到。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/content-generation-repository-phase-2d-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/content-generation-repository.ts src/lib/db/content-generation-repository-phase-2d-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase/admin|supabase|Supabase|\.from\(" app/src/lib/db/content-generation-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 content generation local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 未处理 agent-console / merchant-media / import / consultation。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
