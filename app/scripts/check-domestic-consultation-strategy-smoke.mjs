#!/usr/bin/env node

import { pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const requiredTables = [
  "app_users",
  "merchant_profiles",
  "merchant_team_members",
  "merchant_strategy_assets",
  "consultation_sessions",
  "consultation_messages",
  "consultation_events",
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
  process.env.DOMESTIC_CONSULTATION_SMOKE_EMAIL ||
  `consultation-strategy-smoke-${Date.now()}@example.test`;
const password =
  getArgValue("--password") ||
  process.env.DOMESTIC_CONSULTATION_SMOKE_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;
const keepFixture = hasFlag("--keep-fixture");

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: requiredTables,
  },
  checks: {},
  http: baseUrl ? { baseUrl } : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

let pool = null;
let fixture = null;
let directSessionId = null;
let apiSessionId = null;
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

  fixture = await createFixture(pool, {
    email,
    password,
  });
  report.checks.fixtureCreated = Boolean(fixture.userId && fixture.merchantId);

  const strategySnapshot = buildStrategySnapshot("direct");
  const strategyAsset = await upsertStrategyAsset(pool, {
    merchantId: fixture.merchantId,
    strategySnapshot,
  });
  report.checks.strategyAssetUpserted =
    strategyAsset?.strategy_snapshot?.positioning === strategySnapshot.positioning &&
    strategyAsset?.strategy_markdown?.includes("Batch 2 strategy asset") === true;

  const directSession = await createConsultationSession(pool, {
    merchantId: fixture.merchantId,
    strategySnapshot,
  });
  directSessionId = directSession.id;
  const message = await createConsultationMessage(pool, {
    sessionId: directSession.id,
  });
  const event = await createConsultationEvent(pool, {
    sessionId: directSession.id,
    messageId: message.id,
  });
  const updatedSession = await updateConsultationSession(pool, {
    sessionId: directSession.id,
    merchantId: fixture.merchantId,
  });
  const detail = await getConsultationDetail(pool, directSession.id);
  const list = await listConsultationSessions(pool, fixture.merchantId);
  const latestPreview = await getLatestMessagePreview(pool, directSession.id);

  report.checks.directSessionCreated = Boolean(directSession.id);
  report.checks.directMessageCreated = Boolean(message.id);
  report.checks.directEventCreated = Boolean(event.id);
  report.checks.sessionUpdated = updatedSession?.summary_text === "Updated by consultation smoke";
  report.checks.detailRoundTrip =
    detail.messageCount === 1 &&
    detail.eventCount === 1 &&
    detail.strategySnapshot?.positioning === "Batch 2 updated positioning";
  report.checks.listIncludesSession = list.some((item) => item.id === directSession.id);
  report.checks.latestPreviewUpdated = latestPreview === "Direct smoke message";

  await deleteConsultationSession(pool, directSession.id, fixture.merchantId);
  directSessionId = null;
  report.checks.cascadeDelete = await verifyConsultationCascade(pool, message.id, event.id);

  if (baseUrl) {
    const login = await signIn({ baseUrl, email, password });
    report.http.loginStatus = login.status;
    report.http.cookiePresent = Boolean(login.cookie);

    const apiCreate = await postJson({
      baseUrl,
      path: "/api/consultation/sessions",
      cookie: login.cookie,
      body: {
        title: "Batch 2 API smoke consultation",
      },
    });
    apiSessionId = apiCreate.body?.session?.id ?? null;
    const apiList = await getJson({
      baseUrl,
      path: "/api/consultation/sessions",
      cookie: login.cookie,
    });
    const apiDetail = apiSessionId
      ? await getJson({
          baseUrl,
          path: `/api/consultation/sessions/${apiSessionId}`,
          cookie: login.cookie,
        })
      : { status: 0, body: null };
    const apiDelete = apiSessionId
      ? await deleteRequest({
          baseUrl,
          path: `/api/consultation/sessions/${apiSessionId}`,
          cookie: login.cookie,
        })
      : { status: 0 };

    report.http.createStatus = apiCreate.status;
    report.http.listStatus = apiList.status;
    report.http.detailStatus = apiDetail.status;
    report.http.deleteStatus = apiDelete.status;
    report.http.createdSessionMessageCount = Array.isArray(apiCreate.body?.session?.messages)
      ? apiCreate.body.session.messages.length
      : null;
    report.http.createdSessionEventCount = Array.isArray(apiCreate.body?.session?.events)
      ? apiCreate.body.session.events.length
      : null;
    report.http.listIncludesApiSession = Array.isArray(apiList.body?.sessions)
      ? apiList.body.sessions.some((session) => session.id === apiSessionId)
      : false;

    if (apiDelete.status === 204) {
      report.http.deletePersisted = !(await consultationSessionExists(pool, apiSessionId));
      apiSessionId = null;
    }
  }

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.checks.fixtureCreated === true &&
    report.checks.strategyAssetUpserted === true &&
    report.checks.directSessionCreated === true &&
    report.checks.directMessageCreated === true &&
    report.checks.directEventCreated === true &&
    report.checks.sessionUpdated === true &&
    report.checks.detailRoundTrip === true &&
    report.checks.listIncludesSession === true &&
    report.checks.latestPreviewUpdated === true &&
    report.checks.cascadeDelete === true &&
    (
      !baseUrl ||
      (
        report.http.loginStatus === 303 &&
        report.http.cookiePresent === true &&
        report.http.createStatus === 201 &&
        report.http.listStatus === 200 &&
        report.http.detailStatus === 200 &&
        report.http.deleteStatus === 204 &&
        report.http.createdSessionMessageCount >= 1 &&
        report.http.createdSessionEventCount >= 1 &&
        report.http.listIncludesApiSession === true &&
        report.http.deletePersisted === true
      )
    );

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message =
    error instanceof Error ? error.message : "Consultation strategy smoke failed.";
  exitCode = 1;
} finally {
  if (pool && fixture && !keepFixture) {
    report.cleanup = await cleanupFixture(pool, {
      ...fixture,
      directSessionId,
      apiSessionId,
    });
  } else if (fixture && keepFixture) {
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
      ) values ($1, $2, $3, 'merchant_owner', 'active')
      returning id
      `,
      [input.email.trim().toLowerCase(), createPasswordHash(input.password), "Consultation Smoke Owner"],
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
      ) values ($1, $2, 'domestic_validation', $3, 'active', 'free')
      returning id
      `,
      [userId, "Consultation Smoke Merchant", "Consultation Smoke Owner"],
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
      ) values ($1, $2, 'owner', 'active', $3, $2)
      returning id
      `,
      [merchantId, userId, "Consultation Smoke Owner"],
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

async function upsertStrategyAsset(pool, input) {
  const result = await pool.query(
    `
    insert into public.merchant_strategy_assets (
      merchant_id,
      strategy_snapshot,
      strategy_markdown,
      canonical_snapshot,
      compiled_context
    ) values ($1, $2::jsonb, $3, $2::jsonb, $4::jsonb)
    on conflict (merchant_id) do update
    set strategy_snapshot = excluded.strategy_snapshot,
        strategy_markdown = excluded.strategy_markdown,
        canonical_snapshot = excluded.canonical_snapshot,
        compiled_context = excluded.compiled_context,
        updated_at = timezone('utc', now())
    returning strategy_snapshot, strategy_markdown, canonical_snapshot, compiled_context
    `,
    [
      input.merchantId,
      JSON.stringify(input.strategySnapshot),
      "# Batch 2 strategy asset\n\nDirect smoke markdown.",
      JSON.stringify({ source: "consultation_strategy_smoke" }),
    ],
  );

  return result.rows[0];
}

async function createConsultationSession(pool, input) {
  const result = await pool.query(
    `
    insert into public.consultation_sessions (
      merchant_id,
      title,
      current_stage,
      strategy_snapshot,
      summary_text
    ) values ($1, $2, $3, $4::jsonb, $5)
    returning id
    `,
    [
      input.merchantId,
      "Direct smoke consultation",
      "direct-smoke",
      JSON.stringify(input.strategySnapshot),
      "Created by consultation smoke",
    ],
  );

  return result.rows[0];
}

async function createConsultationMessage(pool, input) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await client.query(
      `
      insert into public.consultation_messages (
        session_id,
        role,
        content,
        stage_label,
        tool_cards,
        visible_summary
      ) values ($1, 'user', $2, 'direct-smoke', $3::jsonb, $4::jsonb)
      returning id, created_at
      `,
      [
        input.sessionId,
        "Direct smoke message",
        JSON.stringify([
          {
            key: "strategy_asset",
            label: "Strategy Asset",
            summary: "Updated",
            status: "completed",
          },
        ]),
        JSON.stringify({ summary: "visible" }),
      ],
    );
    const message = result.rows[0];
    await client.query(
      `
      update public.consultation_sessions
      set last_message_at = $2,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [input.sessionId, message.created_at],
    );
    await client.query("commit");

    return message;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function createConsultationEvent(pool, input) {
  const result = await pool.query(
    `
    insert into public.consultation_events (
      session_id,
      message_id,
      event_type,
      stage_label,
      status,
      payload
    ) values ($1, $2, 'strategy_snapshot.updated', 'direct-smoke', 'completed', $3::jsonb)
    returning id
    `,
    [
      input.sessionId,
      input.messageId,
      JSON.stringify({
        source: "consultation_strategy_smoke",
        payloadRoundTrip: true,
      }),
    ],
  );

  return result.rows[0];
}

async function updateConsultationSession(pool, input) {
  const snapshot = buildStrategySnapshot("updated");
  const result = await pool.query(
    `
    update public.consultation_sessions
    set title = 'Updated smoke consultation',
        current_stage = 'updated-smoke',
        strategy_snapshot = $3::jsonb,
        summary_text = 'Updated by consultation smoke',
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
    returning id, summary_text
    `,
    [input.sessionId, input.merchantId, JSON.stringify(snapshot)],
  );

  return result.rows[0] ?? null;
}

async function getConsultationDetail(pool, sessionId) {
  const result = await pool.query(
    `
    select
      s.strategy_snapshot,
      (select count(*)::int from public.consultation_messages where session_id = s.id) as message_count,
      (select count(*)::int from public.consultation_events where session_id = s.id) as event_count
    from public.consultation_sessions s
    where s.id = $1
    limit 1
    `,
    [sessionId],
  );
  const row = result.rows[0] ?? {};

  return {
    strategySnapshot: row.strategy_snapshot ?? null,
    messageCount: row.message_count ?? 0,
    eventCount: row.event_count ?? 0,
  };
}

async function listConsultationSessions(pool, merchantId) {
  const result = await pool.query(
    `
    select id
    from public.consultation_sessions
    where merchant_id = $1
    order by last_message_at desc
    `,
    [merchantId],
  );

  return result.rows;
}

async function getLatestMessagePreview(pool, sessionId) {
  const result = await pool.query(
    `
    select content
    from public.consultation_messages
    where session_id = $1
    order by created_at desc, id desc
    limit 1
    `,
    [sessionId],
  );

  return result.rows[0]?.content ?? null;
}

async function deleteConsultationSession(pool, sessionId, merchantId) {
  await pool.query(
    `
    delete from public.consultation_sessions
    where id = $1
      and merchant_id = $2
    `,
    [sessionId, merchantId],
  );
}

async function verifyConsultationCascade(pool, messageId, eventId) {
  const result = await pool.query(
    `
    select
      (select count(*)::int from public.consultation_messages where id = $1) as messages,
      (select count(*)::int from public.consultation_events where id = $2) as events
    `,
    [messageId, eventId],
  );
  const row = result.rows[0] ?? {};

  return row.messages === 0 && row.events === 0;
}

async function consultationSessionExists(pool, sessionId) {
  if (!sessionId) {
    return false;
  }

  const result = await pool.query(
    "select 1 from public.consultation_sessions where id = $1 limit 1",
    [sessionId],
  );

  return Boolean(result.rows[0]);
}

async function cleanupFixture(pool, input) {
  try {
    if (input.directSessionId) {
      await pool.query("delete from public.consultation_sessions where id = $1", [
        input.directSessionId,
      ]);
    }
    if (input.apiSessionId) {
      await pool.query("delete from public.consultation_sessions where id = $1", [
        input.apiSessionId,
      ]);
    }
    await pool.query("delete from public.consultation_sessions where merchant_id = $1", [
      input.merchantId,
    ]);
    await pool.query("delete from public.merchant_strategy_assets where merchant_id = $1", [
      input.merchantId,
    ]);
    await pool.query("delete from public.user_sessions where user_id = $1", [input.userId]);
    await pool.query("delete from public.merchant_team_members where merchant_id = $1", [
      input.merchantId,
    ]);
    await pool.query("delete from public.merchant_profiles where id = $1", [input.merchantId]);
    await pool.query("delete from public.app_users where id = $1", [input.userId]);

    return {
      status: "ok",
      userId: input.userId,
      merchantId: input.merchantId,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Cleanup failed.",
      userId: input.userId,
      merchantId: input.merchantId,
    };
  }
}

async function signIn(input) {
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

async function deleteRequest(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "DELETE",
    headers: {
      Cookie: input.cookie,
    },
  });

  return {
    status: response.status,
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

function buildStrategySnapshot(seed) {
  return {
    positioning:
      seed === "updated" ? "Batch 2 updated positioning" : "Batch 2 direct positioning",
    coreSellingPoints: ["Durable consultation", "Self-hosted strategy asset"],
    targetAudiences: ["Self-hosted smoke merchant"],
    keyScenes: ["Consultation repository migration"],
    currentSuggestion: "Keep consultation and strategy assets durable in PostgreSQL.",
    strategyTags: ["batch2", "selfhost"],
    contentCalendarDraft: [
      {
        id: `smoke-${seed}`,
        dayLabel: "D1",
        contentType: "article",
        strategyTag: "batch2",
        title: "Consultation strategy smoke",
        summary: "Verify durable consultation strategy context.",
      },
    ],
    articleBrief: {
      workingTitle: "Consultation strategy smoke",
      angle: "Durable consultation context",
      callToAction: "Review smoke output.",
    },
    videoBrief: {
      workingTitle: "Consultation strategy smoke video",
      hook: "PostgreSQL keeps the consultation context.",
      outcome: "Session reload remains stable.",
    },
  };
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
