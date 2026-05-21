# 2026-05-16 P0 Repository Migration Batch 4A: Agent Runtime Foundation

## 1. Task Goal

Continue `codex/domestic-infra-migration` after:

- P0 foundation schema
- platform-admin app-owned session
- consultation + merchant strategy repositories
- knowledge repository with ordinary PostgreSQL + lexical fallback

This batch migrates the Agent Console runtime/foundation read path to self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, the consultation runtime can resolve the seeded default Agent,
active prompt/soul, Knowledge Set bindings, route binding, platform settings,
and record runtime snapshots/test runs without Supabase.
```

This is not the full Agent Console admin editing migration yet.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD before this batch:

```text
0a29743 feat: add selfhost knowledge repository
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -4
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-16-full-supabase-exit-audit.md
docs/架构规范/2026-05-16-selfhost-postgres-full-schema-plan.md
docs/progress/2026-05-16-selfhost-p0-foundation-schema.md
docs/progress/2026-05-16-selfhost-platform-admin-session.md
docs/progress/2026-05-16-selfhost-consultation-strategy-repositories.md
docs/progress/2026-05-16-selfhost-knowledge-repository.md
docs/handoff/2026-05-16-selfhost-knowledge-repository-handoff.md
```

Inspect before editing:

```text
app/src/lib/db/agent-console-repository.ts
app/src/lib/db/platform-admin-repository.ts
app/src/server/api/consultation-runtime/experts.ts
app/src/server/api/consultation-service.ts
app/src/lib/server-db/postgres.ts
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

Use ordinary PostgreSQL when the app is in self-hosted PostgreSQL mode.

Use the existing helper pattern:

```text
isAppPostgresPreferred()
isAppPostgresConfigured()
queryAppDb()
withAppDbTransaction()
mapPostgresError()
```

Keep Supabase Admin fallback for legacy/staging paths.

Keep in-memory demo fallback only when neither app PostgreSQL nor Supabase Admin is configured.

### 4.2 Platform settings minimal migration

In:

```text
app/src/lib/db/platform-admin-repository.ts
```

Implement self-hosted PostgreSQL paths only for:

```text
getPlatformSettings
updatePlatformSettings
recordPlatformAdminEvent internal helper, only as needed by settings/agent logging
```

Expected behavior:

- Read from `platform_settings` seeded by `202605160001_selfhost_p0_foundation.sql`.
- Missing rows still fall back to existing defaults.
- Updates upsert into `platform_settings`.
- Event logging writes to `platform_admin_events`.
- Do not migrate platform admin user management in this batch.
- Do not migrate merchant admin listing/editing in this batch.

### 4.3 Agent Console runtime/foundation read path

In:

```text
app/src/lib/db/agent-console-repository.ts
```

Implement self-hosted PostgreSQL paths for read/runtime functions:

```text
getAgentConsoleFoundationState
listAgentConfigs
getAgentConfigById
getAgentConfigDetail
listAgentPromptVersions
getActiveAgentPromptVersion
listAgentSoulVersions
getActiveAgentSoulVersion
listAgentSkills
listAgentSkillBindings
listKnowledgeSets
getKnowledgeSetById
getKnowledgeSetDetail
listKnowledgeSetDocuments
listAgentKnowledgeSetBindings
listAgentRouteBindings
getAgentRouteBinding
getConsultationDefaultRouteBinding
recordAgentRuntimeSnapshot
recordAgentTestRun
recordAgentConsoleAdminEvent internal helper, only as needed by recordAgentTestRun
```

Expected behavior:

- The seeded `initial_consultation_agent` from foundation migration is read from PostgreSQL, not demo fallback.
- The seeded `consultation_default` route binding is read from PostgreSQL.
- Active prompt/soul versions are read from PostgreSQL.
- Knowledge Set bindings and Knowledge Set documents are read from PostgreSQL.
- `resolveConsultationAgentRuntime()` can return a non-null `container` in self-hosted mode.
- Runtime snapshots and test runs are persisted in:
  - `agent_runtime_snapshots`
  - `agent_test_runs`
- Existing DTO shape does not change.

### 4.4 Do not implement admin write paths yet

Do not migrate these functions in this batch unless a tiny compatibility shim is unavoidable:

```text
createAgentConfig
updateAgentConfig
copyAgentConfig
saveAgentPromptDraft
publishAgentPromptDraft
rollbackAgentPromptVersion
saveAgentSoulDraft
publishAgentSoulDraft
rollbackAgentSoulVersion
createAgentSkill
updateAgentSkill
replaceAgentSkillBindings
createKnowledgeSet
updateKnowledgeSet
replaceKnowledgeSetDocuments
replaceKnowledgeDocumentSets
replaceAgentKnowledgeSetBindings
setConsultationDefaultAgent
```

These should be Batch 4B.

### 4.5 Do not migrate credits/usage yet

Do not migrate these in this batch:

```text
ensureMerchantCreditAccount
recordMerchantUsageEvent
updateMerchantUsageEvent
consumeMerchantCredits
merchant_credit_accounts
merchant_usage_events
merchant_credit_ledger
```

Credits/usage are a separate accounting surface and should not be mixed with Agent runtime foundation.

## 5. Smoke Script

Add a self-hosted smoke, suggested:

```text
app/scripts/check-domestic-agent-runtime-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required platform settings and agent tables exist
- `getPlatformSettings()` reads seeded settings
- `updatePlatformSettings()` can update and restore one harmless setting
- `getAgentConsoleFoundationState()` reads seeded agent/route/knowledge set from PostgreSQL
- `getConsultationDefaultRouteBinding()` returns the PostgreSQL route binding
- `getAgentConfigDetail()` returns active prompt/soul and bindings
- `resolveConsultationAgentRuntime()` returns a non-null `container`
- `recordAgentRuntimeSnapshot()` inserts a row
- `recordAgentTestRun()` inserts a row
- cleanup removes temporary smoke snapshots/test runs/events/settings changes if appropriate

If practical, support `--base-url` to verify platform admin pages/API can read the foundation state through an isolated temp app. DB-level smoke plus one page/API smoke is enough.

## 6. Explicitly Out Of Scope

Do not migrate in this batch:

```text
Agent Console admin editing write paths
platform-admin-repository full admin-user management
platform merchant admin listing/editing
merchant credits/usage accounting
material-library-repository.ts
import-repository.ts write path
Aliyun OSS adapter
worker / FireRed / OpenStoryline / TTS
pgvector / vector RPC
```

Do not require:

```text
real model call
real embedding call
normal FireRed
voiceover/TTS
real file upload
```

## 7. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-agent-runtime-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

Run the new smoke against a local ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Do not apply optional pgvector for the main success criterion.

Singapore validation:

- Confirm live `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new agent runtime smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - knowledge repository smoke, or
  - consultation/strategy smoke, or
  - platform-admin session smoke.

Do not require normal FireRed, TTS/voiceover, or pgvector in this batch.

## 8. Guardrails

Do not write:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark `.codex/long-task/active.json` complete.

Do not merge to `main`.

Do not print secrets.

If any runtime env on Singapore is changed, record exactly what changed without revealing secret values.

## 9. Deliverables

Commit code and docs locally on `codex/domestic-infra-migration`.

Expected docs:

```text
docs/progress/2026-05-16-selfhost-agent-runtime-foundation.md
docs/handoff/2026-05-16-selfhost-agent-runtime-foundation-handoff.md
```

The final response should include:

- final HEAD commit
- changed files
- local validation result
- Singapore validation result
- whether pushed to Gitee
- whether worktree is clean
- residual risks
- recommended next batch

