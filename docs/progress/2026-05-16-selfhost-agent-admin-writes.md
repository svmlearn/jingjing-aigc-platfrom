# 2026-05-16 Self-hosted Agent Admin Writes Progress

## Scope

This round implements P0 repository migration Batch 4B: Agent Console admin edit/write paths on ordinary PostgreSQL.

Included:

- Agent config create/update/copy.
- agent.md draft/save/publish/rollback.
- soul.md draft/save/publish/rollback.
- Skill create/update and Agent Skill binding replacement.
- Knowledge Set create/update, document link replacement, and Agent Knowledge Set binding replacement.
- `consultation_default` route binding switch.
- Admin write audit rows in `platform_admin_events`.
- New smoke script:
  - `app/scripts/check-domestic-agent-admin-writes-smoke.mjs`

Explicitly not included:

- Credits / usage migration.
- OSS adapter or storage-provider migration.
- worker / FireRed / OpenStoryline / TTS changes.
- platform admin user-management migration.
- main merge.
- completion marker writes.

## Implementation Notes

`app/src/lib/db/agent-console-repository.ts` now follows the existing preference rule:

1. Use ordinary PostgreSQL when `isAppPostgresConfigured()` and `isAppPostgresPreferred()` are true.
2. Keep Supabase Admin fallback for legacy/staging paths.
3. Keep demo fallback only for read paths when neither PostgreSQL nor Supabase Admin is configured.

All new PostgreSQL write paths use transactions where multiple writes must stay consistent.

Behavior covered:

- Display-name uniqueness is checked before Agent create/update/copy.
- Enabled Agents require an active non-empty prompt.
- Active `consultation_default` Agent cannot be disabled before switching the default route.
- Copy duplicates active/draft prompt, active/draft soul, Skill bindings, and Knowledge Set bindings.
- Prompt/soul publishing archives the previous active version.
- Prompt/soul rollback activates the archived target after archiving the current active version.
- Skill disable disables active bindings for that Skill.
- Knowledge Set disable disables active Agent bindings for that Knowledge Set.
- Binding replacement disables removed bindings and inserts missing desired bindings.
- Knowledge document existence is checked before linking.
- `consultation_default` upserts by `route_key`.

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-agent-admin-writes-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Temporary local PostgreSQL DB-level smoke:

- Applied:
  - `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- Ran:
  - `APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable node app/scripts/check-domestic-agent-admin-writes-smoke.mjs`
- Result: `status=ok`
- Direct smoke verified copied Agent has:
  - active prompt count `1`
  - draft prompt count `1`
  - active soul count `1`
  - draft soul count `1`
  - enabled Skill binding count `1`
  - enabled Knowledge Set binding count `1`
- Cleanup result: `status=ok`

Temporary local app/API smoke:

- Started `next start` against a fresh local PostgreSQL DB on `127.0.0.1:34026`.
- Ran:
  - `node app/scripts/check-domestic-agent-admin-writes-smoke.mjs --base-url http://127.0.0.1:34026`
- Result: `status=ok`
- HTTP checks passed:
  - create Agent `201`
  - save/publish prompt `200`
  - enable Agent `200`
  - save/publish soul `200`
  - prompt rollback `200`
  - soul rollback `200`
  - create/bind Skill
  - create Knowledge Set
  - bind document to Knowledge Set
  - bind Knowledge Set to Agent
  - set `consultation_default`
  - merchant login `303`
  - `/api/consultation/experts` resolved the new default Agent
  - copy Agent `201`
  - copied Agent included active/draft prompt, active/draft soul, Skill binding, and Knowledge Set binding
- Cleanup result: `status=ok`

## Singapore Validation

Live health:

```text
GET http://43.160.208.189/api/health
ok=true
database.provider=postgres
cos.status=configured
```

Live app preflight in `jingjing-selfhost-app`:

```text
status=ok
database.selectOne=true
requiredTablesPresent=true
DATABASE_PROVIDER=postgres
VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED=enabled
COS env checks=ok
```

Batch 4B DB-level smoke against Singapore self-hosted PostgreSQL:

- Accessed the remote DB through an SSH tunnel to `127.0.0.1:15433`.
- Reused the live app container `APP_DATABASE_URL` without printing the connection string.
- Ran:
  - `node app/scripts/check-domestic-agent-admin-writes-smoke.mjs`
- Result: `status=ok`
- Cleanup result: `status=ok`

Non-regression smoke:

- Ran `check-domestic-knowledge-repository-smoke.mjs` against the Singapore self-hosted DB through SSH tunnel.
- Result: `status=ok`
- `pgvectorRequired=false`
- `embeddingJsonColumnPresent=true`
- `vectorColumnPresent=false`
- Cleanup result: `status=ok`

Note: Singapore validation did not replace the live app with this branch. The new Batch 4B API write paths were validated locally through a branch-built temp app; Singapore validation covered live health/preflight plus DB compatibility against the Singapore self-hosted PostgreSQL.

## Repository Status

Not pushed after implementation yet at the time this progress file was written.

No merge to `main`.

No completion markers written:

```text
DOMESTIC_PHASE1_E2E_PASS
DOMESTIC_INFRA_MIGRATION_PHASE1_COMPLETE
```
