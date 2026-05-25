# 2026-05-23 Phase 2C Knowledge Repository Supabase Fallback Removal

## Scope

本批只处理 Phase 2C 第一小批：

- `app/src/lib/db/knowledge-repository.ts`
- `app/src/lib/db/knowledge-repository-phase-2c-contract.test.mjs`

未触碰 `platform-admin-repository.ts`、`agent-console-repository.ts`、`merchant-media-repository.ts`、`consultation-repository.ts`、`import-repository.ts`、`content-generation-repository.ts`、`voice-profile-repository.ts`、storage provider、worker、package / lockfile，也未纳入既有 untracked inventory 文档。

## Runtime Changes

### Removed Supabase fallback

- 删除 `createSupabaseAdminClient` / `isSupabaseAdminConfigured` import。
- 删除 `@/lib/supabase/admin` 依赖。
- 删除 `knowledge_documents` 的 Supabase `.from()` list/get/create/update/delete fallback branches。
- 删除 `knowledge_ingestion_jobs` 的 Supabase `.from()` create/update/latest-job fallback branches。
- 删除 `knowledge_chunks` 的 Supabase `.from()` replace/list/search/count fallback branches。
- 删除 `supabase.rpc("match_knowledge_chunks", ...)` vector fallback。

### PostgreSQL app DB path

- `listKnowledgeDocuments()` 直接查询 `public.knowledge_documents`，保留 `scope`、`merchantId`、`limit` 过滤。
- `getKnowledgeDocumentById()` 直接查询 `public.knowledge_documents`，并继续通过 `attachKnowledgeDocumentStats()` 附加 stats。
- `createKnowledgeDocument()` / `updateKnowledgeDocument()` / `deleteKnowledgeDocument()` 直接走 PostgreSQL app DB。
- `createKnowledgeIngestionJob()` / `updateKnowledgeIngestionJob()` 直接走 `public.knowledge_ingestion_jobs`。
- `replaceKnowledgeChunks()` 继续使用 `withAppDbTransaction()`：先 `delete from public.knowledge_chunks where document_id = $1`，再按 `chunk_index` 插入新 chunks，并继续写 `embedding_json`。
- `listKnowledgeChunksByDocumentId()` 继续按 `chunk_index asc` 排序。
- `searchKnowledgeChunks()` 不再调用 Supabase vector RPC；保留当前 PostgreSQL text scoring：读取 `public.knowledge_chunks`，用 `scoreText()` 和 `rankKnowledgeMatches()` 排序。
- `attachKnowledgeDocumentStats()` 非 demo 路径直接走 PostgreSQL：
  - `countKnowledgeChunksByDocumentIds()` 使用 `count(*)::text as count`
  - `listLatestKnowledgeJobsByDocumentIds()` 使用 `distinct on (document_id)`

### Removed fallback-only vector/RPC helpers

删除不再使用的 fallback-only 类型 / helper：

- `KnowledgeVectorMatchRow`
- `toPgVector()`
- `shouldUseAppPostgres()`
- `shouldUseDemoFallback()`

本批没有新增 pgvector 逻辑，也没有改写搜索算法；只是删除旧 Supabase RPC fallback。

### Local demo fallback

保留纯 local demo fallback，但条件改为显式 `isLocalDemoRuntime()`：

- 本地 demo 仍使用内存 `demoKnowledgeDocuments`、`demoKnowledgeChunks`、`demoKnowledgeJobs`。
- 不再依赖 `isSupabaseAdminConfigured()` 或任何 Supabase 配置判断。
- 非 local demo 环境下直接走 app PostgreSQL，未配置时由 `queryAppDb()` / `withAppDbTransaction()` 抛当前 app database 口径错误。

## Tests

新增源码契约测试：

- `app/src/lib/db/knowledge-repository-phase-2c-contract.test.mjs`

契约覆盖：

- repository source 不再包含 `createSupabaseAdminClient`、`isSupabaseAdminConfigured`、`@/lib/supabase`、`supabase`、`Supabase`、`.from("knowledge_documents")`、`.from("knowledge_chunks")`、`.from("knowledge_ingestion_jobs")`、`.rpc("match_knowledge_chunks"`。
- 10 个公开函数仍存在。
- documents / jobs / chunks 仍使用 `queryAppDb`、`withAppDbTransaction` 和 `public.knowledge_*` 表。
- `replaceKnowledgeChunks()` 仍 transaction 删除旧 chunks、插入新 chunks、写 `embedding_json`。
- `searchKnowledgeChunks()` 仍使用 `scoreText()` / `rankKnowledgeMatches()`。
- stats helper 仍包含 chunk count 和 latest job 两条 PostgreSQL path。
- local demo fallback 只由 `isLocalDemoRuntime()` 控制。

## Verification

已通过：

```bash
cd app && node --test src/lib/db/knowledge-repository-phase-2c-contract.test.mjs
```

结果：8 tests passed。

```bash
cd app && npm run lint -- src/lib/db/knowledge-repository.ts src/lib/db/knowledge-repository-phase-2c-contract.test.mjs
```

结果：通过。

```bash
cd app && npm run typecheck -- --pretty false
```

结果：通过。

```bash
rg -n -S "createSupabaseAdminClient|isSupabaseAdminConfigured|@/lib/supabase|supabase|Supabase|\.from\(\"knowledge_documents\"\)|\.from\(\"knowledge_chunks\"\)|\.from\(\"knowledge_ingestion_jobs\"\)|\.rpc\(\"match_knowledge_chunks\"" app/src/lib/db/knowledge-repository.ts
```

结果：无命中。

```bash
git diff --check
```

结果：通过。

## Retained / Not Touched

- 保留 local demo 内存 fallback，条件是 `isLocalDemoRuntime()`。
- 未处理 platform-admin / agent-console，它们仍留到后续独立批次。
- 未处理 merchant-media / consultation / import / content-generation / voice-profile。
- 未处理 storage provider、worker、Supabase package/client shims。
- 未 push，未部署。
