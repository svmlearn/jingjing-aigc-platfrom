# 2026-05-16 P0 Repository Migration Batch 2: Consultation + Strategy Assets

## 1. Task Goal

Continue `codex/domestic-infra-migration` after P0 foundation schema and platform-admin app-owned session.

This batch migrates the merchant consultation and strategy-asset repositories from Supabase-only / in-memory fallback to ordinary PostgreSQL in self-hosted mode.

The goal is:

```text
On self-hosted PostgreSQL, consultation sessions/messages/events and merchant strategy assets
are durable, reloadable, and usable by the current merchant consultation APIs.
```

This is not the RAG/vector/Agent-console migration yet.

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
65eab8c feat: add selfhost platform admin sessions
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -3
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
docs/handoff/2026-05-16-selfhost-p0-foundation-schema-handoff.md
docs/progress/2026-05-16-selfhost-platform-admin-session.md
docs/handoff/2026-05-16-selfhost-platform-admin-session-handoff.md
```

Inspect before editing:

```text
app/src/lib/db/consultation-repository.ts
app/src/lib/db/merchant-strategy-asset-repository.ts
app/src/server/api/consultation-service.ts
app/src/server/api/roundtable-consultation-service.ts
app/src/server/api/content-generation-service.ts
app/src/lib/server-db/postgres.ts
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

For these repositories, ordinary PostgreSQL should be preferred when the app is in self-hosted PostgreSQL mode.

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

### 4.2 Migrate consultation repository

Implement PostgreSQL paths in:

```text
app/src/lib/db/consultation-repository.ts
```

Required functions:

```text
listConsultationSessions
createConsultationSession
getConsultationSessionDetail
createConsultationMessage
createConsultationEvent
updateConsultationSession
deleteConsultationSession
```

Internal helpers must also work in PostgreSQL mode:

```text
listConsultationMessages
listConsultationEvents
listLatestMessagePreviewBySessionIds
```

Expected behavior:

- Merchant scoping remains enforced by `merchant_id`.
- Create/list/detail survives app restart because data is stored in PostgreSQL.
- Message creation updates session `last_message_at`.
- Delete removes the session and dependent rows through FK cascade.
- JSON fields remain round-trippable:
  - `strategy_snapshot`
  - `tool_cards`
  - `visible_summary`
  - `payload`

### 4.3 Migrate merchant strategy asset repository

Implement PostgreSQL paths in:

```text
app/src/lib/db/merchant-strategy-asset-repository.ts
```

Required functions:

```text
getMerchantStrategyAsset
getMerchantStrategyAssetDocument
upsertMerchantStrategyAsset
upsertMerchantStrategyAssetDocument
ensureMerchantStrategyAsset
ensureMerchantStrategyAssetDocument
```

Expected behavior:

- Upsert by `merchant_id`.
- `strategy_markdown` default generation stays compatible.
- `canonical_snapshot` and `compiled_context` remain JSON-safe.
- Existing DTO shape does not change.

### 4.4 Smoke script

Add a small self-hosted smoke, suggested:

```text
app/scripts/check-domestic-consultation-strategy-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required tables exist
- a test merchant exists or can be created using the existing domestic baseline schema
- strategy asset upsert/get works
- consultation session create/list/detail works
- message create works and updates latest preview / last message time
- event create/list works
- update session works
- cleanup deletes temporary session/message/event/strategy rows
- rerun is safe

If practical, support `--base-url` for HTTP/API-level verification. DB-level smoke is acceptable if API auth setup would make this batch too broad.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
knowledge-repository.ts
agent-console-repository.ts
platform-admin-repository.ts full admin-user management
material-library-repository.ts
import-repository.ts write path
Aliyun OSS adapter
pgvector / match_knowledge_chunks
worker / FireRed / OpenStoryline / TTS
```

Do not try to solve the Team/Dify `failed_manual` observation from the previous batch unless it is directly caused by the files in this scope.

## 6. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-consultation-strategy-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

Run the new smoke against a local ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Singapore validation:

- Confirm live `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new consultation/strategy smoke against the Singapore self-hosted DB/app or an isolated temporary app container.
- Re-run platform-admin session smoke or video-chain API smoke as a non-regression check.

Do not require normal FireRed, TTS/voiceover, or pgvector in this batch.

## 7. Guardrails

Do not write:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```

Do not mark `.codex/long-task/active.json` complete.

Do not merge to `main`.

Do not print secrets.

If any runtime env on Singapore is changed, record exactly what changed without revealing secret values.

## 8. Deliverables

Commit code and docs locally on `codex/domestic-infra-migration`.

Expected docs:

```text
docs/progress/2026-05-16-selfhost-consultation-strategy-repositories.md
docs/handoff/2026-05-16-selfhost-consultation-strategy-repositories-handoff.md
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

