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
  "platform_settings",
  "platform_admin_events",
  "platform_admin_users",
  "platform_admin_sessions",
  "agent_configs",
  "agent_prompt_versions",
  "agent_soul_versions",
  "agent_skills",
  "agent_skill_bindings",
  "knowledge_sets",
  "knowledge_set_documents",
  "agent_knowledge_set_bindings",
  "agent_route_bindings",
  "agent_test_runs",
  "agent_runtime_snapshots",
  "app_users",
  "merchant_profiles",
  "merchant_team_members",
  "consultation_sessions",
  "consultation_events",
  "knowledge_documents",
];

loadEnvFileFromArgs();

const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const withSettingsApiUpdate = hasFlag("--with-settings-api-update");
const keepFixture = hasFlag("--keep-fixture");
const adminEmail =
  getArgValue("--admin-email") ||
  process.env.DOMESTIC_AGENT_RUNTIME_ADMIN_EMAIL ||
  `agent-runtime-admin-${Date.now()}@example.test`;
const adminPassword =
  getArgValue("--admin-password") ||
  process.env.DOMESTIC_AGENT_RUNTIME_ADMIN_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;
const merchantEmail =
  getArgValue("--merchant-email") ||
  process.env.DOMESTIC_AGENT_RUNTIME_MERCHANT_EMAIL ||
  `agent-runtime-merchant-${Date.now()}@example.test`;
const merchantPassword =
  getArgValue("--merchant-password") ||
  process.env.DOMESTIC_AGENT_RUNTIME_MERCHANT_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: requiredTables,
  },
  checks: {},
  http: baseUrl ? { baseUrl, withSettingsApiUpdate } : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

let pool = null;
let originalConsultationAgentSetting = null;
let fixture = null;
const runtimeSnapshotIds = [];
const agentTestRunIds = [];
const knowledgeDocumentIds = [];
const consultationSessionIds = [];
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

  const platformSettings = await loadPlatformSettings(pool);
  originalConsultationAgentSetting = platformSettings.consultation_agent;
  report.checks.platformSettingsSeeded =
    typeof platformSettings.consultation_agent?.systemPrompt === "string" &&
    platformSettings.consultation_agent.systemPrompt.length > 0 &&
    Number.isFinite(platformSettings.knowledge_runtime?.retrievalTopK);

  const restoredDirectSetting = await updateAndRestoreConsultationAgentSetting(pool, {
    original: originalConsultationAgentSetting,
  });
  report.checks.directSettingsUpdateRestore = restoredDirectSetting === true;

  const agent = await getSeededAgent(pool);
  const routeBinding = await getConsultationRouteBinding(pool);
  const activePrompt = await getActivePrompt(pool, agent.id);
  const activeSoul = await getActiveSoul(pool, agent.id);
  const knowledgeSet = await getBaseKnowledgeSet(pool);
  const knowledgeSetBinding = await getAgentKnowledgeSetBinding(pool, {
    agentId: agent.id,
    knowledgeSetId: knowledgeSet.id,
  });
  const platformDocument = await createPlatformKnowledgeDocument(pool, {
    adminUserId: null,
  });
  knowledgeDocumentIds.push(platformDocument.id);
  const setDocument = await attachDocumentToKnowledgeSet(pool, {
    knowledgeSetId: knowledgeSet.id,
    documentId: platformDocument.id,
  });

  report.checks.seededAgent =
    agent.agent_key === "initial_consultation_agent" &&
    agent.service_status === "enabled";
  report.checks.seededRouteBinding =
    routeBinding?.route_key === "consultation_default" &&
    routeBinding.status === "active" &&
    routeBinding.agent_id === agent.id;
  report.checks.activePromptSoul =
    activePrompt?.status === "active" &&
    activePrompt.agent_id === agent.id &&
    activeSoul?.status === "active" &&
    activeSoul.agent_id === agent.id;
  report.checks.knowledgeSetBinding =
    knowledgeSet?.set_key === "base_platform_knowledge" &&
    knowledgeSetBinding?.status === "enabled" &&
    setDocument?.document_id === platformDocument.id;

  const runtimeSnapshot = await insertRuntimeSnapshot(pool, {
    agentId: agent.id,
    promptVersionId: activePrompt.id,
    knowledgeSetId: knowledgeSet.id,
  });
  runtimeSnapshotIds.push(runtimeSnapshot.id);
  report.checks.runtimeSnapshotInserted =
    runtimeSnapshot.agent_id === agent.id &&
    Array.isArray(runtimeSnapshot.knowledge_set_ids) &&
    runtimeSnapshot.knowledge_set_ids.includes(knowledgeSet.id);

  const directTestRun = await insertAgentTestRun(pool, {
    agentId: agent.id,
    promptVersionId: activePrompt.id,
    knowledgeSetId: knowledgeSet.id,
  });
  agentTestRunIds.push(directTestRun.id);
  report.checks.directTestRunInserted =
    directTestRun.agent_id === agent.id &&
    directTestRun.status === "succeeded" &&
    Array.isArray(directTestRun.knowledge_set_ids) &&
    directTestRun.knowledge_set_ids.includes(knowledgeSet.id);

  if (baseUrl) {
    fixture = await createHttpFixture(pool, {
      adminEmail,
      adminPassword,
      merchantEmail,
      merchantPassword,
    });
    const adminCookie = `${platformAdminSessionCookieName}=${fixture.adminSessionToken}`;
    const settingsGet = await getJson({
      baseUrl,
      path: "/api/platform-admin/settings",
      cookie: adminCookie,
    });
    const agentsGet = await getJson({
      baseUrl,
      path: "/api/platform-admin/agents",
      cookie: adminCookie,
    });
    const apiAgent = Array.isArray(agentsGet.body?.agents)
      ? agentsGet.body.agents.find((item) => item.agentKey === "initial_consultation_agent")
      : null;
    const agentDetail = apiAgent
      ? await getJson({
          baseUrl,
          path: `/api/platform-admin/agents/${apiAgent.id}`,
          cookie: adminCookie,
        })
      : { status: 0, body: null };
    const knowledgeSetDetail = await getJson({
      baseUrl,
      path: `/api/platform-admin/knowledge/sets/${knowledgeSet.id}`,
      cookie: adminCookie,
    });
    const settingsUpdate = withSettingsApiUpdate
      ? await updateAndRestoreSettingsThroughApi({
          baseUrl,
          cookie: adminCookie,
          settings: settingsGet.body?.settings,
        })
      : { skipped: true };

    const merchantLogin = await signInMerchant({
      baseUrl,
      email: fixture.merchantEmail,
      password: merchantPassword,
    });
    const expertsGet = await getJson({
      baseUrl,
      path: "/api/consultation/experts",
      cookie: merchantLogin.cookie,
    });
    const createSession = await postJson({
      baseUrl,
      path: "/api/consultation/sessions",
      cookie: merchantLogin.cookie,
      body: {
        title: "Agent Runtime Smoke Consultation",
      },
    });
    const apiSessionId = createSession.body?.session?.id ?? null;
    if (apiSessionId) {
      consultationSessionIds.push(apiSessionId);
    }
    const sessionAgentContainer = Array.isArray(createSession.body?.session?.events)
      ? createSession.body.session.events.find((event) => event.eventType === "session.created")
          ?.payload?.agentContainer
      : null;
    const debugRun = await postJson({
      baseUrl,
      path: "/api/platform-admin/agents/test-runs",
      cookie: adminCookie,
      body: {
        agentId: agent.id,
        merchantId: fixture.merchantId,
        inputMessage: "Agent runtime smoke without real model dependency.",
      },
    });
    const debugTestRunId = debugRun.body?.testRun?.id ?? null;
    if (debugTestRunId) {
      agentTestRunIds.push(debugTestRunId);
    }

    report.http.settingsGetStatus = settingsGet.status;
    report.http.settingsSystemPromptPresent =
      typeof settingsGet.body?.settings?.consultationAgent?.systemPrompt === "string";
    report.http.agentsStatus = agentsGet.status;
    report.http.agentCount = Array.isArray(agentsGet.body?.agents)
      ? agentsGet.body.agents.length
      : null;
    report.http.routeBindingCount = Array.isArray(agentsGet.body?.routeBindings)
      ? agentsGet.body.routeBindings.length
      : null;
    report.http.agentDetailStatus = agentDetail.status;
    report.http.agentDetailHasActivePrompt =
      agentDetail.body?.detail?.activePromptVersion?.status === "active";
    report.http.agentDetailHasActiveSoul =
      agentDetail.body?.detail?.activeSoulVersion?.status === "active";
    report.http.agentDetailKnowledgeBindings = Array.isArray(
      agentDetail.body?.detail?.knowledgeSetBindings,
    )
      ? agentDetail.body.detail.knowledgeSetBindings.length
      : null;
    report.http.knowledgeSetDetailStatus = knowledgeSetDetail.status;
    report.http.knowledgeSetDetailIncludesDocument = Array.isArray(
      knowledgeSetDetail.body?.detail?.documentIds,
    )
      ? knowledgeSetDetail.body.detail.documentIds.includes(platformDocument.id)
      : false;
    report.http.settingsApiUpdate = settingsUpdate;
    report.http.merchantLoginStatus = merchantLogin.status;
    report.http.merchantCookiePresent = Boolean(merchantLogin.cookie);
    report.http.expertsStatus = expertsGet.status;
    report.http.defaultExpertPresent = Array.isArray(expertsGet.body?.experts)
      ? expertsGet.body.experts.some(
          (expert) => expert.agentKey === "initial_consultation_agent" && expert.isDefault,
        )
      : false;
    report.http.createConsultationStatus = createSession.status;
    report.http.consultationAgentContainerPresent =
      sessionAgentContainer?.agentKey === "initial_consultation_agent" &&
      sessionAgentContainer.activePromptVersion === 1;
    report.http.debugRunStatus = debugRun.status;
    report.http.debugRunPersisted = Boolean(debugTestRunId);
    report.http.debugRunAgentContainerPresent =
      debugRun.body?.agentContainer?.agentKey === "initial_consultation_agent";
  }

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.checks.platformSettingsSeeded === true &&
    report.checks.directSettingsUpdateRestore === true &&
    report.checks.seededAgent === true &&
    report.checks.seededRouteBinding === true &&
    report.checks.activePromptSoul === true &&
    report.checks.knowledgeSetBinding === true &&
    report.checks.runtimeSnapshotInserted === true &&
    report.checks.directTestRunInserted === true &&
    (
      !baseUrl ||
      (
        report.http.settingsGetStatus === 200 &&
        report.http.settingsSystemPromptPresent === true &&
        report.http.agentsStatus === 200 &&
        report.http.agentCount >= 1 &&
        report.http.routeBindingCount >= 1 &&
        report.http.agentDetailStatus === 200 &&
        report.http.agentDetailHasActivePrompt === true &&
        report.http.agentDetailHasActiveSoul === true &&
        report.http.agentDetailKnowledgeBindings >= 1 &&
        report.http.knowledgeSetDetailStatus === 200 &&
        report.http.knowledgeSetDetailIncludesDocument === true &&
        (!withSettingsApiUpdate || report.http.settingsApiUpdate?.status === "ok") &&
        report.http.merchantLoginStatus === 303 &&
        report.http.merchantCookiePresent === true &&
        report.http.expertsStatus === 200 &&
        report.http.defaultExpertPresent === true &&
        report.http.createConsultationStatus === 201 &&
        report.http.consultationAgentContainerPresent === true &&
        report.http.debugRunStatus === 201 &&
        report.http.debugRunPersisted === true &&
        report.http.debugRunAgentContainerPresent === true
      )
    );

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message = error instanceof Error ? error.message : "Agent runtime smoke failed.";
  exitCode = 1;
} finally {
  if (pool && originalConsultationAgentSetting) {
    await restoreConsultationAgentSetting(pool, originalConsultationAgentSetting).catch(
      () => undefined,
    );
  }

  if (pool && !keepFixture) {
    report.cleanup = await cleanupSmokeData(pool, {
      fixture,
      runtimeSnapshotIds,
      agentTestRunIds,
      knowledgeDocumentIds,
      consultationSessionIds,
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

async function loadPlatformSettings(pool) {
  const result = await pool.query(
    `
    select key, value
    from public.platform_settings
    where key in (
      'llm_runtime',
      'import_runtime',
      'membership_plans',
      'consultation_agent',
      'script_production_agent',
      'knowledge_runtime'
    )
    `,
  );
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value ?? {};
  }

  return settings;
}

async function updateAndRestoreConsultationAgentSetting(pool, input) {
  const next = {
    ...input.original,
    smokeMarker: `agent-runtime-smoke-${Date.now()}`,
  };
  await pool.query(
    `
    update public.platform_settings
    set value = $2::jsonb,
        updated_at = timezone('utc', now())
    where key = $1
    `,
    ["consultation_agent", JSON.stringify(next)],
  );
  const updated = await loadPlatformSettings(pool);
  await restoreConsultationAgentSetting(pool, input.original);
  const restored = await loadPlatformSettings(pool);

  return (
    updated.consultation_agent?.smokeMarker === next.smokeMarker &&
    restored.consultation_agent?.smokeMarker === undefined
  );
}

async function restoreConsultationAgentSetting(pool, original) {
  await pool.query(
    `
    update public.platform_settings
    set value = $2::jsonb,
        updated_at = timezone('utc', now())
    where key = $1
    `,
    ["consultation_agent", JSON.stringify(original)],
  );
}

async function getSeededAgent(pool) {
  const result = await pool.query(
    `
    select *
    from public.agent_configs
    where agent_key = 'initial_consultation_agent'
    limit 1
    `,
  );

  if (!result.rows[0]) {
    throw new Error("Seeded initial consultation agent was not found.");
  }

  return result.rows[0];
}

async function getConsultationRouteBinding(pool) {
  const result = await pool.query(
    `
    select *
    from public.agent_route_bindings
    where route_key = 'consultation_default'
    limit 1
    `,
  );

  return result.rows[0] ?? null;
}

async function getActivePrompt(pool, agentId) {
  const result = await pool.query(
    `
    select *
    from public.agent_prompt_versions
    where agent_id = $1
      and status = 'active'
    limit 1
    `,
    [agentId],
  );

  return result.rows[0] ?? null;
}

async function getActiveSoul(pool, agentId) {
  const result = await pool.query(
    `
    select *
    from public.agent_soul_versions
    where agent_id = $1
      and status = 'active'
    limit 1
    `,
    [agentId],
  );

  return result.rows[0] ?? null;
}

async function getBaseKnowledgeSet(pool) {
  const result = await pool.query(
    `
    select *
    from public.knowledge_sets
    where set_key = 'base_platform_knowledge'
    limit 1
    `,
  );

  if (!result.rows[0]) {
    throw new Error("Seeded base platform knowledge set was not found.");
  }

  return result.rows[0];
}

async function getAgentKnowledgeSetBinding(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.agent_knowledge_set_bindings
    where agent_id = $1
      and knowledge_set_id = $2
    limit 1
    `,
    [input.agentId, input.knowledgeSetId],
  );

  return result.rows[0] ?? null;
}

async function createPlatformKnowledgeDocument(pool, input) {
  const result = await pool.query(
    `
    insert into public.knowledge_documents (
      scope,
      title,
      source_name,
      document_kind,
      content_kind,
      status,
      summary_text,
      metadata,
      created_by_admin_id
    ) values (
      'platform',
      'Agent Runtime Smoke Platform Knowledge',
      'agent-runtime-smoke.md',
      'seed',
      'platform_method',
      'indexed',
      'Agent runtime smoke platform knowledge.',
      $1::jsonb,
      $2
    )
    returning id
    `,
    [
      JSON.stringify({
        seedKey: `agent-runtime-smoke-${Date.now()}-${randomBytes(4).toString("hex")}`,
      }),
      input.adminUserId ?? null,
    ],
  );

  return result.rows[0];
}

async function attachDocumentToKnowledgeSet(pool, input) {
  const result = await pool.query(
    `
    insert into public.knowledge_set_documents (
      knowledge_set_id,
      document_id
    ) values ($1, $2)
    on conflict (knowledge_set_id, document_id) do nothing
    returning id, knowledge_set_id, document_id
    `,
    [input.knowledgeSetId, input.documentId],
  );

  return result.rows[0] ?? { knowledge_set_id: input.knowledgeSetId, document_id: input.documentId };
}

async function insertRuntimeSnapshot(pool, input) {
  const result = await pool.query(
    `
    insert into public.agent_runtime_snapshots (
      agent_id,
      prompt_version_id,
      candidate_skill_ids,
      actual_skill_ids,
      knowledge_set_ids,
      knowledge_match_ids,
      memory_match_ids,
      tool_call_summary,
      model
    ) values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9)
    returning id, agent_id, prompt_version_id, knowledge_set_ids
    `,
    [
      input.agentId,
      input.promptVersionId,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([input.knowledgeSetId]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({ source: "agent_runtime_smoke" }),
      "agent-runtime-smoke-model",
    ],
  );

  return result.rows[0];
}

async function insertAgentTestRun(pool, input) {
  const result = await pool.query(
    `
    insert into public.agent_test_runs (
      agent_id,
      input_message,
      prompt_version_id,
      candidate_skill_ids,
      actual_skill_ids,
      knowledge_set_ids,
      knowledge_match_ids,
      memory_match_ids,
      tool_summary,
      assistant_output,
      status,
      model
    ) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, 'succeeded', $11)
    returning id, agent_id, status, knowledge_set_ids
    `,
    [
      input.agentId,
      "Direct agent runtime smoke.",
      input.promptVersionId,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([input.knowledgeSetId]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({ source: "agent_runtime_smoke" }),
      "Direct agent runtime smoke output.",
      "agent-runtime-smoke-model",
    ],
  );

  return result.rows[0];
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
      ) values ($1, $2, 'Agent Runtime Smoke Admin', 'super_admin', 'active')
      returning id, email
      `,
      [input.adminEmail.trim().toLowerCase(), createPasswordHash(input.adminPassword)],
    );
    const adminUser = adminResult.rows[0];
    const sessionResult = await client.query(
      `
      insert into public.platform_admin_sessions (
        admin_user_id,
        token_hash,
        expires_at
      ) values ($1, $2, timezone('utc', now()) + interval '1 hour')
      returning id
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
      ) values ($1, $2, 'Agent Runtime Smoke Owner', 'merchant_owner', 'active')
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
      ) values ($1, 'Agent Runtime Smoke Merchant', 'domestic_validation', 'Agent Runtime Smoke Owner', 'active', 'free')
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
      ) values ($1, $2, 'owner', 'active', 'Agent Runtime Smoke Owner', $2)
      returning id
      `,
      [merchantId, userId],
    );

    await client.query("commit");

    return {
      adminUserId: adminUser.id,
      adminSessionId: sessionResult.rows[0].id,
      adminSessionToken,
      userId,
      merchantId,
      teamMemberId: memberResult.rows[0].id,
      merchantEmail: input.merchantEmail.trim().toLowerCase(),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function updateAndRestoreSettingsThroughApi(input) {
  if (!input.settings?.consultationAgent) {
    return { status: "skipped", reason: "settings_missing" };
  }

  const original = input.settings.consultationAgent;
  const next = {
    ...original,
    maxRounds: original.maxRounds === 6 ? 5 : 6,
  };
  const update = await putJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/settings",
    cookie: input.cookie,
    body: {
      consultationAgent: next,
    },
  });
  const restore = await putJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/settings",
    cookie: input.cookie,
    body: {
      consultationAgent: original,
    },
  });

  return {
    status: update.status === 200 && restore.status === 200 ? "ok" : "failed",
    updateStatus: update.status,
    restoreStatus: restore.status,
    updatedMaxRounds: update.body?.settings?.consultationAgent?.maxRounds ?? null,
    restoredMaxRounds: restore.body?.settings?.consultationAgent?.maxRounds ?? null,
  };
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

async function putJson(input) {
  return requestJson({ ...input, method: "PUT" });
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
    for (const sessionId of input.consultationSessionIds.filter(Boolean)) {
      await pool.query("delete from public.consultation_sessions where id = $1", [sessionId]);
    }

    for (const testRunId of input.agentTestRunIds.filter(Boolean)) {
      await pool.query("delete from public.platform_admin_events where target_id = $1", [
        testRunId,
      ]);
      await pool.query("delete from public.agent_test_runs where id = $1", [testRunId]);
    }

    for (const snapshotId of input.runtimeSnapshotIds.filter(Boolean)) {
      await pool.query("delete from public.agent_runtime_snapshots where id = $1", [
        snapshotId,
      ]);
    }

    for (const documentId of input.knowledgeDocumentIds.filter(Boolean)) {
      await pool.query("delete from public.knowledge_documents where id = $1", [documentId]);
    }

    if (input.fixture) {
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
      await pool.query("delete from public.platform_admin_users where id = $1", [
        input.fixture.adminUserId,
      ]);
    }

    return {
      status: "ok",
      runtimeSnapshotIds: input.runtimeSnapshotIds.length,
      agentTestRunIds: input.agentTestRunIds.length,
      knowledgeDocumentIds: input.knowledgeDocumentIds.length,
      adminUserId: input.fixture?.adminUserId ?? null,
      merchantId: input.fixture?.merchantId ?? null,
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
