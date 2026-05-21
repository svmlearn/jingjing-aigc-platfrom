# 2026-05-16 P0 Repository Migration Batch 4B: Agent Console Admin Writes

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 4A Agent Runtime Foundation.

This batch migrates Agent Console admin edit/write behavior from Supabase Admin guarded paths to self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, platform admin can create/update/copy Agents,
edit/publish/rollback agent.md and soul.md, manage Skills, manage Knowledge Sets,
bind Skills/Knowledge Sets, and switch the consultation default Agent.
```

This is Agent Console admin editing only. It is not credits/usage, OSS, worker, TTS, or platform admin user-management.

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
302fbff feat: add selfhost agent runtime foundation
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
docs/progress/2026-05-16-selfhost-agent-runtime-foundation.md
docs/handoff/2026-05-16-selfhost-agent-runtime-foundation-handoff.md
```

Inspect before editing:

```text
app/src/lib/db/agent-console-repository.ts
app/src/components/platform-admin/agent-console-pages.tsx
app/src/app/api/platform-admin/agents/**
app/src/app/api/platform-admin/skills/**
app/src/app/api/platform-admin/knowledge/**
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

### 4.2 Agent config admin writes

In:

```text
app/src/lib/db/agent-console-repository.ts
```

Implement self-hosted PostgreSQL paths for:

```text
createAgentConfig
updateAgentConfig
copyAgentConfig
```

Expected behavior:

- Display-name uniqueness still enforced.
- Agent cannot be enabled without an active non-empty prompt.
- Default Agent cannot be disabled while still bound to `consultation_default`.
- Copy duplicates active/draft prompt, active/draft soul, skill bindings, and knowledge set bindings.
- Writes create `platform_admin_events` rows.

### 4.3 Prompt and soul admin writes

Implement self-hosted PostgreSQL paths for:

```text
saveAgentPromptDraft
publishAgentPromptDraft
rollbackAgentPromptVersion
saveAgentSoulDraft
publishAgentSoulDraft
rollbackAgentSoulVersion
```

Expected behavior:

- One draft per agent is preserved.
- One active version per agent is preserved.
- Version numbers remain monotonic.
- Publishing archives prior active version.
- Rollback creates/activates the intended version without breaking unique active/draft constraints.
- Empty active prompt should remain blocked where the old logic blocks it.
- Writes create `platform_admin_events` rows.

### 4.4 Skill admin writes

Implement self-hosted PostgreSQL paths for:

```text
createAgentSkill
updateAgentSkill
replaceAgentSkillBindings
```

Expected behavior:

- Skill name/key uniqueness semantics stay compatible with current behavior.
- Disabled skills cannot remain effectively enabled for active bindings if the current logic blocks or disables them.
- Replacing bindings toggles old bindings to disabled and inserts missing desired bindings.
- Writes create `platform_admin_events` rows.

### 4.5 Knowledge Set admin writes

Implement self-hosted PostgreSQL paths for:

```text
createKnowledgeSet
updateKnowledgeSet
replaceKnowledgeSetDocuments
replaceKnowledgeDocumentSets
replaceAgentKnowledgeSetBindings
```

Expected behavior:

- Platform Knowledge Sets require `merchant_id is null`.
- Merchant Knowledge Sets require `merchant_id`.
- Disabled Knowledge Sets should disable active Agent bindings if current logic does so.
- Document existence checks use the migrated `knowledge_documents` repository/table behavior.
- Replacing document links is idempotent.
- Replacing Agent Knowledge Set bindings requires enabled Knowledge Sets.
- Writes create `platform_admin_events` rows.

### 4.6 Default route switch

Implement self-hosted PostgreSQL path for:

```text
setConsultationDefaultAgent
```

Expected behavior:

- Only enabled Agents can be set as `consultation_default`.
- Agent must have active non-empty prompt.
- Route binding upserts by `route_key`.
- Writes create `platform_admin_events` rows.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
platform-admin-repository full admin-user management
platform merchant admin listing/editing
platform invitation code management if still Supabase-only
merchant credits/usage accounting
ensureMerchantCreditAccount
recordMerchantUsageEvent
updateMerchantUsageEvent
consumeMerchantCredits
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

## 6. Smoke Script

Add a self-hosted smoke, suggested:

```text
app/scripts/check-domestic-agent-admin-writes-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required Agent Console admin tables exist
- create Agent as draft
- save prompt draft
- publish prompt
- update Agent to enabled
- save/publish soul
- create Skill
- bind Skill to Agent
- create Knowledge Set
- attach an existing/test Knowledge Document to Knowledge Set
- bind Knowledge Set to Agent
- switch `consultation_default` to the test Agent
- `resolveConsultationAgentRuntime()` can resolve the test Agent through route binding
- copy Agent and verify copied active/draft prompt/soul/bindings
- rollback prompt and soul to known versions
- disable/cleanup created test Agent, Skill, Knowledge Set, document links, route binding, and admin events
- rerun is safe

If practical, support `--base-url` to verify the platform admin Agent/Skill/Knowledge APIs through an isolated temp app. DB-level smoke plus a few HTTP API checks are acceptable.

## 7. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-agent-admin-writes-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
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
- Run the new Agent Console admin writes smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - agent runtime foundation smoke, or
  - knowledge repository smoke, or
  - consultation/strategy smoke.

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
docs/progress/2026-05-16-selfhost-agent-admin-writes.md
docs/handoff/2026-05-16-selfhost-agent-admin-writes-handoff.md
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

