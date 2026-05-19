# 2026-05-16 Self-hosted Consultation + Strategy Repositories Handoff

## Current Goal

完成 P0 repository migration Batch 2：把 merchant consultation 与 merchant strategy asset repositories 迁到 self-hosted PostgreSQL path。

## Branch / Worktree

- Worktree: `/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration`
- Branch: `codex/domestic-infra-migration`
- Required pre-work backup: pushed `65eab8c` to `gitee/codex/domestic-infra-migration`
- Final implementation commit: the commit containing this handoff; exact SHA should be read from branch tip / final response.

## Completed

- `consultation-repository.ts` now prefers self-hosted PostgreSQL when app PostgreSQL mode is configured.
- Supabase Admin fallback remains for legacy/staging paths.
- in-memory fallback remains only when neither self-hosted PostgreSQL nor Supabase Admin is configured.
- PostgreSQL paths added for:
  - session list/create/detail/update/delete
  - message create/list
  - event create/list
  - latest message preview lookup
- `createConsultationMessage` uses a DB transaction to insert message and touch session `last_message_at`.
- `deleteConsultationSession` uses DB delete with merchant scope; messages/events cascade through FK.
- `merchant-strategy-asset-repository.ts` now prefers self-hosted PostgreSQL for get/upsert/ensure.
- Added required smoke script:
  - `app/scripts/check-domestic-consultation-strategy-smoke.mjs`

## Changed Files

- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`
- `app/scripts/check-domestic-consultation-strategy-smoke.mjs`
- `docs/progress/2026-05-16-selfhost-consultation-strategy-repositories.md`
- `docs/handoff/2026-05-16-selfhost-consultation-strategy-repositories-handoff.md`

## Validation

Local passed:

- `node --check app/scripts/check-domestic-consultation-strategy-smoke.mjs`
- `pnpm --dir app typecheck`
- `pnpm --dir app lint`
- `pnpm --dir app build`
- fresh local PostgreSQL DB-level smoke
- fresh local PostgreSQL + production app/API smoke on `127.0.0.1:34019`

Local app/API smoke result:

- login `303`
- consultation create/list/detail/delete: `201 / 200 / 200 / 204`
- direct DB strategy/session/message/event/update/list/detail/delete cascade checks passed
- cleanup ok

Singapore passed:

- live `GET /api/health`
- live app env preflight
- branch-specific temp app on `127.0.0.1:34020`
- temp app health
- temp app env preflight
- new consultation/strategy smoke through temp app
- platform-admin session smoke as non-regression

Singapore cleanup:

- temp container removed
- temp release directory removed
- smoke fixture counts confirmed `0`

## Not Completed / Out Of Scope

- RAG / knowledge repository was not migrated.
- Agent console repository was not migrated.
- OSS / worker / FireRed / OpenStoryline / TTS were not touched.
- `platform-admin-repository.ts` full admin-user management was not migrated.
- Team/Dify `failed_manual` observation was not investigated in this batch.
- No main merge.
- No post-work push.

## Notes For Next Agent

- The current consultation APIs can create/list/detail/delete sessions on self-hosted PostgreSQL.
- Message endpoint still invokes AI/runtime processing and was not used as the Batch 2 smoke path to avoid dragging AI runtime into repository validation.
- Standard session creation already exercises the migrated repository paths by creating a session, an initial event, an initial assistant message, and a merchant strategy asset.
- Roundtable state still resolves from `roundtable.state.updated` consultation events; this batch did not add direct read/write use of `consultation_roundtable_states`.

## Recommended Next Batch

Migrate `knowledge-repository.ts` only after deciding the text fallback vs pgvector path. Keep Agent console, OSS, worker and TTS out unless explicitly scoped.
