# 2026-05-16 Self-hosted P0 Foundation Schema Progress

## Scope

This round implemented the P0 ordinary PostgreSQL foundation schema only.

Not included:

- No repository migration.
- No Aliyun OSS implementation.
- No main merge.
- No domestic completion marker write.
- No project long-task completion.

## Commits

- Pre-work Gitee backup: pushed `45d7134 docs: add selfhost postgres schema plan` to `gitee/codex/domestic-infra-migration`.
- Schema implementation commit: `5ea29ba db: add selfhost p0 foundation schema`.

## Files

Added:

- `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- `app/db/migrations/202605160002_selfhost_pgvector_optional.sql`

Updated:

- `app/db/README.md`

## Tables Added By Foundation Migration

Platform admin:

- `platform_admin_users`
- `platform_admin_sessions`

Consultation:

- `consultation_sessions`
- `consultation_messages`
- `consultation_events`
- `consultation_roundtable_states`

Strategy:

- `merchant_strategy_assets`

Knowledge / RAG foundation:

- `knowledge_documents`
- `knowledge_chunks`
- `knowledge_ingestion_jobs`

Platform settings / audit:

- `platform_settings`
- `platform_admin_events`

Agent foundation:

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

Material references:

- `material_workbench_references`

## Schema Decisions

- Core foundation migration uses ordinary PostgreSQL only.
- No `auth.users` FK, no `auth.uid()` semantics, no RLS policy creation.
- Platform admin identity is app-owned through `platform_admin_users` and `platform_admin_sessions`.
- Merchant-side user FKs point to `app_users`.
- `knowledge_chunks` core schema stores `embedding_json double precision[]`.
- `pgvector` is isolated in `202605160002_selfhost_pgvector_optional.sql`.
- Optional pgvector migration checks availability first and exits successfully with a notice when `vector` is unavailable.

## Local Empty DB Validation

Environment:

- Local PostgreSQL 17.9 via temporary `initdb` cluster.
- `psql -v ON_ERROR_STOP=1`.

Commands executed:

```bash
psql ... -f app/db/migrations/202605130001_domestic_core_baseline.sql
psql ... -f app/db/migrations/202605160001_selfhost_p0_foundation.sql
psql ... -f app/db/migrations/202605160001_selfhost_p0_foundation.sql
psql ... -f app/db/migrations/202605160002_selfhost_pgvector_optional.sql
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  COS_SECRET_ID=dummy COS_SECRET_KEY=dummy COS_BUCKET=jj-healthcheck-1250000000 \
  COS_REGION=ap-guangzhou VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=1 \
  node app/scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint
```

Result:

- Baseline migration: passed.
- Foundation migration first pass: passed.
- Foundation migration second pass: passed, idempotent notices only.
- Optional pgvector migration: passed with notice that pgvector is unavailable locally.
- Public table count after baseline + foundation: `42`.
- Required P0 foundation table count: `24`.
- App env preflight: `status=ok`, `database.selectOne=true`, `requiredTablesPresent=true`.
- Local `knowledge_chunks` had `embedding_json`; no `embedding` vector column because pgvector was unavailable.

## Singapore Existing DB Additive Migration

Target:

- Server: `43.160.208.189`
- DB container: `jingjing-selfhost-pg`
- DB/user: `jj_selfhost`

Command executed by piping the migration into container `psql`:

```bash
ssh ubuntu@43.160.208.189 \
  'sudo docker exec -i jingjing-selfhost-pg psql -U jj_selfhost -d jj_selfhost -v ON_ERROR_STOP=1' \
  < app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Result:

- Foundation additive migration: passed.
- Public table count moved from `18` to `42`.
- Required checks returned non-null:
  - `public.platform_admin_users`
  - `public.consultation_sessions`
  - `public.knowledge_documents`
  - `public.agent_configs`
  - `public.material_workbench_references`
- `knowledge_chunks` has `embedding_json`.
- `pg_available_extensions` showed `pg_trgm`, but no `vector` row.
- Optional pgvector migration was not applied to the Singapore existing DB in this round.

## Singapore Non-regression Checks

Passed:

- `GET http://43.160.208.189/api/health`: `ok=true`, database provider `postgres`, COS configured.
- App preflight in `jingjing-selfhost-app`: `status=ok`, database select passed, required tables present.
- Team invite + Dify mock smoke through a temporary app container on `127.0.0.1:3003`:
  - batch `ee799f83-93aa-40c2-b822-a7949de76973`
  - `total_jobs=5`
  - `succeeded_jobs=5`
  - member job `a67871f4-4d1d-44b1-ac96-82e1cf87108c` succeeded
  - member article/video generation status: `succeeded / succeeded`
- Video-chain API smoke:
  - job `2a225583-b5c3-45d1-92bc-bf82469f8dfa`
  - API contract returned `status=ok`
  - persisted payload inspected
- Worker real I/O smoke after env correction:
  - DB `select_1=1`
  - required worker tables present
  - COS roundtrip matched
- Worker fast-path smoke after env correction:
  - job `1c32b8bf-a19c-4ebc-adda-8ad6ffb010af`
  - final status `succeeded`
  - result asset count `1`
  - preview status `200`
  - preview bytes `3693`

Not passed:

- Normal no-voiceover FireRed smoke:
  - job `e9961767-2a2b-4aae-9ce0-ebdcb2a0efc3`
  - final status `failed_retryable`
  - final stage `openstoryline_rendering_failed`
  - failure: `RemoteProtocolError: peer closed connection without sending complete message body`

## Runtime Config Finding

During the first worker fast-path run, the new job stayed `pending`.

Root cause:

- `video-worker` did not have `WORKER_DATABASE_URL`.
- It was falling back to an old Supabase pooler URL.
- Therefore it could not claim jobs from `jj_selfhost`.

Remediation performed on Singapore rehearsal:

- Backed up `/etc/jingjing/worker.env`.
- Added `WORKER_DATABASE_URL` pointing at the same self-hosted DB through Docker network host `jingjing-selfhost-pg:5432`.
- Restarted `jingjing-worker-compose.service`.
- Confirmed `video-worker` reports `WORKER_DATABASE_URL host=jingjing-selfhost-pg port=5432 db=jj_selfhost`.

After remediation:

- The earlier timed-out fast-path job `f07812b7-4c33-4ce0-9cd6-315938789a6c` completed.
- A fresh fast-path smoke passed.

## Repository Status

Still not migrated:

- `consultation-repository.ts`
- `knowledge-repository.ts`
- `agent-console-repository.ts`
- `platform-admin-session.ts`
- `platform-admin-repository.ts`
- `material-library-repository.ts`
- `import-repository.ts` write path

The new tables are available, but consultation, knowledge/RAG, Agent console, platform admin Auth, and material reference runtime paths are not yet fully PostgreSQL-backed.

## Push / Merge / Long-task

- Push before implementation: yes, pushed `45d7134` to Gitee.
- Push after schema implementation: not yet.
- Merge to `main`: no.
- Project long-task: not marked complete; local `active.json` status is `paused`.
