# 2026-05-25 Phase 2D Consultation Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2D 第三小批：

- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/consultation-repository-phase-2d-contract.test.mjs`

本批继续在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。未切到主目录 `main`，未处理主目录 `main` 上的暂存/未提交变更。

未触碰 `agent-console`、`merchant-media`、`import`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `consultation_sessions` 的 Supabase `.from(...)` fallback。
- 删除 `consultation_messages` 的 Supabase `.from(...)` fallback。
- 删除 `consultation_events` 的 Supabase `.from(...)` fallback。
- 删除 `shouldUseAppPostgres()` / `shouldUseDemoFallback()` Supabase 配置 gate。
- 非 local demo 主线直接走 app PostgreSQL；未配置数据库时由 `queryAppDb()` / `withAppDbTransaction()` 抛当前 app DB 口径错误。

### PostgreSQL app DB path

- `listConsultationSessions()` 非 local demo 时直接查询 `public.consultation_sessions`，并继续调用 `listLatestMessagePreviewBySessionIds()` 附 latest message preview。
- `createConsultationSession()` 非 local demo 时直接插入 `public.consultation_sessions`，保留默认：
  - `status = active`
  - `current_stage = null`
  - `strategy_snapshot = emptyStrategySnapshot`
  - `summary_text = null`
  - `last_message_at` 由 DB default 维护
- `getConsultationSessionDetail()` 非 local demo 时查询 session，再读取 messages 和 events，返回 session + messages + events。
- `createConsultationMessage()` 非 local demo 时使用 `withAppDbTransaction()`：
  - 插入 `public.consultation_messages`。
  - 更新 `public.consultation_sessions.last_message_at`。
  - 若调用方传入 `currentStage` / `strategySnapshot` / `summaryText`，同一 transaction 内一并更新 `current_stage` / `strategy_snapshot` / `summary_text`。
  - 找不到 session 时继续抛 `CONSULTATION_SESSION_NOT_FOUND`。
- `createConsultationEvent()` 非 local demo 时直接插入 `public.consultation_events`，保留 payload JSON。
- `updateConsultationSession()` 非 local demo 时继续用 partial patch 更新 `public.consultation_sessions`。
- `deleteConsultationSession()` 非 local demo 时删除 `public.consultation_sessions`，找不到时继续抛 `CONSULTATION_SESSION_NOT_FOUND`。
- `listConsultationMessages()` / `listConsultationEvents()` 直接查询 PostgreSQL，保留 `created_at asc, id asc` 排序。
- `listLatestMessagePreviewBySessionIds()` 继续使用 PostgreSQL `distinct on (session_id)`，按 `session_id, created_at desc, id desc` 取每个 session 最新 message。

### Local demo fallback

保留 consultation 的内存 fallback，但只在 `isLocalDemoRuntime()` 下触发：

- sessions / messages / events 读取和写入内存 map。
- `createConsultationMessage()` local demo 分支继续更新 latest preview / last message time；若传入 `currentStage` / `strategySnapshot` / `summaryText`，也同步更新内存 session。
- 该 fallback 不再依赖 Supabase 配置判断。

## Schema

未新增 migration。当前本批依赖既有 app DB migration：

- `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
  - `public.consultation_sessions`
  - `public.consultation_messages`
  - `public.consultation_events`
  - session last message / message order / event order 相关索引

未连接真实 DB 做数据确认；本批只移除 repository fallback，并用源码契约、lint、typecheck 与范围扫描确认主线代码路径。

## Tests

新增源码契约测试：

- `app/src/lib/db/consultation-repository-phase-2d-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`。
- 公开函数仍存在：
  - `listConsultationSessions`
  - `createConsultationSession`
  - `getConsultationSessionDetail`
  - `createConsultationMessage`
  - `createConsultationEvent`
  - `updateConsultationSession`
  - `deleteConsultationSession`
- PostgreSQL 主路径仍包含 `queryAppDb`、`withAppDbTransaction`、`public.consultation_sessions`、`public.consultation_messages`、`public.consultation_events`。
- message insert + session update transaction 仍可从源码契约看到。
- partial update patch 仍覆盖 title / status / current stage / strategy snapshot / summary text / last message time。
- latest message preview 仍使用 `distinct on (session_id)` 和 latest message ordering。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/consultation-repository-phase-2d-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/consultation-repository.ts src/lib/db/consultation-repository-phase-2d-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase/admin|supabase|Supabase|\.from\(" app/src/lib/db/consultation-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 consultation local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 未处理 agent-console / merchant-media / import。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
