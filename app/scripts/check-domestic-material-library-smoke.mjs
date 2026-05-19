#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;
const requiredTables = [
  "source_items",
  "material_workbench_references",
  "merchant_profiles",
  "app_users",
  "content_drafts",
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
  referenceIds: [],
  draftIds: [],
  sourceItemIds: [],
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
    report.http = await runHttpLifecycle(pool, fixture, {
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
    error instanceof Error ? error.message : "Material library smoke failed.";
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
  const manual = await createManualMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "xiaohongshu",
    materialType: "article",
    sourceKind: "uploaded",
    sourceUrl: `https://example.test/material/manual-${stamp}`,
    title: `Batch 7 manual material ${stamp}`,
    description: `Batch 7 manual copy context ${stamp}`,
    engagementLabel: "manual-ready",
  });
  const duplicateManual = await createManualMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "xiaohongshu",
    materialType: "article",
    sourceKind: "uploaded",
    sourceUrl: manual.source_url,
    title: `Batch 7 duplicate material ${stamp}`,
    description: "should return existing by URL",
    engagementLabel: "duplicate",
  });
  const providerByExternalV1 = await upsertProviderMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "douyin",
    sourceType: "search",
    materialType: "video",
    sourceKind: "benchmark",
    externalItemId: `provider-ext-${stamp}`,
    sourceUrl: `https://example.test/provider/external-${stamp}`,
    title: "Provider external v1",
    description: "external v1",
    cacheKey: `cache-${stamp}`,
  });
  const providerByExternalV2 = await upsertProviderMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "douyin",
    sourceType: "search",
    materialType: "video",
    sourceKind: "benchmark",
    externalItemId: `provider-ext-${stamp}`,
    sourceUrl: `https://example.test/provider/external-${stamp}`,
    title: "Provider external v2",
    description: "external v2",
    cacheKey: `cache-${stamp}`,
  });
  const providerByUrlV1 = await upsertProviderMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "xiaohongshu",
    sourceType: "search",
    materialType: "article",
    sourceKind: "benchmark",
    sourceUrl: `https://example.test/provider/url-${stamp}`,
    title: "Provider URL v1",
    description: "url v1",
    cacheKey: `cache-${stamp}`,
  });
  const providerByUrlV2 = await upsertProviderMaterial(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    platform: "xiaohongshu",
    sourceType: "search",
    materialType: "article",
    sourceKind: "benchmark",
    sourceUrl: `https://example.test/provider/url-${stamp}`,
    title: "Provider URL v2",
    description: "url v2",
    cacheKey: `cache-${stamp}`,
  });
  const materials = await listMaterials(pool, fixture.merchantId);
  const manualDetail = await getMaterial(pool, {
    merchantId: fixture.merchantId,
    materialItemId: manual.id,
  });
  const crossMerchantDetail = await getMaterial(pool, {
    merchantId: fixture.crossMerchantId,
    materialItemId: manual.id,
  });
  const providerCache = await listProviderCache(pool, {
    platform: "douyin",
    cacheKey: `cache-${stamp}`,
  });
  const articleReference = await createWorkbenchReference(pool, {
    merchantId: fixture.merchantId,
    materialItemId: manual.id,
    targetWorkbench: "article",
    createdByUserId: fixture.userId,
  });
  const videoReference = await createWorkbenchReference(pool, {
    merchantId: fixture.merchantId,
    materialItemId: providerByExternalV2.id,
    targetWorkbench: "video",
    createdByUserId: fixture.userId,
  });
  const articleReferenceDetail = await getWorkbenchReference(pool, {
    merchantId: fixture.merchantId,
    referenceId: articleReference.id,
    targetWorkbench: "article",
  });
  const crossReferenceDetail = await getWorkbenchReference(pool, {
    merchantId: fixture.crossMerchantId,
    referenceId: articleReference.id,
    targetWorkbench: "article",
  });
  const draft = await createContentDraft(pool, {
    merchantId: fixture.merchantId,
    createdByUserId: fixture.userId,
    sourceItemId: manual.id,
  });
  const consumedReference = await consumeWorkbenchReference(pool, {
    merchantId: fixture.merchantId,
    referenceId: articleReference.id,
    targetWorkbench: "article",
    draftId: draft.id,
    materialItemId: manual.id,
  });
  const draftReferences = await listWorkbenchReferencesByDraft(pool, {
    merchantId: fixture.merchantId,
    draftId: draft.id,
    targetWorkbench: "article",
  });
  const selectedFlag = await getSelectedForRewrite(pool, manual.id);

  const checks = {
    manualCreate: Boolean(manual.id),
    duplicateUrlReturnsExisting: duplicateManual.id === manual.id,
    listMaterials:
      materials.length >= 3 &&
      materials.some((item) => item.id === manual.id) &&
      materials.some((item) => item.title === "Provider external v2"),
    getMaterial: manualDetail?.id === manual.id,
    retrievalTargetData:
      Array.isArray(manual.trace_payload?.retrievalTargets) &&
      manual.trace_payload.retrievalTargets.includes("copy_context"),
    providerExternalDedupe:
      providerByExternalV1.id === providerByExternalV2.id &&
      providerByExternalV2.title === "Provider external v2",
    providerUrlDedupe:
      providerByUrlV1.id === providerByUrlV2.id &&
      providerByUrlV2.title === "Provider URL v2",
    providerCacheRead:
      providerCache.some((item) => item.id === providerByExternalV2.id) &&
      providerCache.every((item) => item.trace_payload?.materialProvider === "tikhub"),
    articleReferenceCreate: articleReference.target_workbench === "article",
    videoReferenceCreate: videoReference.target_workbench === "video",
    referenceRead: articleReferenceDetail?.id === articleReference.id,
    referenceConsume:
      consumedReference?.status === "consumed" &&
      consumedReference?.draft_id === draft.id &&
      Boolean(consumedReference?.consumed_at),
    listReferencesByDraft:
      draftReferences.length === 1 && draftReferences[0]?.id === articleReference.id,
    selectedForRewrite: selectedFlag === true,
    merchantScoping: crossMerchantDetail === null && crossReferenceDetail === null,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function runHttpLifecycle(pool, fixture, input) {
  const materialUrl = `https://example.test/http-material/${stamp}`;
  const createMaterial = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/materials",
    cookie: input.cookie,
    body: {
      platform: "xiaohongshu",
      url: materialUrl,
    },
  });
  const materialId = createMaterial.body?.material?.id;
  if (materialId) {
    cleanup.sourceItemIds.push(materialId);
  }

  const listMaterials = await getJson({
    baseUrl: input.baseUrl,
    path: `/api/materials?limit=20&retrievalTarget=copy_context&query=${encodeURIComponent(stamp)}`,
    cookie: input.cookie,
  });
  const sendToWorkbench = materialId
    ? await postJson({
        baseUrl: input.baseUrl,
        path: `/api/materials/${materialId}/send-to-workbench`,
        cookie: input.cookie,
        body: { targetWorkbench: "article" },
      })
    : { status: 0, body: null };
  const referenceId = sendToWorkbench.body?.reference?.id;
  if (referenceId) {
    cleanup.referenceIds.push(referenceId);
  }

  const crossSession = await createUserSession(pool, fixture.crossUserId);
  const crossSendToWorkbench = materialId
    ? await postJson({
        baseUrl: input.baseUrl,
        path: `/api/materials/${materialId}/send-to-workbench`,
        cookie: `${sessionCookieName}=${crossSession.token}`,
        body: { targetWorkbench: "article" },
      })
    : { status: 0, body: null };

  const checks = {
    createMaterial: createMaterial.status === 201 && Boolean(materialId),
    listMaterials:
      listMaterials.status === 200 &&
      Array.isArray(listMaterials.body?.materials) &&
      listMaterials.body.materials.some((item) => item.id === materialId),
    sendToWorkbench:
      sendToWorkbench.status === 201 &&
      sendToWorkbench.body?.reference?.materialItemId === materialId,
    merchantScoping: crossSendToWorkbench.status === 404,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function createFixture(pool) {
  const owner = await createUser(pool, {
    email: `material-smoke-owner-${stamp}@example.test`,
    displayName: "Material Smoke Owner",
  });
  const crossOwner = await createUser(pool, {
    email: `material-smoke-cross-${stamp}@example.test`,
    displayName: "Material Smoke Cross Owner",
  });
  const merchant = await createMerchant(pool, {
    ownerUserId: owner.id,
    name: `Material Smoke Merchant ${stamp}`,
  });
  const crossMerchant = await createMerchant(pool, {
    ownerUserId: crossOwner.id,
    name: `Material Smoke Cross Merchant ${stamp}`,
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

async function createManualMaterial(pool, input) {
  const row = buildMaterialRow({
    ...input,
    sourceType: input.sourceKind === "benchmark" ? "search" : "manual_text",
    externalItemId: null,
    creatorId: null,
    creatorName: null,
    usageType: "viral_reference",
    retrievalTargets: ["copy_context", "script_context"],
    status: "ready",
    tracePayload: {},
  });
  const inserted = await insertMaterialDoNothingOnUrlConflict(pool, row);

  if (inserted) {
    return inserted;
  }

  return getMaterialByUrl(pool, {
    merchantId: input.merchantId,
    sourceUrl: input.sourceUrl,
  });
}

async function upsertProviderMaterial(pool, input) {
  const row = buildMaterialRow({
    ...input,
    usageType: "viral_reference",
    retrievalTargets: ["copy_context", "script_context"],
    status: "ready",
    engagementLabel: input.materialType === "video" ? "video-cache" : "article-cache",
    tracePayload: {
      materialProvider: "tikhub",
      materialProviderCacheKey: input.cacheKey,
      providerSmokeStamp: stamp,
    },
  });
  const existingId = await findExistingProviderMaterialId(pool, row);

  if (existingId) {
    const result = await pool.query(
      `
      update public.source_items
      set platform = $2,
          source_type = $3,
          external_item_id = $4,
          source_url = $5,
          creator_id = $6,
          creator_name = $7,
          title = $8,
          body_text = $9,
          script_text = $10,
          structure_summary = $11::jsonb,
          engagement_snapshot = $12::jsonb,
          trace_payload = $13::jsonb,
          is_selected_for_rewrite = $14
      where id = $15
        and merchant_id = $1
      returning *
      `,
      [...buildMaterialParams(row), existingId],
    );

    return result.rows[0];
  }

  return insertMaterialDoNothingOnUrlConflict(pool, row);
}

function buildMaterialRow(input) {
  return {
    merchantId: input.merchantId,
    platform: input.platform,
    sourceType: input.sourceType,
    externalItemId: input.externalItemId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    creatorId: input.creatorId ?? null,
    creatorName: input.creatorName ?? null,
    title: input.title,
    bodyText: input.materialType === "article" ? input.description ?? null : null,
    scriptText: input.materialType === "video" ? input.description ?? null : null,
    structureSummary: {
      materialType: input.materialType,
      materialStatus: input.status,
      materialSourceKind: input.sourceKind,
      materialUsageType: input.usageType,
      retrievalTargets: input.retrievalTargets,
    },
    engagementSnapshot: {
      label: input.engagementLabel ?? null,
    },
    tracePayload: {
      ...(input.tracePayload ?? {}),
      materialLibrary: true,
      materialSourceKind: input.sourceKind,
      materialUsageType: input.usageType,
      retrievalTargets: input.retrievalTargets,
      materialAnalysis: {
        ...(input.tracePayload ?? {}),
        materialUsageType: input.usageType,
        retrievalTargets: input.retrievalTargets,
      },
      createdByUserId: input.createdByUserId,
    },
    isSelectedForRewrite: false,
  };
}

async function insertMaterialDoNothingOnUrlConflict(pool, row) {
  const result = await pool.query(
    `
    insert into public.source_items (
      merchant_id,
      platform,
      source_type,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      structure_summary,
      engagement_snapshot,
      trace_payload,
      is_selected_for_rewrite
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14
    )
    on conflict (merchant_id, source_url) where source_url is not null
    do nothing
    returning *
    `,
    buildMaterialParams(row),
  );
  const item = result.rows[0] ?? null;
  if (item) {
    cleanup.sourceItemIds.push(item.id);
  }
  return item;
}

function buildMaterialParams(row) {
  return [
    row.merchantId,
    row.platform,
    row.sourceType,
    row.externalItemId,
    row.sourceUrl,
    row.creatorId,
    row.creatorName,
    row.title,
    row.bodyText,
    row.scriptText,
    JSON.stringify(row.structureSummary),
    JSON.stringify(row.engagementSnapshot),
    JSON.stringify(row.tracePayload),
    row.isSelectedForRewrite,
  ];
}

async function findExistingProviderMaterialId(pool, row) {
  if (row.externalItemId) {
    const result = await pool.query(
      `
      select id
      from public.source_items
      where merchant_id = $1
        and platform = $2
        and external_item_id = $3
      limit 1
      `,
      [row.merchantId, row.platform, row.externalItemId],
    );
    return result.rows[0]?.id ?? null;
  }

  if (row.sourceUrl) {
    const result = await pool.query(
      `
      select id
      from public.source_items
      where merchant_id = $1
        and source_url = $2
      limit 1
      `,
      [row.merchantId, row.sourceUrl],
    );
    return result.rows[0]?.id ?? null;
  }

  return null;
}

async function listMaterials(pool, merchantId) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where merchant_id = $1
      and trace_payload @> $2::jsonb
    order by created_at desc
    limit 50
    `,
    [merchantId, JSON.stringify({ materialLibrary: true })],
  );
  return result.rows;
}

async function getMaterial(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where id = $1
      and merchant_id = $2
      and trace_payload @> $3::jsonb
    limit 1
    `,
    [input.materialItemId, input.merchantId, JSON.stringify({ materialLibrary: true })],
  );
  return result.rows[0] ?? null;
}

async function getMaterialByUrl(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where merchant_id = $1
      and source_url = $2
      and trace_payload @> $3::jsonb
    limit 1
    `,
    [input.merchantId, input.sourceUrl, JSON.stringify({ materialLibrary: true })],
  );
  return result.rows[0] ?? null;
}

async function listProviderCache(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.source_items
    where platform = $1
      and created_at >= timezone('utc', now()) - interval '1 day'
      and trace_payload @> $2::jsonb
    order by created_at desc
    limit 20
    `,
    [
      input.platform,
      JSON.stringify({
        materialLibrary: true,
        materialProvider: "tikhub",
        materialProviderCacheKey: input.cacheKey,
      }),
    ],
  );
  return result.rows;
}

async function createWorkbenchReference(pool, input) {
  const material = await getMaterial(pool, {
    merchantId: input.merchantId,
    materialItemId: input.materialItemId,
  });

  if (!material) {
    throw new Error("Material item not found for workbench reference.");
  }

  const result = await pool.query(
    `
    insert into public.material_workbench_references (
      merchant_id,
      material_item_id,
      target_workbench,
      status,
      created_by_user_id,
      trace_payload
    ) values ($1, $2, $3, 'pending', $4, $5::jsonb)
    returning *
    `,
    [
      input.merchantId,
      input.materialItemId,
      input.targetWorkbench,
      input.createdByUserId,
      JSON.stringify({ smoke: "batch7", stamp }),
    ],
  );
  const reference = result.rows[0];
  cleanup.referenceIds.push(reference.id);

  await pool.query(
    `
    update public.source_items
    set is_selected_for_rewrite = true
    where id = $1 and merchant_id = $2
    `,
    [input.materialItemId, input.merchantId],
  );

  return reference;
}

async function getWorkbenchReference(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.material_workbench_references
    where id = $1
      and merchant_id = $2
      and target_workbench = $3
    limit 1
    `,
    [input.referenceId, input.merchantId, input.targetWorkbench],
  );
  return result.rows[0] ?? null;
}

async function createContentDraft(pool, input) {
  const result = await pool.query(
    `
    insert into public.content_drafts (
      source_item_id,
      merchant_id,
      created_by_user_id,
      working_title,
      rewrite_goal,
      input_snapshot,
      comment_insights,
      status
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'drafting')
    returning *
    `,
    [
      input.sourceItemId,
      input.merchantId,
      input.createdByUserId,
      `Batch 7 material draft ${stamp}`,
      "material reference consume smoke",
      JSON.stringify({ smoke: "batch7", stamp }),
      JSON.stringify({}),
    ],
  );
  const draft = result.rows[0];
  cleanup.draftIds.push(draft.id);
  return draft;
}

async function consumeWorkbenchReference(pool, input) {
  const result = await pool.query(
    `
    update public.material_workbench_references
    set status = 'consumed',
        draft_id = $1,
        consumed_at = timezone('utc', now())
    where id = $2
      and merchant_id = $3
      and target_workbench = $4
      and material_item_id = $5
    returning *
    `,
    [
      input.draftId,
      input.referenceId,
      input.merchantId,
      input.targetWorkbench,
      input.materialItemId,
    ],
  );
  return result.rows[0] ?? null;
}

async function listWorkbenchReferencesByDraft(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.material_workbench_references
    where merchant_id = $1
      and draft_id = $2
      and target_workbench = $3
    order by created_at asc
    `,
    [input.merchantId, input.draftId, input.targetWorkbench],
  );
  return result.rows;
}

async function getSelectedForRewrite(pool, sourceItemId) {
  const result = await pool.query(
    "select is_selected_for_rewrite from public.source_items where id = $1 limit 1",
    [sourceItemId],
  );
  return result.rows[0]?.is_selected_for_rewrite ?? null;
}

async function getJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "GET",
    headers: input.cookie ? { cookie: input.cookie } : {},
  });
  return parseResponse(response);
}

async function postJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.cookie ? { cookie: input.cookie } : {}),
    },
    body: JSON.stringify(input.body ?? {}),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
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
      "material_workbench_references",
      "delete from public.material_workbench_references where id = any($1::uuid[])",
      cleanup.referenceIds,
    ],
    [
      "content_drafts",
      "delete from public.content_drafts where id = any($1::uuid[])",
      cleanup.draftIds,
    ],
    [
      "source_items",
      "delete from public.source_items where id = any($1::uuid[])",
      cleanup.sourceItemIds,
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
  return value.trim().replace(/\/+$/, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function writeReport(value, code) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}
