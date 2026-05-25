# 2026-05-25 Phase 2E Agent Console Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2E：

- `app/src/lib/db/agent-console-repository.ts`
- `app/src/lib/db/agent-console-repository-phase-2e-contract.test.mjs`

本批在独立 worktree `/Users/wy/.codex/worktrees/remove-supabase-cos-legacy-longrun-phase2d` 上完成，目标分支为 `codex/remove-supabase-cos-legacy-longrun`。未切到主目录 `main`，未处理主目录 `main` 上的暂存/未提交变更。

未触碰：

- `app/src/lib/db/merchant-media-repository.ts`
- `app/src/server/api/video-edit-jobs-service.ts`
- `app/src/lib/supabase/*`
- `app/package.json` / lockfile
- worker / storage / COS / OSS 相关文件
- 既有 untracked inventory 文档

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `requireSupabaseAdmin()`。
- 删除 `shouldUseAppPostgres()` / `shouldUseDemoFallback()` gate。
- 删除 `isAppPostgresConfigured` / `isAppPostgresPreferred` gate。
- 删除所有 Agent Console Supabase `.from(...)` runtime branch，包括：
  - `agent_configs`
  - `agent_prompt_versions`
  - `agent_soul_versions`
  - `agent_skills`
  - `agent_skill_bindings`
  - `knowledge_sets`
  - `knowledge_set_documents`
  - `agent_knowledge_set_bindings`
  - `agent_route_bindings`
  - `agent_runtime_snapshots`
  - `agent_test_runs`
  - `merchant_credit_accounts`
  - `merchant_usage_events`
  - `merchant_credit_ledger`
  - `platform_admin_events`
- 删除 fallback-only Supabase helper：
  - `assertAgentDisplayNameAvailable()`
  - `getAgentSkillsByIds()`
  - `getKnowledgeSetsByIds()`
  - `assertKnowledgeDocumentsExist()`
  - fallback-only `getNextPromptVersionNo()` / `getNextSoulVersionNo()`

### PostgreSQL app DB path

- Agent 创建 / 更新 / 复制改为默认走 `withAppDbTransaction()` 和 PostgreSQL helper。
- Agent 创建仍保留 enabled 前必须先有 active prompt 的限制。
- displayName duplicate 检查保留在 `assertAgentDisplayNameAvailableInPostgres()`。
- `copyAgentConfig()` 继续复制 prompt / soul / skill binding / knowledge set binding。
- prompt draft / publish / rollback 继续使用 `public.agent_prompt_versions`，保留版本号递增、active/archive 状态切换和审计事件。
- soul draft / publish / rollback 继续使用 `public.agent_soul_versions`，保留版本号递增、active/archive 状态切换和审计事件。
- skill create/update/list/binding replace 继续使用 `public.agent_skills` / `public.agent_skill_bindings`。
- knowledge set create/update/list/detail/document bindings 继续使用：
  - `public.knowledge_sets`
  - `public.knowledge_set_documents`
  - `public.agent_knowledge_set_bindings`
- `setConsultationDefaultAgent()` 继续校验 enabled agent 和 active prompt 后写 `public.agent_route_bindings`。
- runtime snapshot / test run 继续写：
  - `public.agent_runtime_snapshots`
  - `public.agent_test_runs`
- merchant credit account / usage event / credit ledger 继续写：
  - `public.merchant_credit_accounts`
  - `public.merchant_usage_events`
  - `public.merchant_credit_ledger`
- Agent Console admin audit event 继续写 `public.platform_admin_events`，`recordAgentConsoleAdminEvent()` 已保留为 PostgreSQL `queryAppDb()` helper；事务内路径继续使用 `recordAgentConsoleAdminEventWithClient()`。

### Local demo fallback

- local demo fallback 只由 `isLocalDemoRuntime()` 显式控制。
- 不再使用 “PostgreSQL 未配置 + Supabase 未配置” 触发 demo fallback。
- 普通本地或生产环境若未配置 app DB，会由 `queryAppDb()` / `withAppDbTransaction()` 暴露当前 app DB 错误口径。
- 仍保留只读 demo 返回：
  - 初始咨询 Agent
  - 基础平台 Knowledge Set
  - consultation_default route binding
- runtime snapshot / test run / merchant credit / usage / ledger 在 local demo runtime 下继续返回 `null`。

## Tests

新增源码契约测试：

- `app/src/lib/db/agent-console-repository-phase-2e-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase/admin`、`supabase`、`Supabase`、`.from(`、`.rpc(`、`requireSupabaseAdmin`、`isAppPostgresConfigured`、`isAppPostgresPreferred`、`shouldUseAppPostgres`。
- 关键公开函数仍存在。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。
- 关键 PostgreSQL 表名仍存在。
- Agent config create/update/copy 仍使用 PostgreSQL helper 和 audit event。
- prompt / soul draft、publish、rollback 仍保留版本与 active/archive 状态切换。
- skill / knowledge binding helper 已切到 PostgreSQL-only helper。
- knowledge set document binding 与 consultation_default route binding 仍走 PostgreSQL。
- runtime snapshot / test run / credit / usage / ledger / audit event 仍走 PostgreSQL 表。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/agent-console-repository-phase-2e-contract.test.mjs
```

结果：9 tests passed。

```bash
cd app && npm run lint -- src/lib/db/agent-console-repository.ts src/lib/db/agent-console-repository-phase-2e-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase/admin|supabase|Supabase|\.from\(|\.rpc\(|requireSupabaseAdmin|isAppPostgresConfigured|isAppPostgresPreferred|shouldUseAppPostgres" app/src/lib/db/agent-console-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 未做真实 DB 冒烟；本批验证为源码契约、lint、typecheck、diff check 与范围扫描。
- 未处理 `merchant-media-repository.ts`。
- 未处理 `video-edit-jobs-service.ts`。
- 未处理 storage provider / COS / OSS 命名。
- 未处理 worker。
- 未处理 Supabase package / client shim / `app/src/lib/supabase/*`。
- 未 push，未部署，未合并 main。
