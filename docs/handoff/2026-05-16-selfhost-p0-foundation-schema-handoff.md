# 2026-05-16 Self-hosted P0 Foundation Schema Handoff

## Current Goal

Implement the P0 self-hosted PostgreSQL foundation schema on
`codex/domestic-infra-migration` without repository migration or main merge.

## Branch / Worktree

- Worktree:
  `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Starting commit: `45d7134 docs: add selfhost postgres schema plan`
- Schema implementation commit: `5ea29ba db: add selfhost p0 foundation schema`

## Changed Files

- `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- `app/db/migrations/202605160002_selfhost_pgvector_optional.sql`
- `app/db/README.md`
- `docs/progress/2026-05-16-selfhost-p0-foundation-schema.md`
- `docs/handoff/2026-05-16-selfhost-p0-foundation-schema-handoff.md`

## What Is Done

Added additive core migration for:

- `platform_admin_users`
- `platform_admin_sessions`
- `consultation_sessions`
- `consultation_messages`
- `consultation_events`
- `consultation_roundtable_states`
- `merchant_strategy_assets`
- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`
- `platform_settings`
- `platform_admin_events`
- `agent_configs`
- `agent_prompt_versions`
- `agent_soul_versions`
- `agent_skills`
- `agent_skill_bindings`
- `knowledge_sets`
- `knowledge_set_documents`
- `agent_knowledge_set_bindings`
- `agent_route_bindings`
- `agent_test_runs`
- `agent_runtime_snapshots`
- `material_workbench_references`

Added optional pgvector migration:

- Checks whether `vector` is available.
- Adds `knowledge_chunks.embedding vector(1536)` only when possible.
- Adds HNSW index only when possible.
- Creates `match_knowledge_chunks` only when vector exists.
- Leaves `embedding_json` fallback in place when vector is unavailable.

Updated `app/db/README.md` to document filename-order migration and optional pgvector behavior.

## Validation Summary

Local empty DB:

- Baseline migration passed.
- Foundation migration passed.
- Foundation migration second pass passed.
- Optional pgvector migration passed with no-vector notice.
- Table count: `42`.
- P0 foundation table count: `24`.
- App env preflight: `status=ok`.

Singapore existing DB:

- Applied only `202605160001_selfhost_p0_foundation.sql`.
- Table count moved from `18` to `42`.
- Required regclass checks passed for platform admin, consultation, knowledge, agent, and material reference tables.
- `pg_available_extensions` did not include `vector`.
- Optional pgvector migration was not applied on Singapore.

Singapore non-regression:

- `/api/health`: passed.
- App env preflight: passed.
- Team invite + Dify mock: passed, batch `ee799f83-93aa-40c2-b822-a7949de76973`.
- Video-chain API smoke: passed, job `2a225583-b5c3-45d1-92bc-bf82469f8dfa`.
- Worker fast-path smoke: passed after worker DB env correction, job `1c32b8bf-a19c-4ebc-adda-8ad6ffb010af`.
- Normal no-voiceover FireRed: failed independently, job `e9961767-2a2b-4aae-9ce0-ebdcb2a0efc3`, stage `openstoryline_rendering_failed`.

## Remote Runtime Change

Found and fixed a Singapore rehearsal worker env issue:

- Before fix, `video-worker` only had old DB fallback env and was connected to a Supabase pooler.
- Added `WORKER_DATABASE_URL` to `/etc/jingjing/worker.env`, using Docker network address `jingjing-selfhost-pg:5432`.
- Restarted `jingjing-worker-compose.service`.
- Confirmed worker real I/O smoke and fast-path smoke pass after the fix.

This was a runtime configuration correction, not a repository code change.

## Still Not Done

Repository migration is still pending:

- `platform-admin-session.ts`
- `consultation-repository.ts`
- `merchant-strategy-asset-repository.ts`
- `knowledge-repository.ts`
- `agent-console-repository.ts`
- `platform-admin-repository.ts`
- `material-library-repository.ts`
- `import-repository.ts` write path

Storage is still not migrated to Aliyun OSS.

Platform admin login is not yet app-owned at runtime; only its foundation tables now exist.

Consultation, knowledge/RAG, Agent console, and material references should not be described as fully PostgreSQL durable until repositories are migrated and revalidated.

## Next Recommended Step

Start repository migration in this order:

1. `platform-admin-session.ts`
2. `consultation-repository.ts`
3. `merchant-strategy-asset-repository.ts`
4. `knowledge-repository.ts` with lexical fallback first
5. `agent-console-repository.ts` read path

Keep pgvector optional until the target Aliyun RDS instance is checked directly for vector support.

## Push / Merge / Long-task

- `45d7134` was pushed to Gitee before implementation.
- Schema implementation commit `5ea29ba` is local at the time this handoff was written.
- Merge to `main`: no.
- Project long-task: not completed; local status is `paused`.
