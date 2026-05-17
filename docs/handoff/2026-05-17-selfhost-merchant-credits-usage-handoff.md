# 2026-05-17 Self-hosted Merchant Credits / Usage Handoff

## Current Goal

Complete P1 repository migration Batch 8: merchant credits / usage accounting.

Goal achieved:

```text
On self-hosted PostgreSQL, consultation entitlement can create/read merchant credit
accounts, reserve usage events, mark usage consumed/failed/skipped, consume credits,
and write ledger rows without Supabase Admin.
```

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Starting commit: `eac3702df6eef6dbc0e5e793b38a5f472cfaa13b`
- Starting commit pushed to Gitee before editing: yes
- Final commit: current branch HEAD after this handoff commit; exact hash is reported in the final response.

## Completed

- Added additive migration:
  - `app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql`
- Added PostgreSQL paths in `app/src/lib/db/agent-console-repository.ts` for:
  - `ensureMerchantCreditAccount`
  - `recordMerchantUsageEvent`
  - `updateMerchantUsageEvent`
  - `consumeMerchantCredits`
  - internal `recordMerchantCreditLedger`
- Kept Supabase Admin fallback.
- Kept no-Supabase/no-Postgres fallback compatible.
- Added Batch 8 smoke:
  - `app/scripts/check-domestic-merchant-credits-usage-smoke.mjs`
- Added progress:
  - `docs/progress/2026-05-17-selfhost-merchant-credits-usage.md`

## Changed Files

```text
app/db/migrations/202605170001_selfhost_merchant_credits_usage.sql
app/src/lib/db/agent-console-repository.ts
app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
docs/progress/2026-05-17-selfhost-merchant-credits-usage.md
docs/handoff/2026-05-17-selfhost-merchant-credits-usage-handoff.md
```

## Validation Commands

Local passed:

```bash
node --check app/scripts/check-domestic-merchant-credits-usage-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Local DB smoke passed against fresh PostgreSQL with migrations:

```text
202605130001_domestic_core_baseline.sql
202605160001_selfhost_p0_foundation.sql
202605170001_selfhost_merchant_credits_usage.sql
```

Singapore passed:

- live `/api/health`: `ok=true`, DB provider `postgres`, COS configured
- live `jingjing-selfhost-app` preflight: `status=ok`
- applied `202605170001_selfhost_merchant_credits_usage.sql` additively through SSH tunnel
- new Batch 8 merchant credits / usage smoke against Singapore DB: `status=ok`
- Batch 7 material library non-regression smoke against Singapore DB: `status=ok`

## Push / Merge State

- `eac3702` was pushed to Gitee before editing.
- New Batch 8 commit is local unless the user asks to push.
- `main` was not merged.
- No completion marker was written.

## Not Done / Out Of Scope

- No OSS/COS adapter changes.
- No worker / FireRed / OpenStoryline / TTS changes.
- No payment provider / invoice / billing callback changes.
- No real Dify/model call.
- No pgvector/vector RPC changes.
- No main merge.
- No completion marker write.

## Residual Risks

- HTTP route-level consultation entitlement was not exercised because the available consultation route continues into runtime/model flow; this batch instead validates the repository/database accounting path directly.
- Existing live Singapore app was not replaced with this branch.
- Payment/billing integration remains separate from internal credits accounting.

## Next Recommended Batch

Next batch should choose one:

1. storage provider abstraction + Aliyun OSS adapter if Monday cloud procurement is ready.
2. worker / TTS domesticization if runtime provider decisions are ready.
3. formal app-owned registration / invite redemption cleanup if auth purchase/setup is the bottleneck.

Keep storage, worker/TTS, and payment/billing isolated from each other.
