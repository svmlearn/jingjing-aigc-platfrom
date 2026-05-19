# 2026-05-16 Self-hosted Consultation + Strategy Repository Progress

## Scope

本轮只做 P0 repository migration Batch 2：

- `consultation-repository.ts`
- `merchant-strategy-asset-repository.ts`

目标是在 self-hosted PostgreSQL 模式下，让咨询会话 / 消息 / 事件与商家策略资产可持久化、可重载，并可被当前咨询 API 使用。

未包含：

- 未迁移 RAG / knowledge repository。
- 未迁移 Agent console repository。
- 未迁移 OSS / worker / FireRed / OpenStoryline / TTS。
- 未迁移 `platform-admin-repository.ts` 完整后台用户管理。
- 未处理上一轮 Team/Dify `failed_manual` 观察项。
- 未合并 main。
- 未写任务书禁止的完成标记。

## Files

Updated:

- `app/src/lib/db/consultation-repository.ts`
- `app/src/lib/db/merchant-strategy-asset-repository.ts`

Added:

- `app/scripts/check-domestic-consultation-strategy-smoke.mjs`

## Implementation Notes

### Consultation Repository

`consultation-repository.ts` 现在按以下优先级运行：

1. self-hosted PostgreSQL path
2. Supabase Admin fallback
3. in-memory demo fallback

PostgreSQL path 覆盖：

- `listConsultationSessions`
- `createConsultationSession`
- `getConsultationSessionDetail`
- `createConsultationMessage`
- `createConsultationEvent`
- `updateConsultationSession`
- `deleteConsultationSession`
- internal:
  - `listConsultationMessages`
  - `listConsultationEvents`
  - `listLatestMessagePreviewBySessionIds`

行为：

- `merchant_id` 过滤保留在 list/detail/update/delete。
- message insert 与 session `last_message_at` 更新使用事务。
- session delete 依赖 FK cascade 删除 messages/events。
- JSON 字段按 `jsonb` round-trip：
  - `strategy_snapshot`
  - `tool_cards`
  - `visible_summary`
  - `payload`

### Merchant Strategy Asset Repository

`merchant-strategy-asset-repository.ts` 现在按以下优先级运行：

1. self-hosted PostgreSQL path
2. Supabase Admin fallback
3. in-memory demo fallback

PostgreSQL path 覆盖：

- `getMerchantStrategyAsset`
- `getMerchantStrategyAssetDocument`
- `upsertMerchantStrategyAsset`
- `upsertMerchantStrategyAssetDocument`
- `ensureMerchantStrategyAsset`
- `ensureMerchantStrategyAssetDocument`

行为：

- 以 `merchant_id` upsert。
- `strategy_markdown` 默认生成逻辑保持兼容。
- `canonical_snapshot` / `compiled_context` 保持 JSON-safe。
- DTO shape 未变。

## Smoke Script

新增：

```bash
node app/scripts/check-domestic-consultation-strategy-smoke.mjs
```

覆盖：

- required tables exist
- 创建临时 merchant owner / merchant / team owner fixture
- strategy asset upsert/get
- consultation session create/list/detail
- message create and latest preview / last message update
- event create/list
- session update
- delete cascade
- cleanup fixture
- 支持 `--base-url`：
  - merchant login
  - consultation session create/list/detail/delete through current app API

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-consultation-strategy-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

DB-level smoke:

- fresh local PostgreSQL
- applied:
  - `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- ran:

```bash
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  node app/scripts/check-domestic-consultation-strategy-smoke.mjs
```

Result:

- `status=ok`
- required tables present
- fixture created
- strategy asset upserted
- direct session/message/event created
- session update passed
- detail round-trip passed
- latest preview updated
- delete cascade passed
- cleanup ok

Local app/API smoke:

- fresh local PostgreSQL with the same two migrations
- production `next start` on `127.0.0.1:34019`
- ran:

```bash
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  node app/scripts/check-domestic-consultation-strategy-smoke.mjs \
  --base-url http://127.0.0.1:34019
```

Result:

- `status=ok`
- login `303`
- consultation create `201`
- list `200`
- detail `200`
- delete `204`
- created session had `1` message and `1` event
- API-created session appeared in list
- delete persisted
- cleanup ok

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` app preflight: passed.

Branch-specific temporary app:

- Created isolated temp release from current live container.
- Patched Batch 2 files into temp release.
- Also patched previous Batch 1 platform admin auth files so the temp app represented the full branch state, not only the live app plus Batch 2.
- Started temp container on `127.0.0.1:34020`.
- Live app was not replaced.

Temp app validation:

- `GET http://127.0.0.1:34020/api/health`: passed.
- `node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`: passed.
- `node scripts/check-domestic-consultation-strategy-smoke.mjs --base-url http://127.0.0.1:34020`: passed.

Singapore consultation/strategy smoke result:

- `status=ok`
- required tables present
- strategy asset upserted
- direct session/message/event/update/list/detail/delete cascade passed
- API login `303`
- API create/list/detail/delete: `201 / 200 / 200 / 204`
- created API session had `1` message and `1` event
- cleanup ok

Non-regression:

- `node scripts/check-domestic-platform-admin-session-smoke.mjs --base-url http://127.0.0.1:34020`: passed after rebuilding the temp app with the full branch state.
- Result:
  - unauthenticated `401`
  - authenticated `200`
  - revoked cookie `401`
  - cleanup ok

Additional validation note:

- A first platform-admin non-regression attempt failed because the temp release initially missed previous Batch 1 auth files copied from this branch.
- After adding those files and rebuilding, the non-regression passed.

Cleanup:

- Temp container removed.
- Temp release directory removed.
- Follow-up query confirmed no leftover smoke users:
  - consultation smoke users: `0`
  - platform admin smoke users: `0`

## Push / Merge

- Pre-work Gitee backup: pushed `65eab8c` to `gitee/codex/domestic-infra-migration`.
- Post-work push: not done.
- Merge to main: not done.
