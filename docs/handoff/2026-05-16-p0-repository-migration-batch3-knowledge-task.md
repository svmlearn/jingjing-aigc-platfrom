# 2026-05-16 P0 Repository Migration Batch 3: Knowledge Repository

## 1. Task Goal

Continue `codex/domestic-infra-migration` after:

- P0 foundation schema
- platform-admin app-owned session
- consultation + merchant strategy repositories

This batch migrates `knowledge-repository.ts` from Supabase-only / in-memory fallback to ordinary PostgreSQL in self-hosted mode.

The goal is:

```text
On self-hosted PostgreSQL without pgvector, knowledge documents/chunks/ingestion jobs are durable,
listable, updateable, deletable, and searchable through lexical fallback.
```

This is repository-level knowledge persistence and retrieval. It is not the full Agent Console migration yet.

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
36ddc87 feat: add selfhost consultation strategy repositories
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
docs/handoff/2026-05-16-selfhost-p0-foundation-schema-handoff.md
docs/progress/2026-05-16-selfhost-consultation-strategy-repositories.md
docs/handoff/2026-05-16-selfhost-consultation-strategy-repositories-handoff.md
```

Inspect before editing:

```text
app/src/lib/db/knowledge-repository.ts
app/src/server/api/knowledge-service.ts
app/src/server/api/content-generation-service.ts
app/src/server/api/consultation-runtime/rag.ts
app/src/lib/server-db/postgres.ts
app/db/migrations/202605160001_selfhost_p0_foundation.sql
app/db/migrations/202605160002_selfhost_pgvector_optional.sql
```

## 4. Implementation Scope

### 4.1 PostgreSQL Preference Rule

For `knowledge-repository.ts`, ordinary PostgreSQL should be preferred when the app is in self-hosted PostgreSQL mode.

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

### 4.2 Required Repository Functions

Implement PostgreSQL paths in:

```text
app/src/lib/db/knowledge-repository.ts
```

Required functions:

```text
listKnowledgeDocuments
getKnowledgeDocumentById
createKnowledgeDocument
updateKnowledgeDocument
deleteKnowledgeDocument
createKnowledgeIngestionJob
updateKnowledgeIngestionJob
replaceKnowledgeChunks
listKnowledgeChunksByDocumentId
searchKnowledgeChunks
attachKnowledgeDocumentStats internal path
countKnowledgeChunksByDocumentIds internal path
listLatestKnowledgeJobsByDocumentIds internal path
```

Expected behavior:

- Platform documents have `scope='platform'` and `merchant_id is null`.
- Merchant documents have `scope='merchant'` and a non-null `merchant_id`.
- Document stats include chunk count and latest ingestion job.
- Deleting a document cascades chunks and ingestion jobs.
- JSON fields round-trip:
  - `metadata`
  - `input_payload`
  - `log_payload`
  - chunk `metadata`
- Existing DTO shape does not change.

### 4.3 pgvector / Embedding Rules

Do not require pgvector for this batch.

Important current schema facts:

- Core migration has `knowledge_chunks.embedding_json double precision[]`.
- Optional migration may add `knowledge_chunks.embedding vector(1536)`, but Singapore currently does not have `vector`.

Therefore:

- `replaceKnowledgeChunks` must work when only `embedding_json` exists.
- If `chunk.embedding` is provided, store it into `embedding_json` in ordinary PostgreSQL mode.
- Do not blindly insert into `knowledge_chunks.embedding` unless the column actually exists.
- `searchKnowledgeChunks` must work without `match_knowledge_chunks`.
- Lexical fallback is mandatory and should be treated as the success path for Singapore.
- Optional vector RPC can remain as an enhancement if safely detected and harmless when unavailable.

### 4.4 Search Behavior

Keep the current product behavior:

- Platform documents can be used globally.
- Merchant documents are scoped to the current `merchantId`.
- If `documentIds` are provided, restrict platform retrieval to those IDs.
- Rank by text score as current fallback does.
- Return positive lexical matches first; if no positive score exists, return deterministic fallback results up to `limit`.

Do not add a new embedding provider or paid vector service in this batch.

### 4.5 Smoke Script

Add a small self-hosted smoke, suggested:

```text
app/scripts/check-domestic-knowledge-repository-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL without pgvector:

- required tables exist
- a test merchant/user fixture exists or can be created using existing baseline schema
- create platform document
- create merchant document
- create/update ingestion job
- replace chunks with and without `embedding` arrays
- list documents with stats
- get document by id
- list chunks by document
- lexical search returns expected platform and merchant matches
- requested `documentIds` filtering works
- update document works
- delete document cascades chunks/jobs
- cleanup is idempotent

If practical, support `--base-url` for API smoke through existing knowledge routes, but DB-level smoke is acceptable for this batch.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
agent-console-repository.ts
platform-admin-repository.ts full admin-user management
knowledge_sets / agent_knowledge_set_bindings runtime wiring
material-library-repository.ts
import-repository.ts write path
Aliyun OSS adapter
worker / FireRed / OpenStoryline / TTS
```

Do not require:

```text
pgvector
match_knowledge_chunks
HNSW index
embedding API calls
real file upload
real object storage writes
```

## 6. Validation Requirements

Local validation:

```text
node --check app/scripts/check-domestic-knowledge-repository-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

Run the new smoke against a local ordinary PostgreSQL DB initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Do not apply optional pgvector for the main success criterion. If you test it separately, record it as optional evidence only.

Singapore validation:

- Confirm live `/api/health` still reports PostgreSQL and COS configured.
- Run app preflight.
- Run the new knowledge repository smoke against the Singapore self-hosted DB or an isolated temporary app container.
- Re-run one previous non-regression smoke:
  - consultation/strategy smoke, or
  - platform-admin session smoke, or
  - video-chain API smoke.

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
docs/progress/2026-05-16-selfhost-knowledge-repository.md
docs/handoff/2026-05-16-selfhost-knowledge-repository-handoff.md
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

