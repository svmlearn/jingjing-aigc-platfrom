#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;
const requiredTables = [
  "import_jobs",
  "source_items",
  "imported_comments",
  "merchant_profiles",
  "app_users",
];
const supportingTables = ["user_sessions"];

loadEnvFileFromArgs();

const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const keepFixture = hasFlag("--keep-fixture");
const stamp = `${Date.now()}_${randomBytes(4).toString("hex")}`;
const sessionCookieName = process.env.APP_SESSION_COOKIE?.trim() || "jingjing_session";

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: [...requiredTables, ...supportingTables],
  },
  direct: {},
  http: baseUrl ? { baseUrl } : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

const cleanup = {
  commentIds: [],
  sourceItemIds: [],
  importJobIds: [],
  merchantIds: [],
  sessionIds: [],
  userIds: [],
};

let pool = null;
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
    max: 2,
  });

  await pool.query("select 1");
  report.database.connected = true;

  const tableCheck = await checkRequiredTables(pool);
  report.database.requiredTablesPresent = tableCheck.missingTables.length === 0;
  report.database.missingTables = tableCheck.missingTables;

  if (tableCheck.missingTables.length > 0) {
    throw new Error(`Missing required tables: ${tableCheck.missingTables.join(", ")}`);
  }

  const fixture = await createFixture(pool);
  report.direct = await runDirectLifecycle(pool, fixture);

  if (baseUrl) {
    report.http = await runHttpReadLifecycle(pool, fixture, {
      baseUrl,
      cookie: `${sessionCookieName}=${fixture.sessionToken}`,
    });
  }

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.direct.status === "ok" &&
    (!baseUrl || report.http.status === "ok");

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message =
    error instanceof Error ? error.message : "Import repository smoke failed.";
  exitCode = 1;
} finally {
  if (pool && !keepFixture) {
    report.cleanup = await cleanupSmokeData(pool);
  } else if (keepFixture) {
    report.cleanup = { skipped: true, reason: "keep_fixture" };
  }

  if (pool) {
    await pool.end().catch(() => undefined);
  }

  writeReport(report, exitCode);
}

async function runDirectLifecycle(pool, fixture) {
  const job = await createImportJob(pool, {
    merchantId: fixture.merchantId,
    platform: "xiaohongshu",
    importType: "detail",
    inputPayload: {
      url: `https://example.test/import/${stamp}`,
      options: {
        includeComments: true,
        maxItems: 3,
        maxComments: 5,
      },
    },
  });
  const crossMerchantJob = await createImportJob(pool, {
    merchantId: fixture.crossMerchantId,
    platform: "xiaohongshu",
    importType: "detail",
    inputPayload: {
      url: `https://example.test/import/cross-${stamp}`,
      options: {},
    },
  });
  const getJob = await getImportJob(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
  });
  const listBefore = await listImportJobs(pool, fixture.merchantId);

  await updateImportJob(pool, {
    jobId: job.id,
    status: "running",
    logPayload: {
      marker: "running",
      request: getJob.input_payload,
    },
  });
  await updateImportJob(pool, {
    jobId: crossMerchantJob.id,
    status: "running",
    logPayload: { marker: "cross-running" },
  });
  const runningCounts = await countRunningImportJobs(pool, fixture.merchantId);

  await updateImportJob(pool, {
    jobId: job.id,
    status: "succeeded",
    totalItems: 4,
    successItems: 3,
    errorSummary: null,
    logPayload: {
      sourceItemIds: [],
      commentCount: 0,
      nested: {
        ok: true,
      },
    },
    finished: true,
  });
  await updateImportJob(pool, {
    jobId: crossMerchantJob.id,
    status: "failed",
    totalItems: 0,
    successItems: 0,
    errorSummary: "cross merchant fixture",
    logPayload: { marker: "cross-failed" },
    finished: true,
  });
  const finishedJob = await getImportJob(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
  });
  const runningCountsAfterFinish = await countRunningImportJobs(pool, fixture.merchantId);

  const sourceExternalV1 = await upsertSourceItem(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
    platform: "xiaohongshu",
    sourceType: "detail",
    externalItemId: `note-${stamp}`,
    sourceUrl: `https://example.test/note/${stamp}`,
    creatorId: `creator-${stamp}`,
    creatorName: "Batch 6 Creator",
    title: "Batch 6 source v1",
    bodyText: "Body v1",
    scriptText: "Script v1",
    engagementSnapshot: { likes: 1, nested: { saved: true } },
    structureSummary: { hook: "v1" },
    tracePayload: { phase: "v1" },
  });
  const sourceExternalV2 = await upsertSourceItem(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
    platform: "xiaohongshu",
    sourceType: "detail",
    externalItemId: `note-${stamp}`,
    sourceUrl: `https://example.test/note/${stamp}`,
    creatorId: `creator-${stamp}`,
    creatorName: "Batch 6 Creator Updated",
    title: "Batch 6 source v2",
    bodyText: "Body v2",
    scriptText: "Script v2",
    engagementSnapshot: { likes: 9, nested: { saved: true } },
    structureSummary: { hook: "v2" },
    tracePayload: { phase: "v2" },
  });
  const sourceUrlV1 = await upsertSourceItem(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
    platform: "douyin",
    sourceType: "detail",
    externalItemId: null,
    sourceUrl: `https://example.test/source-url/${stamp}`,
    creatorId: null,
    creatorName: "URL Creator",
    title: "URL source v1",
    bodyText: "URL body v1",
    scriptText: null,
    engagementSnapshot: { likes: 2 },
    structureSummary: { route: "url-v1" },
    tracePayload: { phase: "url-v1" },
  });
  const sourceUrlV2 = await upsertSourceItem(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
    platform: "douyin",
    sourceType: "detail",
    externalItemId: null,
    sourceUrl: `https://example.test/source-url/${stamp}`,
    creatorId: null,
    creatorName: "URL Creator Updated",
    title: "URL source v2",
    bodyText: "URL body v2",
    scriptText: null,
    engagementSnapshot: { likes: 7 },
    structureSummary: { route: "url-v2" },
    tracePayload: { phase: "url-v2" },
  });
  const commentSource = await upsertSourceItem(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
    platform: "xiaohongshu",
    sourceType: "detail",
    externalItemId: null,
    sourceUrl: `https://example.test/comments/${stamp}`,
    creatorId: null,
    creatorName: null,
    title: null,
    bodyText: null,
    scriptText: null,
    engagementSnapshot: {},
    structureSummary: {},
    tracePayload: {
      createdFrom: "comments_import",
      url: `https://example.test/comments/${stamp}`,
    },
  });

  const commentExtV1 = await upsertImportedComment(pool, {
    sourceItemId: commentSource.id,
    externalCommentId: `comment-${stamp}`,
    parentExternalCommentId: null,
    authorName: "Comment Author",
    content: "comment v1",
    likeCount: 1,
    replyCount: 0,
    publishedAt: "2026-05-17T00:00:00.000Z",
    tracePayload: { phase: "comment-v1" },
  });
  const commentExtV2 = await upsertImportedComment(pool, {
    sourceItemId: commentSource.id,
    externalCommentId: `comment-${stamp}`,
    parentExternalCommentId: null,
    authorName: "Comment Author Updated",
    content: "comment v2",
    likeCount: 8,
    replyCount: 2,
    publishedAt: "2026-05-17T00:01:00.000Z",
    tracePayload: { phase: "comment-v2" },
  });
  const commentNoExternalA = await insertImportedComment(pool, {
    sourceItemId: commentSource.id,
    externalCommentId: null,
    parentExternalCommentId: null,
    authorName: "Anonymous A",
    content: "no external A",
    likeCount: 3,
    replyCount: 0,
    publishedAt: null,
    tracePayload: { phase: "no-external-a" },
  });
  const commentNoExternalB = await insertImportedComment(pool, {
    sourceItemId: commentSource.id,
    externalCommentId: null,
    parentExternalCommentId: null,
    authorName: "Anonymous B",
    content: "no external B",
    likeCount: 0,
    replyCount: 5,
    publishedAt: null,
    tracePayload: { phase: "no-external-b" },
  });

  await updateImportJob(pool, {
    jobId: job.id,
    logPayload: {
      sourceItemIds: [sourceExternalV2.id, sourceUrlV2.id, commentSource.id],
      commentCount: 3,
      nested: {
        ok: true,
      },
    },
  });

  const finalJob = await getImportJob(pool, {
    merchantId: fixture.merchantId,
    jobId: job.id,
  });
  const sourceItems = await listSourceItems(pool, fixture.merchantId);
  const sourceDetail = await getSourceItem(pool, {
    merchantId: fixture.merchantId,
    sourceItemId: sourceExternalV2.id,
  });
  const comments = await listImportedComments(pool, commentSource.id);
  const crossMerchantSourceVisible = await sourceItemExistsForMerchant(pool, {
    merchantId: fixture.crossMerchantId,
    sourceItemId: sourceExternalV2.id,
  });
  const traceRoundTrip = await getTracePayload(pool, sourceExternalV2.id);

  const checks = {
    importJobCreateGetList:
      Boolean(getJob?.id) &&
      listBefore.some((item) => item.id === job.id) &&
      listBefore.every((item) => item.merchant_id === fixture.merchantId),
    runningCounts:
      runningCounts.merchantRunning === 1 &&
      runningCounts.globalRunning >= 2 &&
      runningCountsAfterFinish.merchantRunning === 0,
    importJobFinishedUpdate:
      finishedJob.status === "succeeded" &&
      finishedJob.total_items === 4 &&
      finishedJob.success_items === 3 &&
      Boolean(finishedJob.finished_at),
    sourceExternalDedupe:
      sourceExternalV1.id === sourceExternalV2.id &&
      sourceDetail.title === "Batch 6 source v2" &&
      sourceDetail.engagement_snapshot?.likes === 9,
    sourceUrlDedupe:
      sourceUrlV1.id === sourceUrlV2.id &&
      sourceUrlV2.title === "URL source v2",
    ensureCommentSource:
      commentSource.source_url === `https://example.test/comments/${stamp}` &&
      Boolean(commentSource.structure_summary) &&
      Boolean(commentSource.engagement_snapshot),
    commentExternalDedupe:
      commentExtV1.id === commentExtV2.id &&
      comments.some((item) => item.id === commentExtV2.id && item.content === "comment v2"),
    commentsWithoutExternalDistinct:
      commentNoExternalA.id !== commentNoExternalB.id &&
      comments.some((item) => item.id === commentNoExternalA.id) &&
      comments.some((item) => item.id === commentNoExternalB.id),
    listAndDetail:
      sourceItems.some((item) => item.id === sourceExternalV2.id) &&
      sourceItems.some((item) => item.id === sourceUrlV2.id) &&
      sourceDetail.id === sourceExternalV2.id,
    commentsOrdered:
      comments.length >= 3 &&
      comments[0]?.id === commentExtV2.id,
    merchantScoping: crossMerchantSourceVisible === false,
    jsonRoundTrip:
      finalJob.log_payload?.nested?.ok === true &&
      sourceDetail.structure_summary?.hook === "v2" &&
      traceRoundTrip?.phase === "v2",
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function runHttpReadLifecycle(pool, fixture, input) {
  const sourceItems = await getJson({
    baseUrl: input.baseUrl,
    path: "/api/source-items?limit=20",
    cookie: input.cookie,
  });
  const sourceItemId = sourceItems.body?.sourceItems?.find((item) =>
    item.sourceUrl?.includes(`/comments/${stamp}`),
  )?.id;
  const sourceDetail = sourceItemId
    ? await getJson({
        baseUrl: input.baseUrl,
        path: `/api/source-items/${sourceItemId}`,
        cookie: input.cookie,
      })
    : { status: 0, body: null };
  const comments = sourceItemId
    ? await getJson({
        baseUrl: input.baseUrl,
        path: `/api/source-items/${sourceItemId}/comments?limit=10`,
        cookie: input.cookie,
      })
    : { status: 0, body: null };
  const importJobs = await getJson({
    baseUrl: input.baseUrl,
    path: "/api/import-jobs",
    cookie: input.cookie,
  });
  const importJobId = importJobs.body?.importJobs?.find((item) =>
    item.inputUrl?.includes(`/import/${stamp}`),
  )?.id;
  const importJobDetail = importJobId
    ? await getJson({
        baseUrl: input.baseUrl,
        path: `/api/import-jobs/${importJobId}`,
        cookie: input.cookie,
      })
    : { status: 0, body: null };
  const crossSession = await createUserSession(pool, fixture.crossUserId);
  const crossSourceDetail = sourceItemId
    ? await getJson({
        baseUrl: input.baseUrl,
        path: `/api/source-items/${sourceItemId}`,
        cookie: `${sessionCookieName}=${crossSession.token}`,
      })
    : { status: 0, body: null };

  const checks = {
    sourceItemsList:
      sourceItems.status === 200 &&
      Array.isArray(sourceItems.body?.sourceItems) &&
      Boolean(sourceItemId),
    sourceItemDetail:
      sourceDetail.status === 200 &&
      sourceDetail.body?.sourceItem?.id === sourceItemId,
    commentsList:
      comments.status === 200 &&
      Array.isArray(comments.body?.comments) &&
      comments.body.comments[0]?.content === "comment v2",
    importJobsList:
      importJobs.status === 200 &&
      Array.isArray(importJobs.body?.importJobs) &&
      Boolean(importJobId),
    importJobDetail:
      importJobDetail.status === 200 &&
      importJobDetail.body?.job?.id === importJobId &&
      importJobDetail.body?.job?.status === "succeeded",
    merchantScoping: crossSourceDetail.status === 404,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function createFixture(pool) {
  const owner = await createUser(pool, {
    email: `import-smoke-owner-${stamp}@example.test`,
    displayName: "Import Smoke Owner",
  });
  const crossOwner = await createUser(pool, {
    email: `import-smoke-cross-${stamp}@example.test`,
    displayName: "Import Smoke Cross Owner",
  });
  const merchant = await createMerchant(pool, {
    ownerUserId: owner.id,
    name: `Import Smoke Merchant ${stamp}`,
  });
  const crossMerchant = await createMerchant(pool, {
    ownerUserId: crossOwner.id,
    name: `Import Smoke Cross Merchant ${stamp}`,
  });
  const session = await createUserSession(pool, owner.id);

  return {
    userId: owner.id,
    crossUserId: crossOwner.id,
    merchantId: merchant.id,
    crossMerchantId: crossMerchant.id,
    sessionToken: session.token,
  };
}

async function createUser(pool, input) {
  const result = await pool.query(
    `
    insert into public.app_users (
      email,
      password_hash,
      display_name,
      role,
      status
    ) values ($1, $2, $3, 'merchant_owner', 'active')
    returning id
    `,
    [
      input.email,
      createPasswordHash(`smoke-${randomBytes(12).toString("base64url")}`),
      input.displayName,
    ],
  );
  const user = result.rows[0];
  cleanup.userIds.push(user.id);
  return user;
}

async function createUserSession(pool, userId) {
  const token = randomBytes(32).toString("base64url");
  const result = await pool.query(
    `
    insert into public.user_sessions (
      user_id,
      token_hash,
      expires_at
    ) values ($1, $2, timezone('utc', now()) + interval '1 hour')
    returning id
    `,
    [userId, hashSessionToken(token)],
  );
  const session = { id: result.rows[0].id, token };
  cleanup.sessionIds.push(session.id);
  return session;
}

async function createMerchant(pool, input) {
  const result = await pool.query(
    `
    insert into public.merchant_profiles (
      owner_user_id,
      name,
      industry,
      service_items,
      default_cta,
      forbidden_words,
      status,
      plan
    ) values ($1, $2, 'smoke', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', 'free')
    returning id
    `,
    [input.ownerUserId, input.name],
  );
  const merchant = result.rows[0];
  cleanup.merchantIds.push(merchant.id);
  return merchant;
}

async function createImportJob(pool, input) {
  const result = await pool.query(
    `
    insert into public.import_jobs (
      merchant_id,
      platform,
      import_type,
      input_payload
    ) values ($1, $2, $3, $4::jsonb)
    returning *
    `,
    [
      input.merchantId,
      input.platform,
      input.importType,
      JSON.stringify(input.inputPayload),
    ],
  );
  const job = result.rows[0];
  cleanup.importJobIds.push(job.id);
  return job;
}

async function getImportJob(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.import_jobs
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [input.jobId, input.merchantId],
  );
  return result.rows[0] ?? null;
}

async function listImportJobs(pool, merchantId) {
  const result = await pool.query(
    `
    select *
    from public.import_jobs
    where merchant_id = $1
    order by created_at desc
    limit 50
    `,
    [merchantId],
  );
  return result.rows;
}

async function updateImportJob(pool, input) {
  const result = await pool.query(
    `
    update public.import_jobs
    set status = coalesce($2, status),
        total_items = case when $3::boolean then $4 else total_items end,
        success_items = case when $5::boolean then $6 else success_items end,
        error_summary = case when $7::boolean then $8 else error_summary end,
        log_payload = case when $9::boolean then $10::jsonb else log_payload end,
        finished_at = case when $11::boolean then timezone('utc', now()) else finished_at end
    where id = $1
    returning *
    `,
    [
      input.jobId,
      input.status ?? null,
      input.totalItems !== undefined,
      input.totalItems ?? null,
      input.successItems !== undefined,
      input.successItems ?? null,
      input.errorSummary !== undefined,
      input.errorSummary ?? null,
      input.logPayload !== undefined,
      JSON.stringify(input.logPayload ?? {}),
      input.finished === true,
    ],
  );
  return result.rows[0];
}

async function countRunningImportJobs(pool, merchantId) {
  const result = await pool.query(
    `
    select
      count(*) filter (where merchant_id = $1 and status = 'running')::int as merchant_running,
      count(*) filter (where status = 'running')::int as global_running
    from public.import_jobs
    `,
    [merchantId],
  );
  return {
    merchantRunning: Number(result.rows[0]?.merchant_running ?? 0),
    globalRunning: Number(result.rows[0]?.global_running ?? 0),
  };
}

async function upsertSourceItem(pool, input) {
  const conflictTarget = input.externalItemId
    ? "(merchant_id, platform, external_item_id) where external_item_id is not null"
    : "(merchant_id, source_url) where source_url is not null";
  const result = await pool.query(
    `
    insert into public.source_items (
      merchant_id,
      import_job_id,
      platform,
      source_type,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      engagement_snapshot,
      structure_summary,
      trace_payload
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb
    )
    on conflict ${conflictTarget}
    do update set
      import_job_id = excluded.import_job_id,
      platform = excluded.platform,
      source_type = excluded.source_type,
      source_url = excluded.source_url,
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      title = excluded.title,
      body_text = excluded.body_text,
      script_text = excluded.script_text,
      engagement_snapshot = excluded.engagement_snapshot,
      structure_summary = excluded.structure_summary,
      trace_payload = excluded.trace_payload
    returning *
    `,
    [
      input.merchantId,
      input.jobId,
      input.platform,
      input.sourceType,
      input.externalItemId,
      input.sourceUrl,
      input.creatorId,
      input.creatorName,
      input.title,
      input.bodyText,
      input.scriptText,
      JSON.stringify(input.engagementSnapshot ?? {}),
      JSON.stringify(input.structureSummary ?? {}),
      JSON.stringify(input.tracePayload ?? {}),
    ],
  );
  const sourceItem = result.rows[0];
  cleanup.sourceItemIds.push(sourceItem.id);
  return sourceItem;
}

async function getSourceItem(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [input.sourceItemId, input.merchantId],
  );
  return result.rows[0] ?? null;
}

async function listSourceItems(pool, merchantId) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where merchant_id = $1
    order by created_at desc
    limit 50
    `,
    [merchantId],
  );
  return result.rows;
}

async function sourceItemExistsForMerchant(pool, input) {
  const result = await pool.query(
    `
    select id
    from public.source_items
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [input.sourceItemId, input.merchantId],
  );
  return Boolean(result.rows[0]);
}

async function getTracePayload(pool, sourceItemId) {
  const result = await pool.query(
    "select trace_payload from public.source_items where id = $1 limit 1",
    [sourceItemId],
  );
  return result.rows[0]?.trace_payload ?? null;
}

async function upsertImportedComment(pool, input) {
  const result = await pool.query(
    `
    insert into public.imported_comments (
      source_item_id,
      external_comment_id,
      parent_external_comment_id,
      author_name,
      content,
      like_count,
      reply_count,
      published_at,
      sort_score,
      trace_payload
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    on conflict (source_item_id, external_comment_id)
    do update set
      parent_external_comment_id = excluded.parent_external_comment_id,
      author_name = excluded.author_name,
      content = excluded.content,
      like_count = excluded.like_count,
      reply_count = excluded.reply_count,
      published_at = excluded.published_at,
      sort_score = excluded.sort_score,
      trace_payload = excluded.trace_payload
    returning *
    `,
    buildCommentParams(input),
  );
  const comment = result.rows[0];
  cleanup.commentIds.push(comment.id);
  return comment;
}

async function insertImportedComment(pool, input) {
  const result = await pool.query(
    `
    insert into public.imported_comments (
      source_item_id,
      external_comment_id,
      parent_external_comment_id,
      author_name,
      content,
      like_count,
      reply_count,
      published_at,
      sort_score,
      trace_payload
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    returning *
    `,
    buildCommentParams(input),
  );
  const comment = result.rows[0];
  cleanup.commentIds.push(comment.id);
  return comment;
}

function buildCommentParams(input) {
  const sortScore = (input.likeCount ?? 0) * 2 + (input.replyCount ?? 0);

  return [
    input.sourceItemId,
    input.externalCommentId ?? null,
    input.parentExternalCommentId ?? null,
    input.authorName ?? null,
    input.content,
    input.likeCount ?? 0,
    input.replyCount ?? 0,
    input.publishedAt ?? null,
    sortScore,
    JSON.stringify(input.tracePayload ?? {}),
  ];
}

async function listImportedComments(pool, sourceItemId) {
  const result = await pool.query(
    `
    select *
    from public.imported_comments
    where source_item_id = $1
    order by sort_score desc nulls last, created_at asc
    limit 100
    `,
    [sourceItemId],
  );
  return result.rows;
}

async function getJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "GET",
    headers: input.cookie ? { cookie: input.cookie } : {},
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 300) };
    }
  }

  return { status: response.status, body };
}

async function checkRequiredTables(pool) {
  const expectedTables = [...requiredTables, ...supportingTables];
  const result = await pool.query(
    `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any($1)
    order by table_name
    `,
    [expectedTables],
  );
  const tables = result.rows.map((row) => row.table_name);
  const missingTables = expectedTables.filter((table) => !tables.includes(table));

  return { missingTables };
}

async function cleanupSmokeData(pool) {
  const result = { skipped: false, errors: [] };
  const steps = [
    [
      "imported_comments",
      "delete from public.imported_comments where id = any($1::uuid[])",
      cleanup.commentIds,
    ],
    [
      "source_items",
      "delete from public.source_items where id = any($1::uuid[])",
      cleanup.sourceItemIds,
    ],
    [
      "import_jobs",
      "delete from public.import_jobs where id = any($1::uuid[])",
      cleanup.importJobIds,
    ],
    [
      "merchant_profiles",
      "delete from public.merchant_profiles where id = any($1::uuid[])",
      cleanup.merchantIds,
    ],
    [
      "user_sessions",
      "delete from public.user_sessions where id = any($1::uuid[])",
      cleanup.sessionIds,
    ],
    ["app_users", "delete from public.app_users where id = any($1::uuid[])", cleanup.userIds],
  ];

  for (const [name, sql, ids] of steps) {
    const uniqueIds = unique(ids);
    if (uniqueIds.length === 0) {
      continue;
    }

    try {
      await pool.query(sql, [uniqueIds]);
    } catch (error) {
      result.errors.push({
        name,
        message: error instanceof Error ? error.message : "Cleanup failed.",
      });
    }
  }

  result.status = result.errors.length === 0 ? "ok" : "partial";
  return result;
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

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
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

function resolveSslConfig() {
  const raw =
    process.env.APP_DATABASE_SSL ??
    process.env.DATABASE_SSL ??
    process.env.LOCAL_REAL_CHAIN_DB_SSL;

  if (raw === "disable" || raw === "false") {
    return false;
  }

  if (raw === "require" || raw === "true") {
    return { rejectUnauthorized: false };
  }

  return undefined;
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
  if (!value) {
    return "";
  }

  return value.replace(/\/+$/, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function writeReport(value, exitCodeValue) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(exitCodeValue);
}
