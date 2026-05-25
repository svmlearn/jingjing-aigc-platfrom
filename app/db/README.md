# Domestic PostgreSQL Baseline

This directory contains plain PostgreSQL migrations for the first domestic
verification chain. These files are derived from `app/supabase/migrations/`,
but remove Supabase-only pieces such as `auth.users`, RLS policies, PostgREST
grants, and Supabase Auth assumptions.

First-phase scope:

- Minimal `app_users` and `user_sessions` for IP-stage login.
- Merchant, member, draft, variant, media asset, and video job tables.
- Aliyun OSS / object storage metadata stored as `bucket_name + storage_key`.
- Worker reliability columns for claim, heartbeat, timeout, failure reason,
  retry, and manual rerun tracking.

Apply on an empty domestic PostgreSQL database by filename order:

```bash
psql "$DATABASE_URL" -f app/db/migrations/202605130001_domestic_core_baseline.sql
psql "$DATABASE_URL" -f app/db/migrations/202605160001_selfhost_p0_foundation.sql
psql "$DATABASE_URL" -f app/db/migrations/202605160002_selfhost_pgvector_optional.sql
```

`202605160001_selfhost_p0_foundation.sql` is additive for existing
self-hosted rehearsal databases. It adds platform admin auth, consultation,
strategy asset, knowledge/RAG foundation, platform settings/events, Agent
foundation, and material workbench reference tables without Supabase Auth or
RLS dependencies.

`202605160002_selfhost_pgvector_optional.sql` is safe to run after foundation
schema. It adds `knowledge_chunks.embedding vector(1536)`, an HNSW index, and
`match_knowledge_chunks` only when the target PostgreSQL instance exposes
`pgvector`; otherwise it leaves the `embedding_json` fallback untouched.

Check app-side domestic environment without printing secrets:

```bash
node app/scripts/check-domestic-app-env.mjs --env-file app/.env.production
```

Check real domestic Aliyun OSS signed PUT / signed download / delete without printing secrets:

```bash
node app/scripts/check-aliyun-oss-signed-put-smoke.mjs --env-file app/.env.production
```

Generate a first test password hash before inserting a manual `app_users` row:

```bash
node app/scripts/create-domestic-password-hash.mjs '<temporary-password>'
```

Seed the first domestic verification owner and merchant:

```bash
HASH="$(node app/scripts/create-domestic-password-hash.mjs '<temporary-password>')"
psql "$DATABASE_URL" \
  -v user_email='owner@example.com' \
  -v password_hash="$HASH" \
  -v display_name='Domestic Test Owner' \
  -v merchant_name='Domestic Test Merchant' \
  -f app/db/seeds/domestic_minimal_seed.example.sql
```

Create a reusable video-chain fixture for API smoke checks:

```bash
psql "$DATABASE_URL" \
  -v user_email='owner@example.com' \
  -f app/db/seeds/domestic_video_chain_fixture.example.sql
```

Do not use this as a production cutover script yet. Full historical migration,
password reset, and platform admin migration are separate later phases.
