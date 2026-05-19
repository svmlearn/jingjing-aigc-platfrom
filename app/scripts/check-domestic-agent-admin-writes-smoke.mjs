#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const platformAdminSessionCookieName = "platform_admin_session";
const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;
const requiredTables = [
  "platform_admin_events",
  "platform_admin_users",
  "platform_admin_sessions",
  "agent_configs",
  "agent_prompt_versions",
  "agent_soul_versions",
  "agent_skills",
  "agent_skill_bindings",
  "knowledge_documents",
  "knowledge_sets",
  "knowledge_set_documents",
  "agent_knowledge_set_bindings",
  "agent_route_bindings",
  "app_users",
  "merchant_profiles",
  "merchant_team_members",
];

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
const adminEmail =
  getArgValue("--admin-email") ||
  process.env.DOMESTIC_AGENT_ADMIN_WRITES_ADMIN_EMAIL ||
  `agent-admin-writes-${stamp}@example.test`;
const adminPassword =
  getArgValue("--admin-password") ||
  process.env.DOMESTIC_AGENT_ADMIN_WRITES_ADMIN_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;
const merchantEmail =
  getArgValue("--merchant-email") ||
  process.env.DOMESTIC_AGENT_ADMIN_WRITES_MERCHANT_EMAIL ||
  `agent-admin-writes-merchant-${stamp}@example.test`;
const merchantPassword =
  getArgValue("--merchant-password") ||
  process.env.DOMESTIC_AGENT_ADMIN_WRITES_MERCHANT_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: requiredTables,
  },
  direct: {},
  http: baseUrl ? { baseUrl } : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

let pool = null;
let fixture = null;
let originalRouteBinding = null;
const cleanup = {
  agentIds: [],
  skillIds: [],
  knowledgeSetIds: [],
  knowledgeDocumentIds: [],
  adminUserIds: [],
  appUserIds: [],
  merchantIds: [],
  routeBindingIds: [],
};
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

  if (tableCheck.missingTables.length > 0) {
    throw new Error(`Missing required tables: ${tableCheck.missingTables.join(", ")}`);
  }

  originalRouteBinding = await getConsultationRouteBinding(pool);
  report.direct = await runDirectDatabaseLifecycle(pool);

  if (baseUrl) {
    fixture = await createHttpFixture(pool, {
      adminEmail,
      adminPassword,
      merchantEmail,
      merchantPassword,
    });
    cleanup.adminUserIds.push(fixture.adminUserId);
    cleanup.appUserIds.push(fixture.userId);
    cleanup.merchantIds.push(fixture.merchantId);

    report.http = await runHttpLifecycle(pool, {
      baseUrl,
      adminCookie: `${platformAdminSessionCookieName}=${fixture.adminSessionToken}`,
      merchantEmail: fixture.merchantEmail,
      merchantPassword,
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
  report.message = error instanceof Error ? error.message : "Agent admin writes smoke failed.";
  exitCode = 1;
} finally {
  if (pool && !keepFixture) {
    report.cleanup = await cleanupSmokeData(pool, {
      cleanup,
      fixture,
      originalRouteBinding,
    });
  } else if (keepFixture) {
    report.cleanup = { skipped: true, reason: "keep_fixture" };
  }

  if (pool) {
    await pool.end().catch(() => undefined);
  }

  writeReport(report, exitCode);
}

async function runDirectDatabaseLifecycle(pool) {
  const client = await pool.connect();
  const ids = {
    agentId: null,
    copiedAgentId: null,
    skillId: null,
    knowledgeSetId: null,
    documentId: null,
    routeBindingId: null,
  };

  try {
    await client.query("begin");
    const agent = await client.query(
      `
      insert into public.agent_configs (
        agent_key,
        display_name,
        role_description,
        description,
        service_status,
        service_flags,
        model_config
      ) values ($1, $2, 'Admin writes smoke agent', 'Direct DB lifecycle fixture', 'draft', $3::jsonb, '{}'::jsonb)
      returning id
      `,
      [
        `agent_admin_writes_direct_${stamp}`,
        `Agent Admin Writes Direct ${stamp}`,
        JSON.stringify({
          systemPromptEnabled: true,
          skillsEnabled: true,
          knowledgeEnabled: true,
        }),
      ],
    );
    ids.agentId = agent.rows[0].id;
    cleanup.agentIds.push(ids.agentId);

    const promptV1 = await insertVersion(client, {
      tableName: "agent_prompt_versions",
      agentId: ids.agentId,
      versionNo: 1,
      body: "direct prompt v1",
      status: "draft",
    });
    await client.query(
      "update public.agent_prompt_versions set status = 'active', activated_at = timezone('utc', now()) where id = $1",
      [promptV1.id],
    );
    await client.query(
      "update public.agent_configs set service_status = 'enabled' where id = $1",
      [ids.agentId],
    );

    const soulV1 = await insertVersion(client, {
      tableName: "agent_soul_versions",
      agentId: ids.agentId,
      versionNo: 1,
      body: "direct soul v1",
      status: "draft",
    });
    await client.query(
      "update public.agent_soul_versions set status = 'active', activated_at = timezone('utc', now()) where id = $1",
      [soulV1.id],
    );

    const promptDraft = await insertVersion(client, {
      tableName: "agent_prompt_versions",
      agentId: ids.agentId,
      versionNo: 2,
      body: "direct prompt draft for copy",
      status: "draft",
    });
    const soulDraft = await insertVersion(client, {
      tableName: "agent_soul_versions",
      agentId: ids.agentId,
      versionNo: 2,
      body: "direct soul draft for copy",
      status: "draft",
    });

    const skill = await client.query(
      `
      insert into public.agent_skills (
        skill_key,
        name,
        description,
        when_to_use,
        body,
        status,
        dependencies,
        metadata
      ) values ($1, $2, 'Direct DB skill', 'Use in smoke.', 'Skill body.', 'enabled', '[]'::jsonb, '{}'::jsonb)
      returning id
      `,
      [`skill_admin_writes_direct_${stamp}`, `Agent Admin Writes Direct Skill ${stamp}`],
    );
    ids.skillId = skill.rows[0].id;
    cleanup.skillIds.push(ids.skillId);
    await client.query(
      "insert into public.agent_skill_bindings (agent_id, skill_id, status) values ($1, $2, 'enabled')",
      [ids.agentId, ids.skillId],
    );

    const set = await client.query(
      `
      insert into public.knowledge_sets (
        set_key,
        name,
        description,
        scope,
        status,
        metadata
      ) values ($1, $2, 'Direct DB knowledge set', 'platform', 'enabled', '{}'::jsonb)
      returning id
      `,
      [`ks_admin_writes_direct_${stamp}`, `Agent Admin Writes Direct KS ${stamp}`],
    );
    ids.knowledgeSetId = set.rows[0].id;
    cleanup.knowledgeSetIds.push(ids.knowledgeSetId);
    const doc = await createPlatformKnowledgeDocument(client, "direct-db");
    ids.documentId = doc.id;
    cleanup.knowledgeDocumentIds.push(ids.documentId);
    await client.query(
      "insert into public.knowledge_set_documents (knowledge_set_id, document_id) values ($1, $2)",
      [ids.knowledgeSetId, ids.documentId],
    );
    await client.query(
      "insert into public.agent_knowledge_set_bindings (agent_id, knowledge_set_id, status) values ($1, $2, 'enabled')",
      [ids.agentId, ids.knowledgeSetId],
    );

    const route = await client.query(
      `
      insert into public.agent_route_bindings (
        route_key,
        agent_id,
        status,
        description
      ) values ('consultation_default', $1, 'active', 'Agent admin writes direct smoke route.')
      on conflict (route_key)
      do update set agent_id = excluded.agent_id,
                    status = excluded.status,
                    description = excluded.description
      returning id
      `,
      [ids.agentId],
    );
    ids.routeBindingId = route.rows[0].id;
    cleanup.routeBindingIds.push(ids.routeBindingId);

    const copy = await client.query(
      `
      insert into public.agent_configs (
        agent_key,
        display_name,
        role_description,
        description,
        service_status,
        service_flags,
        model_config,
        copied_from_agent_id
      )
      select $1, $2, role_description, description, 'draft', service_flags, model_config, id
      from public.agent_configs
      where id = $3
      returning id
      `,
      [`agent_admin_writes_direct_copy_${stamp}`, `Agent Admin Writes Direct Copy ${stamp}`, ids.agentId],
    );
    ids.copiedAgentId = copy.rows[0].id;
    cleanup.agentIds.push(ids.copiedAgentId);
    await copyVersions(client, {
      tableName: "agent_prompt_versions",
      sourceAgentId: ids.agentId,
      copiedAgentId: ids.copiedAgentId,
    });
    await copyVersions(client, {
      tableName: "agent_soul_versions",
      sourceAgentId: ids.agentId,
      copiedAgentId: ids.copiedAgentId,
    });
    await client.query(
      `
      insert into public.agent_skill_bindings (agent_id, skill_id, status)
      select $1, skill_id, status
      from public.agent_skill_bindings
      where agent_id = $2
      `,
      [ids.copiedAgentId, ids.agentId],
    );
    await client.query(
      `
      insert into public.agent_knowledge_set_bindings (agent_id, knowledge_set_id, status)
      select $1, knowledge_set_id, status
      from public.agent_knowledge_set_bindings
      where agent_id = $2
      `,
      [ids.copiedAgentId, ids.agentId],
    );

    await client.query("commit");

    const state = await loadAgentState(client, ids.copiedAgentId);

    return {
      status: state.activePromptCount === 1 &&
        state.draftPromptCount === 1 &&
        state.activeSoulCount === 1 &&
        state.draftSoulCount === 1 &&
        state.skillBindingCount === 1 &&
        state.knowledgeSetBindingCount === 1
        ? "ok"
        : "failed",
      copiedAgentId: ids.copiedAgentId,
      activePromptCount: state.activePromptCount,
      draftPromptCount: state.draftPromptCount,
      activeSoulCount: state.activeSoulCount,
      draftSoulCount: state.draftSoulCount,
      skillBindingCount: state.skillBindingCount,
      knowledgeSetBindingCount: state.knowledgeSetBindingCount,
      promptDraftId: promptDraft.id,
      soulDraftId: soulDraft.id,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runHttpLifecycle(pool, input) {
  const created = {
    agentId: null,
    copiedAgentId: null,
    skillId: null,
    knowledgeSetId: null,
    documentId: null,
  };
  const result = { status: "failed", checks: {} };

  const createAgent = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/agents",
    cookie: input.adminCookie,
    body: {
      displayName: `Agent Admin Writes HTTP ${stamp}`,
      roleDescription: "HTTP smoke agent",
      description: "Batch 4B smoke fixture.",
    },
  });
  created.agentId = createAgent.body?.agent?.id ?? null;
  if (created.agentId) {
    cleanup.agentIds.push(created.agentId);
  }

  const promptDraftV1 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/prompt-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP prompt v1",
      changeNote: "smoke v1",
    },
  });
  const publishPromptV1 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/publish-prompt`,
    cookie: input.adminCookie,
    body: {},
  });
  const enableAgent = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}`,
    cookie: input.adminCookie,
    body: { serviceStatus: "enabled" },
  });
  const soulDraftV1 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/soul-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP soul v1",
      changeNote: "smoke soul v1",
    },
  });
  const publishSoulV1 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/publish-soul`,
    cookie: input.adminCookie,
    body: {},
  });
  const promptDraftV2 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/prompt-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP prompt v2",
      changeNote: "smoke v2",
    },
  });
  const publishPromptV2 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/publish-prompt`,
    cookie: input.adminCookie,
    body: {},
  });
  const rollbackPrompt = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/rollback-prompt`,
    cookie: input.adminCookie,
    body: { promptVersionId: publishPromptV1.body?.promptVersion?.id },
  });
  const soulDraftV2 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/soul-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP soul v2",
      changeNote: "smoke soul v2",
    },
  });
  const publishSoulV2 = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/publish-soul`,
    cookie: input.adminCookie,
    body: {},
  });
  const rollbackSoul = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/rollback-soul`,
    cookie: input.adminCookie,
    body: { soulVersionId: publishSoulV1.body?.soulVersion?.id },
  });
  const promptDraftForCopy = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/prompt-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP prompt draft for copy",
      changeNote: "copy draft",
    },
  });
  const soulDraftForCopy = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/soul-draft`,
    cookie: input.adminCookie,
    body: {
      body: "HTTP soul draft for copy",
      changeNote: "copy draft",
    },
  });
  const skill = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/skills",
    cookie: input.adminCookie,
    body: {
      name: `Agent Admin Writes HTTP Skill ${stamp}`,
      description: "HTTP smoke skill",
      whenToUse: "Use during smoke validation.",
      body: "Skill body.",
      status: "enabled",
    },
  });
  created.skillId = skill.body?.skill?.id ?? null;
  if (created.skillId) {
    cleanup.skillIds.push(created.skillId);
  }
  const skillBinding = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/skills`,
    cookie: input.adminCookie,
    body: { skillIds: [created.skillId] },
  });
  const knowledgeSet = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/knowledge/sets",
    cookie: input.adminCookie,
    body: {
      name: `Agent Admin Writes HTTP KS ${stamp}`,
      description: "HTTP smoke knowledge set",
      scope: "platform",
      status: "enabled",
    },
  });
  created.knowledgeSetId = knowledgeSet.body?.knowledgeSet?.id ?? null;
  if (created.knowledgeSetId) {
    cleanup.knowledgeSetIds.push(created.knowledgeSetId);
  }
  const doc = await createPlatformKnowledgeDocument(pool, "http-api");
  created.documentId = doc.id;
  cleanup.knowledgeDocumentIds.push(created.documentId);
  const setDocuments = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/knowledge/sets/${created.knowledgeSetId}/documents`,
    cookie: input.adminCookie,
    body: { documentIds: [created.documentId] },
  });
  const knowledgeBinding = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/knowledge-sets`,
    cookie: input.adminCookie,
    body: { knowledgeSetIds: [created.knowledgeSetId] },
  });
  const setOnline = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/set-online`,
    cookie: input.adminCookie,
    body: {},
  });
  const merchantLogin = await signInMerchant({
    baseUrl: input.baseUrl,
    email: input.merchantEmail,
    password: input.merchantPassword,
  });
  const experts = await getJson({
    baseUrl: input.baseUrl,
    path: "/api/consultation/experts",
    cookie: merchantLogin.cookie,
  });
  const copyAgent = await postJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/agents/${created.agentId}/copy`,
    cookie: input.adminCookie,
    body: { displayName: `Agent Admin Writes HTTP Copy ${stamp}` },
  });
  created.copiedAgentId = copyAgent.body?.detail?.agent?.id ?? null;
  if (created.copiedAgentId) {
    cleanup.agentIds.push(created.copiedAgentId);
  }
  const copiedDetail = copyAgent.body?.detail ?? null;
  const defaultExpert = Array.isArray(experts.body?.experts)
    ? experts.body.experts.find((expert) => expert.agentId === created.agentId && expert.isDefault)
    : null;

  result.checks = {
    createAgent: createAgent.status === 201,
    promptDraftV1: promptDraftV1.status === 200,
    publishPromptV1: publishPromptV1.status === 200,
    enableAgent: enableAgent.status === 200,
    soulDraftV1: soulDraftV1.status === 200,
    publishSoulV1: publishSoulV1.status === 200,
    promptDraftV2: promptDraftV2.status === 200,
    publishPromptV2: publishPromptV2.status === 200,
    rollbackPrompt: rollbackPrompt.status === 200,
    soulDraftV2: soulDraftV2.status === 200,
    publishSoulV2: publishSoulV2.status === 200,
    rollbackSoul: rollbackSoul.status === 200,
    promptDraftForCopy: promptDraftForCopy.status === 200,
    soulDraftForCopy: soulDraftForCopy.status === 200,
    createSkill: skill.status === 201,
    bindSkill: skillBinding.status === 200 &&
      skillBinding.body?.skillBindings?.some?.((item) => item.skillId === created.skillId),
    createKnowledgeSet: knowledgeSet.status === 201,
    bindDocument: setDocuments.status === 200 &&
      setDocuments.body?.detail?.documentIds?.includes?.(created.documentId),
    bindKnowledgeSet: knowledgeBinding.status === 200 &&
      knowledgeBinding.body?.knowledgeSetBindings?.some?.(
        (item) => item.knowledgeSetId === created.knowledgeSetId,
      ),
    setOnline: setOnline.status === 200 &&
      setOnline.body?.routeBinding?.agentId === created.agentId,
    merchantLogin: merchantLogin.status === 303 && Boolean(merchantLogin.cookie),
    resolveDefaultExpert: experts.status === 200 && Boolean(defaultExpert),
    copyAgent: copyAgent.status === 201,
    copiedActivePrompt: copiedDetail?.activePromptVersion?.status === "active",
    copiedDraftPrompt: copiedDetail?.promptVersions?.some?.((item) => item.status === "draft"),
    copiedActiveSoul: copiedDetail?.activeSoulVersion?.status === "active",
    copiedDraftSoul: copiedDetail?.soulVersions?.some?.((item) => item.status === "draft"),
    copiedSkillBinding: copiedDetail?.skillBindings?.some?.(
      (item) => item.skillId === created.skillId,
    ),
    copiedKnowledgeBinding: copiedDetail?.knowledgeSetBindings?.some?.(
      (item) => item.knowledgeSetId === created.knowledgeSetId,
    ),
  };
  result.status = Object.values(result.checks).every(Boolean) ? "ok" : "failed";
  result.statuses = {
    createAgent: createAgent.status,
    publishPromptV1: publishPromptV1.status,
    enableAgent: enableAgent.status,
    publishSoulV1: publishSoulV1.status,
    rollbackPrompt: rollbackPrompt.status,
    rollbackSoul: rollbackSoul.status,
    setOnline: setOnline.status,
    experts: experts.status,
    copyAgent: copyAgent.status,
  };

  return result;
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

async function getConsultationRouteBinding(pool) {
  const result = await pool.query(
    `
    select id, route_key, agent_id, status, description
    from public.agent_route_bindings
    where route_key = 'consultation_default'
    limit 1
    `,
  );

  return result.rows[0] ?? null;
}

async function insertVersion(client, input) {
  const result = await client.query(
    `
    insert into public.${input.tableName} (
      agent_id,
      version_no,
      body,
      status,
      change_note
    ) values ($1, $2, $3, $4, 'direct smoke')
    returning id
    `,
    [input.agentId, input.versionNo, input.body, input.status],
  );

  return result.rows[0];
}

async function copyVersions(client, input) {
  const rows = await client.query(
    `
    select body, status, change_note, activated_at
    from public.${input.tableName}
    where agent_id = $1
      and status in ('active', 'draft')
    order by case status when 'active' then 1 else 2 end
    `,
    [input.sourceAgentId],
  );

  let versionNo = 1;
  for (const row of rows.rows) {
    await client.query(
      `
      insert into public.${input.tableName} (
        agent_id,
        version_no,
        body,
        status,
        change_note,
        activated_at
      ) values ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.copiedAgentId,
        versionNo,
        row.body,
        row.status,
        row.change_note,
        row.status === "active" ? row.activated_at ?? new Date() : null,
      ],
    );
    versionNo += 1;
  }
}

async function createPlatformKnowledgeDocument(clientOrPool, label) {
  const result = await clientOrPool.query(
    `
    insert into public.knowledge_documents (
      scope,
      title,
      source_name,
      document_kind,
      content_kind,
      status,
      summary_text,
      metadata
    ) values (
      'platform',
      $1,
      $2,
      'seed',
      'platform_method',
      'indexed',
      'Agent admin writes smoke knowledge document.',
      $3::jsonb
    )
    returning id
    `,
    [
      `Agent Admin Writes Smoke Document ${label} ${stamp}`,
      `agent-admin-writes-${label}.md`,
      JSON.stringify({ seedKey: `agent-admin-writes-${label}-${stamp}` }),
    ],
  );

  return result.rows[0];
}

async function loadAgentState(pool, agentId) {
  const result = await pool.query(
    `
    select
      (select count(*)::int from public.agent_prompt_versions where agent_id = $1 and status = 'active') as active_prompt_count,
      (select count(*)::int from public.agent_prompt_versions where agent_id = $1 and status = 'draft') as draft_prompt_count,
      (select count(*)::int from public.agent_soul_versions where agent_id = $1 and status = 'active') as active_soul_count,
      (select count(*)::int from public.agent_soul_versions where agent_id = $1 and status = 'draft') as draft_soul_count,
      (select count(*)::int from public.agent_skill_bindings where agent_id = $1 and status = 'enabled') as skill_binding_count,
      (select count(*)::int from public.agent_knowledge_set_bindings where agent_id = $1 and status = 'enabled') as knowledge_set_binding_count
    `,
    [agentId],
  );

  return {
    activePromptCount: result.rows[0]?.active_prompt_count ?? 0,
    draftPromptCount: result.rows[0]?.draft_prompt_count ?? 0,
    activeSoulCount: result.rows[0]?.active_soul_count ?? 0,
    draftSoulCount: result.rows[0]?.draft_soul_count ?? 0,
    skillBindingCount: result.rows[0]?.skill_binding_count ?? 0,
    knowledgeSetBindingCount: result.rows[0]?.knowledge_set_binding_count ?? 0,
  };
}

async function createHttpFixture(pool, input) {
  const client = await pool.connect();
  const adminSessionToken = randomBytes(32).toString("base64url");

  try {
    await client.query("begin");
    const adminResult = await client.query(
      `
      insert into public.platform_admin_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, 'Agent Admin Writes Smoke Admin', 'super_admin', 'active')
      returning id, email
      `,
      [input.adminEmail.trim().toLowerCase(), createPasswordHash(input.adminPassword)],
    );
    const adminUser = adminResult.rows[0];
    await client.query(
      `
      insert into public.platform_admin_sessions (
        admin_user_id,
        token_hash,
        expires_at
      ) values ($1, $2, timezone('utc', now()) + interval '1 hour')
      `,
      [adminUser.id, hashSessionToken(adminSessionToken)],
    );
    const userResult = await client.query(
      `
      insert into public.app_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, 'Agent Admin Writes Smoke Owner', 'merchant_owner', 'active')
      returning id
      `,
      [input.merchantEmail.trim().toLowerCase(), createPasswordHash(input.merchantPassword)],
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
      ) values ($1, 'Agent Admin Writes Smoke Merchant', 'domestic_validation', 'Agent Admin Writes Smoke Owner', 'active', 'free')
      returning id
      `,
      [userId],
    );
    const merchantId = merchantResult.rows[0].id;
    await client.query(
      `
      insert into public.merchant_team_members (
        merchant_id,
        user_id,
        role,
        status,
        display_name,
        invited_by_user_id
      ) values ($1, $2, 'owner', 'active', 'Agent Admin Writes Smoke Owner', $2)
      `,
      [merchantId, userId],
    );

    await client.query("commit");

    return {
      adminUserId: adminUser.id,
      adminSessionToken,
      userId,
      merchantId,
      merchantEmail: input.merchantEmail.trim().toLowerCase(),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function signInMerchant(input) {
  const form = new URLSearchParams();
  form.set("email", input.email);
  form.set("password", input.password);
  form.set("next", "/dashboard/consultation");

  const response = await fetch(`${input.baseUrl}/api/auth/merchant-login`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return {
    status: response.status,
    cookie: extractCookieHeader(response),
  };
}

async function getJson(input) {
  return requestJson({ ...input, method: "GET" });
}

async function postJson(input) {
  return requestJson({ ...input, method: "POST" });
}

async function patchJson(input) {
  return requestJson({ ...input, method: "PATCH" });
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
    body: parseJson(text),
  };
}

async function cleanupSmokeData(pool, input) {
  try {
    if (input.originalRouteBinding) {
      await pool.query(
        `
        insert into public.agent_route_bindings (
          route_key,
          agent_id,
          status,
          description
        ) values ('consultation_default', $1, $2, $3)
        on conflict (route_key)
        do update set agent_id = excluded.agent_id,
                      status = excluded.status,
                      description = excluded.description
        `,
        [
          input.originalRouteBinding.agent_id,
          input.originalRouteBinding.status,
          input.originalRouteBinding.description,
        ],
      );
    } else {
      await pool.query("delete from public.agent_route_bindings where route_key = 'consultation_default'");
    }

    const targetIds = [
      ...input.cleanup.agentIds,
      ...input.cleanup.skillIds,
      ...input.cleanup.knowledgeSetIds,
      ...input.cleanup.knowledgeDocumentIds,
      ...input.cleanup.routeBindingIds,
    ].filter(Boolean);

    if (targetIds.length > 0) {
      await pool.query(
        "delete from public.platform_admin_events where target_id = any($1::text[])",
        [targetIds],
      );
    }

    for (const agentId of input.cleanup.agentIds.filter(Boolean)) {
      await pool.query("delete from public.agent_configs where id = $1", [agentId]);
    }
    for (const skillId of input.cleanup.skillIds.filter(Boolean)) {
      await pool.query("delete from public.agent_skills where id = $1", [skillId]);
    }
    for (const knowledgeSetId of input.cleanup.knowledgeSetIds.filter(Boolean)) {
      await pool.query("delete from public.knowledge_sets where id = $1", [knowledgeSetId]);
    }
    for (const documentId of input.cleanup.knowledgeDocumentIds.filter(Boolean)) {
      await pool.query("delete from public.knowledge_documents where id = $1", [documentId]);
    }
    for (const merchantId of input.cleanup.merchantIds.filter(Boolean)) {
      await pool.query("delete from public.merchant_team_members where merchant_id = $1", [
        merchantId,
      ]);
      await pool.query("delete from public.merchant_profiles where id = $1", [merchantId]);
    }
    for (const userId of input.cleanup.appUserIds.filter(Boolean)) {
      await pool.query("delete from public.user_sessions where user_id = $1", [userId]);
      await pool.query("delete from public.app_users where id = $1", [userId]);
    }
    for (const adminUserId of input.cleanup.adminUserIds.filter(Boolean)) {
      await pool.query("delete from public.platform_admin_users where id = $1", [adminUserId]);
    }

    return {
      status: "ok",
      agentIds: input.cleanup.agentIds.length,
      skillIds: input.cleanup.skillIds.length,
      knowledgeSetIds: input.cleanup.knowledgeSetIds.length,
      knowledgeDocumentIds: input.cleanup.knowledgeDocumentIds.length,
      adminUserIds: input.cleanup.adminUserIds.length,
      merchantIds: input.cleanup.merchantIds.length,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Cleanup failed.",
    };
  }
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

function parseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
