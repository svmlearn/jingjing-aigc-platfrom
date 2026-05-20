# 2026-05-17 P1 Repository Migration Batch 8: Merchant Credits / Usage Accounting

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 7 material library.

This batch migrates the Agent consultation credit gate and usage accounting from Supabase Admin to ordinary self-hosted PostgreSQL.

The goal is:

```text
On self-hosted PostgreSQL, consultation entitlement can create/read merchant credit
accounts, reserve usage events, mark usage consumed/failed/skipped, consume credits,
and write ledger rows without Supabase Admin.
```

This is an accounting/repository batch. It is not storage, OSS, worker, TTS, real model runtime, or payment billing.

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
eac3702 feat: add selfhost material library repository
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -6
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-17-selfhost-material-library.md
docs/handoff/2026-05-17-selfhost-material-library-handoff.md
docs/架构规范/2026-05-16-selfhost-postgres-full-schema-plan.md
docs/progress/2026-05-16-full-supabase-exit-audit.md
```

Inspect before editing:

```text
app/src/lib/db/agent-console-repository.ts
app/src/server/api/consultation-service.ts
app/src/contracts/agent-console.ts
app/src/lib/server-db/postgres.ts
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
```

Before deciding scope, also confirm that the following are already self-hosted paths and should not be duplicated in this batch:

```text
app/src/lib/db/daily-content-task-repository.ts
app/src/lib/db/content-draft-repository.ts
app/src/lib/db/media-repository.ts
app/src/lib/db/postgres-video-chain-repository.ts
```

## 4. Implementation Scope

### 4.1 Additive PostgreSQL migration

Add one additive migration, suggested name:

```text
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
```

Create these tables if absent:

```text
merchant_credit_accounts
merchant_usage_events
merchant_credit_ledger
```

Expected minimum schema:

```text
merchant_credit_accounts
- id uuid PK default gen_random_uuid()
- merchant_id uuid not null unique references merchant_profiles(id) on delete cascade
- balance integer not null default 0 check balance >= 0
- metadata jsonb not null default '{}'
- created_at timestamptz not null default timezone('utc', now())
- updated_at timestamptz not null default timezone('utc', now())

merchant_usage_events
- id uuid PK default gen_random_uuid()
- merchant_id uuid not null references merchant_profiles(id) on delete cascade
- action_type text not null
- agent_id uuid null references agent_configs(id) on delete set null
- estimated_cost integer null check estimated_cost is null or estimated_cost >= 0
- actual_cost integer null check actual_cost is null or actual_cost >= 0
- status text not null check status in ('reserved', 'consumed', 'failed', 'refunded', 'skipped')
- metadata jsonb not null default '{}'
- created_at timestamptz not null default timezone('utc', now())

merchant_credit_ledger
- id uuid PK default gen_random_uuid()
- merchant_id uuid not null references merchant_profiles(id) on delete cascade
- credit_account_id uuid null references merchant_credit_accounts(id) on delete set null
- direction text not null check direction in ('grant', 'consume', 'refund', 'adjust', 'expire')
- amount integer not null check amount >= 0
- reason text not null
- related_usage_event_id uuid null references merchant_usage_events(id) on delete set null
- metadata jsonb not null default '{}'
- created_at timestamptz not null default timezone('utc', now())
```

Add practical indexes:

```text
merchant_credit_accounts(merchant_id)
merchant_usage_events(merchant_id, created_at desc)
merchant_usage_events(status, created_at desc)
merchant_credit_ledger(merchant_id, created_at desc)
merchant_credit_ledger(credit_account_id, created_at desc)
merchant_credit_ledger(related_usage_event_id)
```

Use the existing updated-at trigger helper if present in the baseline; otherwise create a local trigger/function consistently with existing migrations.

### 4.2 Repository migration

In:

```text
app/src/lib/db/agent-console-repository.ts
```

Implement self-hosted PostgreSQL paths for:

```text
ensureMerchantCreditAccount
recordMerchantUsageEvent
updateMerchantUsageEvent
consumeMerchantCredits
recordMerchantCreditLedger internal helper
```

Expected behavior:

- Prefer ordinary PostgreSQL when `shouldUseAppPostgres()` is true.
- Keep Supabase Admin fallback for legacy/staging.
- Keep no-Supabase/no-Postgres behavior compatible: existing demo/fallback mode must not break consultation.
- `ensureMerchantCreditAccount`:
  - returns existing account by merchant
  - creates one if absent
  - applies non-negative `initialBalance`
  - writes a `grant` ledger row when initial balance is positive
  - is safe under duplicate/concurrent creation by using unique `merchant_id` and conflict handling
- `recordMerchantUsageEvent`:
  - inserts reserved/consumed/failed/refunded/skipped events
  - returns the same DTO shape as Supabase path
- `updateMerchantUsageEvent`:
  - updates by `usageEventId`
  - preserves metadata semantics from the current path
  - throws a clear API error if the event is missing
- `consumeMerchantCredits`:
  - validates account belongs to merchant
  - checks sufficient balance
  - updates balance and writes consume ledger atomically
  - keeps error code `MERCHANT_CREDIT_INSUFFICIENT` for insufficient balance
- `recordMerchantCreditLedger`:
  - writes rows in PostgreSQL for grant/consume/refund/adjust/expire

Use:

```text
queryAppDb
withAppDbTransaction
mapPostgresError
```

For credit consumption, prefer one transaction. Do not introduce app-level read/update races if PostgreSQL can lock the row with `for update`.

### 4.3 Consultation non-regression

The existing consultation flow in:

```text
app/src/server/api/consultation-service.ts
```

should not need broad changes. Only adjust it if the repository API requires a very small compatibility fix.

The desired outcome is:

```text
checkConsultationEntitlement -> ensure account -> reserve usage
recordConsultationUsageSafely -> update usage -> consume credit -> ledger row
```

No real model call is required for this batch.

## 5. Explicitly Out Of Scope

Do not migrate or redesign in this batch:

```text
Aliyun OSS adapter
Tencent COS adapter
storage provider abstraction
payment provider / real billing / invoices
worker / FireRed / OpenStoryline / TTS
knowledge vector / pgvector
material provider real calls
daily-content-task-repository.ts
content-draft-repository.ts
media-repository.ts
main merge
completion marker
```

Do not require:

```text
real Dify/model call
real voice clone/TTS
real external benchmark/provider call
real payment callback
normal FireRed
```

## 6. Smoke Script

Add a focused self-hosted smoke, suggested:

```text
app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
```

The smoke should prove against ordinary PostgreSQL:

- required tables exist:
  - `merchant_credit_accounts`
  - `merchant_usage_events`
  - `merchant_credit_ledger`
  - `merchant_profiles`
  - `agent_configs`
- create/reuse isolated merchant fixture
- `ensureMerchantCreditAccount` creates account with initial balance
- second ensure returns same account and does not duplicate grant ledger
- `recordMerchantUsageEvent` creates reserved event
- `updateMerchantUsageEvent` marks event consumed and stores metadata
- `consumeMerchantCredits` decreases balance and writes consume ledger
- insufficient credit returns expected 402 / `MERCHANT_CREDIT_INSUFFICIENT`
- skipped/failed usage event paths can be recorded
- cleanup removes usage, ledger, credit account, and fixture rows
- rerun is safe

If practical, support `--base-url` for one light HTTP/non-regression check that exercises the consultation entitlement path without a real model call. If that becomes too invasive, keep this smoke DB-level and document why.

## 7. Required Validation

Local validation:

```bash
node --check app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local database validation:

```text
fresh ordinary PostgreSQL
baseline migration
selfhost foundation migration
new merchant credits/usage migration
merchant credits/usage smoke
```

Singapore validation:

```text
live /api/health
app preflight
new merchant credits/usage smoke against Singapore self-hosted PostgreSQL
Batch 7 material library non-regression smoke
```

Do not replace the live Singapore app unless there is a clear reason. If route-level validation is done only locally, record that explicitly.

## 8. Documentation To Add

Add:

```text
docs/progress/2026-05-17-selfhost-merchant-credits-usage.md
docs/handoff/2026-05-17-selfhost-merchant-credits-usage-handoff.md
```

Progress must include:

- exact migration file
- exact functions migrated
- local validation result
- Singapore validation result
- whether the new commit was pushed
- remaining risks

Handoff must include:

- branch/worktree
- starting commit
- final commit
- changed files
- validation commands
- push/merge state
- next recommended batch

## 9. Completion Conditions

This batch is complete only when:

- migration applies on fresh local PostgreSQL
- migration applies additively on Singapore self-hosted PostgreSQL
- self-hosted repository smoke passes locally
- self-hosted repository smoke passes against Singapore DB
- typecheck/lint/build pass
- worktree is clean
- final commit exists
- no main merge
- no forbidden completion marker

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

## 10. Recommended Final Reply Shape

When done, report:

```text
Completed Batch 8 merchant credits / usage accounting.

Final HEAD:
<hash> <message>

Changed files:
...

Validation:
...

Gitee:
...

Out of scope:
OSS/storage, payment provider, worker/TTS, main merge, completion marker.

Recommended next batch:
storage provider abstraction + Aliyun OSS adapter, or worker/TTS depending on Monday cloud purchase readiness.
```
