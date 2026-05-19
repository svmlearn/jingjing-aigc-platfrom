# 2026-05-17 Self-hosted Merchant Credits / Usage

## Scope

Batch 8 migrated merchant credit and usage accounting persistence to ordinary self-hosted PostgreSQL:

- credit account ensure/create/read
- usage event reserve/create/update
- credit consume with sufficient-balance guard
- credit ledger grant/consume rows

Out of scope remained untouched:

- OSS / COS adapter
- worker / FireRed / OpenStoryline / TTS
- payment provider, invoices, billing callbacks
- real model/Dify runtime calls
- knowledge vector / pgvector
- main merge
- completion markers

## Migration

Added:

```text
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
```

Tables:

- `merchant_credit_accounts`
- `merchant_usage_events`
- `merchant_credit_ledger`

The migration is additive and uses the existing `public.set_updated_at()` trigger helper for `merchant_credit_accounts.updated_at`.

## Repository Functions Migrated

In `app/src/lib/db/agent-console-repository.ts`:

- `ensureMerchantCreditAccount`
- `recordMerchantUsageEvent`
- `updateMerchantUsageEvent`
- `consumeMerchantCredits`
- internal `recordMerchantCreditLedger`

Implementation notes:

- PostgreSQL mode uses `shouldUseAppPostgres()`.
- Supabase Admin fallback remains for legacy/staging.
- Existing no-Postgres/no-Supabase fallback behavior remains compatible by returning `null`.
- `ensureMerchantCreditAccount()` uses unique `merchant_id` conflict handling and writes a `grant` ledger row only when a new account is created with positive initial balance.
- `consumeMerchantCredits()` locks the account row with `for update`, validates merchant ownership, checks sufficient balance, updates balance, and writes `consume` ledger in one transaction.
- Insufficient balance keeps error code `MERCHANT_CREDIT_INSUFFICIENT`.

## Changed Files

```text
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
app/src/lib/db/agent-console-repository.ts
app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
docs/progress/2026-05-17-selfhost-merchant-credits-usage.md
docs/handoff/2026-05-17-selfhost-merchant-credits-usage-handoff.md
```

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local database validation ran against a fresh ordinary PostgreSQL database initialized with:

```text
app/db/migrations/202605130001_domestic_core_baseline.sql
app/db/migrations/202605160001_selfhost_p0_foundation.sql
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
```

Result:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
accountCreated=true
secondEnsureSameAccount=true
grantLedgerOnce=true
reservedUsage=true
usageUpdate=true
consumeCredits=true
consumeLedger=true
insufficientCredit=true
skippedUsage=true
failedUsage=true
merchantScoping=true
cleanup.status=ok
```

HTTP validation was intentionally skipped for this batch because there is no safe route that exercises the consultation entitlement path without continuing into runtime/model handling. This batch validated the accounting repository/database path directly and did not call real model/Dify providers.

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` preflight: passed, `status=ok`, database tables present, COS env present, video-chain test entrypoint enabled.

Applied the additive migration to Singapore self-hosted PostgreSQL through SSH tunnel:

```text
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
```

New Batch 8 smoke against Singapore self-hosted PostgreSQL through SSH tunnel:

```text
status=ok
database.requiredTablesPresent=true
direct.status=ok
accountCreated=true
secondEnsureSameAccount=true
grantLedgerOnce=true
reservedUsage=true
usageUpdate=true
consumeCredits=true
consumeLedger=true
insufficientCredit=true
skippedUsage=true
failedUsage=true
merchantScoping=true
cleanup.status=ok
```

Singapore non-regression:

- `check-domestic-material-library-smoke.mjs` against Singapore self-hosted PostgreSQL through SSH tunnel: `status=ok`.

Singapore note:

- I did not replace the live Singapore app with this branch.
- Singapore route-level Batch 8 behavior was not tested against a branch temp container.
- No real model, Dify, payment, OSS, worker, or TTS path was called.

## Backup / Push State

Before code changes, current `eac3702df6eef6dbc0e5e793b38a5f472cfaa13b` was pushed to Gitee:

```text
gitee/codex/domestic-infra-migration = eac3702df6eef6dbc0e5e793b38a5f472cfaa13b
```

The new Batch 8 commit is local unless explicitly pushed later.

## Remaining Risks

- Consultation route-level entitlement was not exercised in HTTP because safe no-model coverage is not currently exposed as an API surface.
- Existing live Singapore app was intentionally not replaced.
- Payment/billing provider integration remains out of scope; this validates internal accounting persistence only.
