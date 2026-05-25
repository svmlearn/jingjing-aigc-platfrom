#!/usr/bin/env node

import { pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const requiredTables = [
  "app_users",
  "merchant_profiles",
  "merchant_team_members",
  "knowledge_documents",
  "knowledge_chunks",
  "knowledge_ingestion_jobs",
];
const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;

loadEnvFileFromArgs();

const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const email =
  getArgValue("--email") ||
  process.env.DOMESTIC_KNOWLEDGE_SMOKE_EMAIL ||
  `knowledge-repository-smoke-${Date.now()}@example.test`;
const password =
  getArgValue("--password") ||
  process.env.DOMESTIC_KNOWLEDGE_SMOKE_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;
const keepFixture = hasFlag("--keep-fixture");

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: requiredTables,
    pgvectorRequired: false,
    embeddingJsonColumnPresent: false,
    vectorColumnPresent: false,
  },
  checks: {},
  http: baseUrl ? { baseUrl } : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

let pool = null;
let fixture = null;
const directDocumentIds = [];
let apiDocumentId = null;
let exitCode = databaseUrl.value ? 1 : 2;

if (!databaseUrl.value) {
  report.status = "missing_input";
  report.missing = ["databaseUrl"];
  report.acceptedSources = {
    databaseUrl: ["APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL"],
  };
  writeReport(report, exitCode);
}

try {
  pool = new Pool({
    connectionString: databaseUrl.value,
    ssl: resolveSslConfig(),
    max: 1,
  });

  await pool.query("select 1");
  report.database.connected = true;

  const tableCheck = await checkRequiredTables(pool);
  report.database.requiredTablesPresent = tableCheck.missingTables.length === 0;
  report.database.missingTables = tableCheck.missingTables;

  const columns = await inspectKnowledgeChunkColumns(pool);
  report.database.embeddingJsonColumnPresent = columns.embeddingJsonColumnPresent;
  report.database.vectorColumnPresent = columns.vectorColumnPresent;

  if (tableCheck.missingTables.length > 0) {
    throw new Error(`Missing required tables: ${tableCheck.missingTables.join(", ")}`);
  }

  if (!columns.embeddingJsonColumnPresent) {
    throw new Error("knowledge_chunks.embedding_json is required for this smoke.");
  }

  fixture = await createFixture(pool, {
    email,
    password,
  });
  report.checks.fixtureCreated = Boolean(fixture.userId && fixture.merchantId);

  const platformDoc = await createKnowledgeDocument(pool, {
    scope: "platform",
    merchantId: null,
    title: "Batch 3 Platform Methodology",
    sourceName: "platform-batch3.md",
    status: "indexed",
    metadata: {
      seedKey: `knowledge-smoke-platform-${Date.now()}`,
      sourceType: "seed",
      nested: { roundTrip: true },
    },
  });
  directDocumentIds.push(platformDoc.id);

  const filteredPlatformDoc = await createKnowledgeDocument(pool, {
    scope: "platform",
    merchantId: null,
    title: "Batch 3 Filter Control",
    sourceName: "platform-filter-control.md",
    status: "indexed",
    metadata: {
      seedKey: `knowledge-smoke-filter-${Date.now()}`,
      sourceType: "seed",
    },
  });
  directDocumentIds.push(filteredPlatformDoc.id);

  const merchantDoc = await createKnowledgeDocument(pool, {
    scope: "merchant",
    merchantId: fixture.merchantId,
    title: "Batch 3 Merchant Memory",
    sourceName: "merchant-batch3.txt",
    status: "indexed",
    metadata: {
      sourceType: "memory",
      contentKind: "merchant_memory",
      nested: { merchant: true },
    },
    createdByUserId: fixture.userId,
  });
  directDocumentIds.push(merchantDoc.id);

  const job = await createKnowledgeJob(pool, {
    documentId: merchantDoc.id,
    merchantId: fixture.merchantId,
  });
  const updatedJob = await updateKnowledgeJob(pool, job.id);
  report.checks.jobCreateUpdate =
    job.status === "processing" &&
    updatedJob.status === "succeeded" &&
    updatedJob.log_payload?.nested?.roundTrip === true;

  await replaceKnowledgeChunks(pool, {
    documentId: platformDoc.id,
    chunks: [
      {
        chunkIndex: 0,
        content: "codex-platform-batch-three 静境方法论 ordinary PostgreSQL lexical fallback",
        tokenCount: 9,
        metadata: { source: "platform", nested: { chunk: 0 } },
        embedding: [0.11, 0.22, 0.33],
      },
      {
        chunkIndex: 1,
        content: "platform deterministic fallback chunk",
        tokenCount: 4,
        metadata: { source: "platform", nested: { chunk: 1 } },
        embedding: null,
      },
    ],
  });
  await replaceKnowledgeChunks(pool, {
    documentId: filteredPlatformDoc.id,
    chunks: [
      {
        chunkIndex: 0,
        content: "filter-control platform document",
        tokenCount: 3,
        metadata: { source: "platform-filter" },
        embedding: null,
      },
    ],
  });
  await replaceKnowledgeChunks(pool, {
    documentId: merchantDoc.id,
    chunks: [
      {
        chunkIndex: 0,
        content: "烟火气 小红书 客户画像 merchant lexical memory",
        tokenCount: 7,
        metadata: { source: "merchant", nested: { chunk: 0 } },
        embedding: [0.44, 0.55],
      },
    ],
  });

  const platformChunks = await listChunks(pool, platformDoc.id);
  const merchantChunks = await listChunks(pool, merchantDoc.id);
  report.checks.embeddingJsonStored =
    Array.isArray(platformChunks[0]?.embedding_json) &&
    platformChunks[0].embedding_json.length === 3 &&
    Array.isArray(merchantChunks[0]?.embedding_json) &&
    merchantChunks[0].embedding_json.length === 2;
  report.checks.listChunksByDocument =
    platformChunks.length === 2 &&
    merchantChunks.length === 1 &&
    platformChunks[0].metadata?.nested?.chunk === 0;

  const documents = await listDocumentsWithStats(pool, fixture.merchantId);
  const platformStats = documents.find((document) => document.id === platformDoc.id);
  const merchantStats = documents.find((document) => document.id === merchantDoc.id);
  report.checks.documentStats =
    platformStats?.chunkCount === 2 &&
    merchantStats?.chunkCount === 1 &&
    merchantStats?.latestJob?.status === "succeeded";

  const fetchedDocument = await getKnowledgeDocument(pool, merchantDoc.id);
  report.checks.getDocumentById =
    fetchedDocument?.metadata?.nested?.merchant === true &&
    fetchedDocument?.scope === "merchant";

  const platformSearch = await lexicalSearch(pool, {
    merchantId: fixture.merchantId,
    query: "codex-platform-batch-three",
    limit: 5,
  });
  const merchantSearch = await lexicalSearch(pool, {
    merchantId: fixture.merchantId,
    query: "烟火气 小红书",
    limit: 5,
  });
  const filteredSearch = await lexicalSearch(pool, {
    merchantId: fixture.merchantId,
    query: "codex-platform-batch-three",
    limit: 5,
    documentIds: [filteredPlatformDoc.id],
  });
  const fallbackSearch = await lexicalSearch(pool, {
    merchantId: fixture.merchantId,
    query: "zzzz-no-positive-match",
    limit: 2,
  });

  report.checks.lexicalPlatformSearch =
    platformSearch[0]?.documentId === platformDoc.id &&
    platformSearch[0]?.score > 0;
  report.checks.lexicalMerchantSearch =
    merchantSearch[0]?.documentId === merchantDoc.id &&
    merchantSearch[0]?.score > 0;
  report.checks.documentIdsFilter =
    !filteredSearch.some((match) => match.documentId === platformDoc.id) &&
    filteredSearch.every(
      (match) => match.scope !== "platform" || match.documentId === filteredPlatformDoc.id,
    );
  report.checks.lexicalFallback = fallbackSearch.length === 2;

  const updatedDocument = await updateKnowledgeDocument(pool, {
    documentId: merchantDoc.id,
  });
  report.checks.updateDocument =
    updatedDocument?.title === "Batch 3 Merchant Memory Updated" &&
    updatedDocument?.metadata?.updated === true;

  await deleteKnowledgeDocument(pool, merchantDoc.id);
  directDocumentIds.splice(directDocumentIds.indexOf(merchantDoc.id), 1);
  report.checks.deleteCascade = await verifyDeleteCascade(pool, {
    documentId: merchantDoc.id,
    chunkId: merchantChunks[0].id,
    jobId: job.id,
  });

  if (baseUrl) {
    const login = await signIn({ baseUrl, email, password });
    report.http.loginStatus = login.status;
    report.http.cookiePresent = Boolean(login.cookie);

    const apiCreate = await postForm({
      baseUrl,
      path: "/api/merchant-knowledge/documents",
      cookie: login.cookie,
      fields: {
        action: "memory",
        title: "Batch 3 API Memory",
        textContent: "API 知识库 词法检索 烟火气 客户画像",
      },
    });
    apiDocumentId = apiCreate.body?.document?.id ?? null;
    const apiList = await getJson({
      baseUrl,
      path: "/api/merchant-knowledge/documents",
      cookie: login.cookie,
    });
    const apiPatch = apiDocumentId
      ? await patchJson({
          baseUrl,
          path: `/api/merchant-knowledge/documents/${apiDocumentId}`,
          cookie: login.cookie,
          body: {
            title: "Batch 3 API Memory Updated",
            textContent: "API 更新后 知识库 lexical fallback",
          },
        })
      : { status: 0, body: null };
    const apiRetry = apiDocumentId
      ? await postJson({
          baseUrl,
          path: `/api/merchant-knowledge/documents/${apiDocumentId}/retry`,
          cookie: login.cookie,
          body: {},
        })
      : { status: 0, body: null };
    const apiDelete = apiDocumentId
      ? await deleteRequest({
          baseUrl,
          path: `/api/merchant-knowledge/documents/${apiDocumentId}`,
          cookie: login.cookie,
        })
      : { status: 0, body: null };

    report.http.createStatus = apiCreate.status;
    report.http.listStatus = apiList.status;
    report.http.patchStatus = apiPatch.status;
    report.http.retryStatus = apiRetry.status;
    report.http.deleteStatus = apiDelete.status;
    report.http.createdChunkCount = apiCreate.body?.document?.chunkCount ?? null;
    report.http.createdLatestJobStatus = apiCreate.body?.document?.latestJob?.status ?? null;
    report.http.listIncludesApiDocument = Array.isArray(apiList.body?.documents)
      ? apiList.body.documents.some((document) => document.id === apiDocumentId)
      : false;
    report.http.patchTitle = apiPatch.body?.document?.title ?? null;
    report.http.retryLatestJobStatus = apiRetry.body?.document?.latestJob?.status ?? null;

    if (apiDelete.status === 200) {
      report.http.deletePersisted = !(await knowledgeDocumentExists(pool, apiDocumentId));
      apiDocumentId = null;
    }
  }

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.database.embeddingJsonColumnPresent === true &&
    report.checks.fixtureCreated === true &&
    report.checks.jobCreateUpdate === true &&
    report.checks.embeddingJsonStored === true &&
    report.checks.listChunksByDocument === true &&
    report.checks.documentStats === true &&
    report.checks.getDocumentById === true &&
    report.checks.lexicalPlatformSearch === true &&
    report.checks.lexicalMerchantSearch === true &&
    report.checks.documentIdsFilter === true &&
    report.checks.lexicalFallback === true &&
    report.checks.updateDocument === true &&
    report.checks.deleteCascade === true &&
    (
      !baseUrl ||
      (
        report.http.loginStatus === 303 &&
        report.http.cookiePresent === true &&
        report.http.createStatus === 201 &&
        report.http.listStatus === 200 &&
        report.http.patchStatus === 200 &&
        report.http.retryStatus === 200 &&
        report.http.deleteStatus === 200 &&
        report.http.createdChunkCount >= 1 &&
        report.http.createdLatestJobStatus === "succeeded" &&
        report.http.listIncludesApiDocument === true &&
        report.http.patchTitle === "Batch 3 API Memory Updated" &&
        report.http.retryLatestJobStatus === "succeeded" &&
        report.http.deletePersisted === true
      )
    );

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message = error instanceof Error ? error.message : "Knowledge repository smoke failed.";
  exitCode = 1;
} finally {
  if (pool && !keepFixture) {
    report.cleanup = await cleanupSmokeData(pool, {
      fixture,
      documentIds: directDocumentIds,
      apiDocumentId,
    });
  } else if (keepFixture) {
    report.cleanup = { skipped: true, reason: "keep_fixture" };
  }

  if (pool) {
    await pool.end().catch(() => undefined);
  }

  writeReport(report, exitCode);
}

async function checkRequiredTables(pool) {
  const result = await pool.query(
    `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any($1)
    order by table_name
    `,
    [requiredTables],
  );
  const presentTables = result.rows.map((row) => row.table_name);

  return {
    presentTables,
    missingTables: requiredTables.filter((table) => !presentTables.includes(table)),
  };
}

async function inspectKnowledgeChunkColumns(pool) {
  const result = await pool.query(
    `
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_chunks'
      and column_name in ('embedding_json', 'embedding')
    `,
  );
  const columns = new Set(result.rows.map((row) => row.column_name));

  return {
    embeddingJsonColumnPresent: columns.has("embedding_json"),
    vectorColumnPresent: columns.has("embedding"),
  };
}

async function createFixture(pool, input) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    const userResult = await client.query(
      `
      insert into public.app_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, 'Knowledge Smoke Owner', 'merchant_owner', 'active')
      returning id
      `,
      [input.email.trim().toLowerCase(), createPasswordHash(input.password)],
    );
    const userId = userResult.rows[0].id;
    const merchantResult = await client.query(
      `
      insert into public.merchant_profiles (
        owner_user_id,
        name,
        industry,
        contact_name,
        status,
        plan
      ) values ($1, 'Knowledge Smoke Merchant', 'domestic_validation', 'Knowledge Smoke Owner', 'active', 'free')
      returning id
      `,
      [userId],
    );
    const merchantId = merchantResult.rows[0].id;
    const memberResult = await client.query(
      `
      insert into public.merchant_team_members (
        merchant_id,
        user_id,
        role,
        status,
        display_name,
        invited_by_user_id
      ) values ($1, $2, 'owner', 'active', 'Knowledge Smoke Owner', $2)
      returning id
      `,
      [merchantId, userId],
    );

    await client.query("commit");

    return {
      userId,
      merchantId,
      teamMemberId: memberResult.rows[0].id,
      email: input.email.trim().toLowerCase(),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createKnowledgeDocument(pool, input) {
  const result = await pool.query(
    `
    insert into public.knowledge_documents (
      scope,
      merchant_id,
      title,
      source_name,
      storage_provider,
      mime_type,
      status,
      summary_text,
      metadata,
      created_by_user_id
    ) values ($1, $2, $3, $4, 'inline_seed', 'text/plain; charset=utf-8', $5, $6, $7::jsonb, $8)
    returning id, scope, merchant_id, title, metadata
    `,
    [
      input.scope,
      input.merchantId,
      input.title,
      input.sourceName,
      input.status,
      `Summary for ${input.title}`,
      JSON.stringify(input.metadata ?? {}),
      input.createdByUserId ?? null,
    ],
  );

  return result.rows[0];
}

async function updateKnowledgeDocument(pool, input) {
  const result = await pool.query(
    `
    update public.knowledge_documents
    set title = 'Batch 3 Merchant Memory Updated',
        summary_text = 'Updated summary',
        metadata = $2::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
    returning id, title, metadata
    `,
    [
      input.documentId,
      JSON.stringify({
        updated: true,
        nested: { updateRoundTrip: true },
      }),
    ],
  );

  return result.rows[0] ?? null;
}

async function deleteKnowledgeDocument(pool, documentId) {
  await pool.query("delete from public.knowledge_documents where id = $1", [documentId]);
}

async function createKnowledgeJob(pool, input) {
  const result = await pool.query(
    `
    insert into public.knowledge_ingestion_jobs (
      document_id,
      merchant_id,
      status,
      input_payload,
      log_payload
    ) values ($1, $2, 'processing', $3::jsonb, $4::jsonb)
    returning id, status, input_payload, log_payload
    `,
    [
      input.documentId,
      input.merchantId,
      JSON.stringify({
        reason: "smoke",
        nested: { input: true },
      }),
      JSON.stringify({ started: true }),
    ],
  );

  return result.rows[0];
}

async function updateKnowledgeJob(pool, jobId) {
  const result = await pool.query(
    `
    update public.knowledge_ingestion_jobs
    set status = 'succeeded',
        log_payload = $2::jsonb,
        finished_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = $1
    returning id, status, input_payload, log_payload, finished_at
    `,
    [
      jobId,
      JSON.stringify({
        chunkCount: 1,
        nested: { roundTrip: true },
      }),
    ],
  );

  return result.rows[0];
}

async function replaceKnowledgeChunks(pool, input) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("delete from public.knowledge_chunks where document_id = $1", [
      input.documentId,
    ]);
    for (const chunk of input.chunks) {
      await client.query(
        `
        insert into public.knowledge_chunks (
          document_id,
          chunk_index,
          content,
          token_count,
          metadata,
          embedding_dimensions,
          embedding_json
        ) values ($1, $2, $3, $4, $5::jsonb, $6, $7::double precision[])
        `,
        [
          input.documentId,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          JSON.stringify(chunk.metadata ?? {}),
          chunk.embedding?.length ?? null,
          chunk.embedding ?? null,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function listChunks(pool, documentId) {
  const result = await pool.query(
    `
    select id, document_id, chunk_index, content, token_count, metadata, embedding_json
    from public.knowledge_chunks
    where document_id = $1
    order by chunk_index asc
    `,
    [documentId],
  );

  return result.rows;
}

async function listDocumentsWithStats(pool, merchantId) {
  const result = await pool.query(
    `
    select
      d.id,
      d.scope,
      d.merchant_id,
      d.title,
      d.metadata,
      (select count(*)::int from public.knowledge_chunks c where c.document_id = d.id) as chunk_count,
      (
        select jsonb_build_object(
          'id', j.id,
          'status', j.status,
          'logPayload', j.log_payload
        )
        from public.knowledge_ingestion_jobs j
        where j.document_id = d.id
        order by j.created_at desc
        limit 1
      ) as latest_job
    from public.knowledge_documents d
    where d.scope = 'platform'
       or d.merchant_id = $1
    order by d.created_at desc
    `,
    [merchantId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    merchantId: row.merchant_id,
    title: row.title,
    metadata: row.metadata,
    chunkCount: row.chunk_count,
    latestJob: row.latest_job,
  }));
}

async function getKnowledgeDocument(pool, documentId) {
  const result = await pool.query(
    `
    select id, scope, merchant_id, title, metadata
    from public.knowledge_documents
    where id = $1
    limit 1
    `,
    [documentId],
  );

  return result.rows[0] ?? null;
}

async function lexicalSearch(pool, input) {
  const requestedDocumentIds = input.documentIds ? new Set(input.documentIds) : null;
  const documentsResult = await pool.query(
    `
    select id, scope, merchant_id, title, source_name
    from public.knowledge_documents
    where status = 'indexed'
      and (
        scope = 'platform'
        or merchant_id = $1
      )
    order by created_at desc
    `,
    [input.merchantId],
  );
  const eligibleDocuments = documentsResult.rows.filter((document) =>
    document.scope === "platform"
      ? requestedDocumentIds === null || requestedDocumentIds.has(document.id)
      : document.merchant_id === input.merchantId,
  );

  if (eligibleDocuments.length === 0 || input.limit <= 0) {
    return [];
  }

  const documentIds = eligibleDocuments.map((document) => document.id);
  const documentById = new Map(eligibleDocuments.map((document) => [document.id, document]));
  const chunksResult = await pool.query(
    `
    select id, document_id, chunk_index, content, metadata
    from public.knowledge_chunks
    where document_id = any($1::uuid[])
    order by document_id, chunk_index asc
    limit 1000
    `,
    [documentIds],
  );
  const terms = buildSearchTerms(input.query);
  const matches = chunksResult.rows
    .map((chunk) => {
      const document = documentById.get(chunk.document_id);
      const contentScore = scoreText(chunk.content, terms);
      const titleScore = scoreText(document?.title ?? "", terms) * 0.5;

      return {
        chunkId: chunk.id,
        documentId: chunk.document_id,
        documentTitle: document?.title ?? "Unknown document",
        sourceName: document?.source_name ?? null,
        scope: document?.scope ?? "platform",
        merchantId: document?.merchant_id ?? null,
        content: chunk.content,
        score: contentScore + titleScore,
        chunkIndex: chunk.chunk_index,
        metadata: chunk.metadata ?? {},
      };
    })
    .sort((first, second) => second.score - first.score || first.chunkIndex - second.chunkIndex);
  const positiveMatches = matches.filter((match) => match.score > 0);

  return (positiveMatches.length > 0 ? positiveMatches : matches).slice(0, input.limit);
}

async function verifyDeleteCascade(pool, input) {
  const result = await pool.query(
    `
    select
      (select count(*)::int from public.knowledge_documents where id = $1) as documents,
      (select count(*)::int from public.knowledge_chunks where id = $2) as chunks,
      (select count(*)::int from public.knowledge_ingestion_jobs where id = $3) as jobs
    `,
    [input.documentId, input.chunkId, input.jobId],
  );
  const row = result.rows[0] ?? {};

  return row.documents === 0 && row.chunks === 0 && row.jobs === 0;
}

async function knowledgeDocumentExists(pool, documentId) {
  if (!documentId) {
    return false;
  }

  const result = await pool.query(
    "select 1 from public.knowledge_documents where id = $1 limit 1",
    [documentId],
  );

  return Boolean(result.rows[0]);
}

async function cleanupSmokeData(pool, input) {
  try {
    for (const documentId of [...input.documentIds, input.apiDocumentId].filter(Boolean)) {
      await pool.query("delete from public.knowledge_documents where id = $1", [documentId]);
    }

    if (input.fixture) {
      await pool.query("delete from public.knowledge_documents where merchant_id = $1", [
        input.fixture.merchantId,
      ]);
      await pool.query("delete from public.user_sessions where user_id = $1", [
        input.fixture.userId,
      ]);
      await pool.query("delete from public.merchant_team_members where merchant_id = $1", [
        input.fixture.merchantId,
      ]);
      await pool.query("delete from public.merchant_profiles where id = $1", [
        input.fixture.merchantId,
      ]);
      await pool.query("delete from public.app_users where id = $1", [input.fixture.userId]);
    }

    return {
      status: "ok",
      userId: input.fixture?.userId ?? null,
      merchantId: input.fixture?.merchantId ?? null,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Cleanup failed.",
    };
  }
}

async function signIn(input) {
  const form = new URLSearchParams();
  form.set("email", input.email);
  form.set("password", input.password);
  form.set("next", "/dashboard/settings");

  const response = await fetch(`${input.baseUrl}/api/auth/merchant-login`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const cookie = extractCookieHeader(response);

  return {
    status: response.status,
    cookie,
  };
}

async function getJson(input) {
  return requestJson({
    ...input,
    method: "GET",
  });
}

async function postJson(input) {
  return requestJson({
    ...input,
    method: "POST",
  });
}

async function patchJson(input) {
  return requestJson({
    ...input,
    method: "PATCH",
  });
}

async function postForm(input) {
  const form = new FormData();
  for (const [key, value] of Object.entries(input.fields)) {
    form.set(key, value);
  }

  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "POST",
    headers: {
      Cookie: input.cookie,
    },
    body: form,
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function deleteRequest(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "DELETE",
    headers: {
      Cookie: input.cookie,
    },
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function requestJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      Cookie: input.cookie,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function buildSearchTerms(query) {
  const normalized = normalizeText(query);
  const terms = new Set();

  if (normalized.length > 0 && normalized.length <= 80) {
    terms.add(normalized);
  }

  for (const term of normalized.split(/[\s,，。.!！?？;；:：、/\\|()[\]{}<>《》"'“”‘’]+/)) {
    if (term.length >= 2) {
      terms.add(term);
    }
  }

  for (const phrase of normalized.match(/\p{Script=Han}{2,}/gu) ?? []) {
    if (phrase.length <= 12) {
      terms.add(phrase);
    }

    for (let index = 0; index < phrase.length - 1; index += 1) {
      terms.add(phrase.slice(index, index + 2));
    }
  }

  return Array.from(terms).slice(0, 40);
}

function scoreText(text, terms) {
  if (terms.length === 0) {
    return 0;
  }

  const normalized = normalizeText(text);
  return terms.reduce((score, term) => score + countTermOccurrences(normalized, term), 0);
}

function countTermOccurrences(text, term) {
  if (!term) {
    return 0;
  }

  let count = 0;
  let offset = text.indexOf(term);

  while (offset !== -1) {
    count += 1;
    offset = text.indexOf(term, offset + term.length);
  }

  return count;
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = pbkdf2Sync(
    password,
    salt,
    passwordHashIterations,
    passwordHashKeyLength,
    "sha256",
  ).toString("base64url");

  return `${passwordHashAlgorithm}$${passwordHashIterations}$${salt}$${derived}`;
}

function extractCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.() ?? [];
  const rawCookies =
    getSetCookie.length > 0
      ? getSetCookie
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];

  return rawCookies
    .map((cookie) => cookie?.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function normalizeText(value) {
  return value.trim().toLowerCase();
}

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return { name, value };
    }
  }

  return { name: null, value: "" };
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/g, "");
}

function resolveSslConfig() {
  const raw =
    process.env.APP_DATABASE_SSL ?? process.env.DATABASE_SSL ?? process.env.LOCAL_REAL_CHAIN_DB_SSL;

  if (raw === "disable" || raw === "false") {
    return false;
  }

  if (raw === "require" || raw === "true") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function writeReport(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}
