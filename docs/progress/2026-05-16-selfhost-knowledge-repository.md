# 2026-05-16 Self-hosted Knowledge Repository Progress

## Scope

本轮只做 P0 repository migration Batch 3：

- `app/src/lib/db/knowledge-repository.ts`
- 新增 knowledge repository smoke 脚本

目标是在 self-hosted PostgreSQL 模式下，让平台方法论知识库与商家知识库可以使用普通 PostgreSQL 表完成文档、chunk、ingestion job、统计与词法检索。

未包含：

- 未迁移 Agent Console repository。
- 未迁移 OSS / worker / FireRed / OpenStoryline / TTS。
- 未改发布链路、素材链路或真实账号发布路径。
- 未合并 main。
- 未写任务书禁止的完成标记。

## Files

Updated:

- `app/src/lib/db/knowledge-repository.ts`

Added:

- `app/scripts/check-domestic-knowledge-repository-smoke.mjs`

## Implementation Notes

`knowledge-repository.ts` 现在按以下优先级运行：

1. self-hosted PostgreSQL path
2. Supabase Admin fallback
3. in-memory demo fallback

PostgreSQL path 覆盖：

- `listKnowledgeDocuments`
- `getKnowledgeDocumentById`
- `createKnowledgeDocument`
- `updateKnowledgeDocument`
- `deleteKnowledgeDocument`
- `createKnowledgeIngestionJob`
- `updateKnowledgeIngestionJob`
- `replaceKnowledgeChunks`
- `listKnowledgeChunksByDocumentId`
- `searchKnowledgeChunks`
- internal:
  - `attachKnowledgeDocumentStats`
  - `countKnowledgeChunksByDocumentIds`
  - `listLatestKnowledgeJobsByDocumentIds`

行为：

- 平台文档使用 `scope='platform'` 且 `merchant_id is null`。
- 商家文档使用 `scope='merchant'` 且保留 `merchant_id`。
- 文档统计包含 chunk count 与 latest ingestion job。
- 删除文档依赖 FK cascade 删除 chunks/jobs。
- JSON 字段通过 `jsonb` round-trip：
  - document `metadata`
  - ingestion job `input_payload`
  - ingestion job `log_payload`
  - chunk `metadata`
- DTO shape 未变。

## pgvector Independence

- 普通 PostgreSQL path 不依赖 pgvector。
- `replaceKnowledgeChunks` 只写 `embedding_json double precision[]` 与 `embedding_dimensions`。
- 不向可选 `embedding vector(...)` 列写入。
- `searchKnowledgeChunks` 在 PostgreSQL path 不调用 vector RPC，始终可走词法检索。
- 如果没有正分匹配，返回稳定 fallback 结果，避免空检索把咨询链路中断。

## Search Semantics

- 平台文档作为全局知识进入检索。
- 商家文档只在对应 merchant 下进入检索。
- `documentIds` 只限制平台文档候选集。
- 排序沿用当前 fallback 分词/命中计分逻辑：
  - 正分匹配优先。
  - 无正分时按确定性结果返回至 limit。

## Smoke Script

新增：

```bash
node app/scripts/check-domestic-knowledge-repository-smoke.mjs
```

覆盖：

- required tables exist
- `knowledge_chunks.embedding_json` 存在
- pgvector 不作为必需条件
- 创建临时 merchant owner / merchant / team owner fixture
- 平台文档与商家文档创建
- ingestion job create/update
- chunk replace/list
- embedding array 写入 `embedding_json`
- document stats
- get by id
- lexical platform search
- lexical merchant search
- `documentIds` 平台文档过滤
- no-positive fallback
- update document
- delete cascade
- cleanup fixture
- 支持 `--base-url`：
  - merchant login
  - merchant memory create/list/patch/retry/delete through current app API

## Local Validation

Passed:

```bash
node --check app/scripts/check-domestic-knowledge-repository-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
```

DB-level smoke:

- fresh local PostgreSQL
- applied:
  - `app/db/migrations/202605130001_domestic_core_baseline.sql`
  - `app/db/migrations/202605160001_selfhost_p0_foundation.sql`
- optional pgvector migration was not applied
- ran:

```bash
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  node app/scripts/check-domestic-knowledge-repository-smoke.mjs
```

Result:

- `status=ok`
- required tables present
- `embeddingJsonColumnPresent=true`
- `vectorColumnPresent=false`
- fixture created
- job create/update passed
- `embedding_json` storage passed
- chunk list passed
- document stats passed
- get by id passed
- platform lexical search passed
- merchant lexical search passed
- `documentIds` filter passed
- lexical fallback passed
- update document passed
- delete cascade passed
- cleanup ok

Local app/API smoke:

- fresh local PostgreSQL with the same two migrations
- production `next start` on `127.0.0.1:34022`
- ran:

```bash
APP_DATABASE_URL=... DATABASE_PROVIDER=postgres APP_DATABASE_SSL=disable \
  node app/scripts/check-domestic-knowledge-repository-smoke.mjs \
  --base-url http://127.0.0.1:34022
```

Result:

- `status=ok`
- login `303`
- merchant memory create/list/patch/retry/delete: `201 / 200 / 200 / 200 / 200`
- created chunk count `1`
- latest job status `succeeded`
- API-created document appeared in list
- delete persisted
- cleanup ok

## Singapore Validation

Live baseline:

- `GET http://43.160.208.189/api/health`: passed, `ok=true`, DB provider `postgres`, COS configured.
- `jingjing-selfhost-app` app preflight passed:
  - database URL present
  - required tables present
  - COS env present
  - `DATABASE_PROVIDER=postgres`
  - video-chain test entrypoint enabled

Branch-specific temporary app:

- Created isolated temp release from current live container.
- Overwrote the temp release `src/` and `scripts/` with this branch's current app source and scripts.
- Rebuilt the temp app inside `node:22-bookworm-slim`.
- Started temp container on `127.0.0.1:34023`.
- Live app was not replaced.

Temp app validation:

- `GET http://127.0.0.1:34023/api/health`: passed.
- `node scripts/check-domestic-app-env.mjs --require-video-chain-test-entrypoint`: passed.
- `node scripts/check-domestic-knowledge-repository-smoke.mjs --base-url http://127.0.0.1:34023`: passed.

Singapore knowledge smoke result:

- `status=ok`
- required tables present
- `embeddingJsonColumnPresent=true`
- `vectorColumnPresent=false`
- direct DB checks passed
- API login `303`
- API create/list/patch/retry/delete: `201 / 200 / 200 / 200 / 200`
- created API document had `chunkCount=1`
- latest job status `succeeded`
- delete persisted
- cleanup ok

Existing non-regression:

- `node scripts/check-domestic-consultation-strategy-smoke.mjs --base-url http://127.0.0.1:34023`: passed.
- Result:
  - strategy asset upserted
  - direct consultation session/message/event/update/list/detail/delete cascade passed
  - API login `303`
  - API create/list/detail/delete: `201 / 200 / 200 / 204`
  - cleanup ok

Cleanup verification:

- temporary container removed.
- temporary release directory removed.
- uploaded temp source archive removed.
- follow-up SQL counts:
  - knowledge smoke users: `0`
  - consultation smoke users: `0`
  - knowledge smoke documents: `0`

## Notes

- A local app/API smoke attempt failed before validation because the shell variable name `status` is read-only in zsh; reran the same command under bash and passed.
- A Singapore wrapper command failed after both smokes passed because of a shell quoting issue while printing cleanup counts; cleanup was verified in a separate command and all counts were `0`.
