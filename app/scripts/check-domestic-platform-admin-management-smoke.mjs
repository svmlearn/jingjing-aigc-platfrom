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
  "platform_admin_users",
  "platform_admin_sessions",
  "platform_admin_events",
  "invitation_codes",
  "merchant_profiles",
  "import_jobs",
  "content_drafts",
];
const supportingTables = ["source_items"];

loadEnvFileFromArgs();

const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const keepFixture = hasFlag("--keep-fixture");
const withLastSuperAdminGuard = hasFlag("--with-last-super-admin-guard");
const stamp = `${Date.now()}_${randomBytes(4).toString("hex")}`;

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: [...requiredTables, ...supportingTables],
  },
  direct: {},
  http: baseUrl
    ? { baseUrl, withLastSuperAdminGuard }
    : { skipped: true, reason: "base_url_missing" },
  cleanup: { skipped: true },
};

const cleanup = {
  adminUserIds: [],
  sessionIds: [],
  invitationCodeIds: [],
  merchantIds: [],
  importJobIds: [],
  sourceItemIds: [],
  contentDraftIds: [],
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

  report.direct = await runDirectDatabaseLifecycle(pool);

  if (baseUrl) {
    report.http = await runHttpLifecycle(pool, {
      baseUrl,
      withLastSuperAdminGuard,
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
    error instanceof Error ? error.message : "Platform admin management smoke failed.";
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

async function runDirectDatabaseLifecycle(pool) {
  const actor = await createAdminUser(pool, {
    email: `platform-admin-management-direct-actor-${stamp}@example.test`,
    password: `smoke-${randomBytes(12).toString("base64url")}`,
    displayName: "Platform Admin Management Direct Actor",
    role: "super_admin",
    createdByAdminId: null,
  });
  const admin = await createAdminUser(pool, {
    email: `platform-admin-management-direct-admin-${stamp}@example.test`,
    password: `smoke-${randomBytes(12).toString("base64url")}`,
    displayName: "Platform Admin Management Direct Admin",
    role: "admin",
    createdByAdminId: actor.id,
  });
  const adminSession = await createAdminSession(pool, admin.id);

  const listedAdmin = await pool.query(
    `
    select id
    from public.platform_admin_users
    where id = $1
    limit 1
    `,
    [admin.id],
  );

  await pool.query(
    `
    update public.platform_admin_users
    set display_name = $2,
        role = 'admin',
        status = 'disabled',
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [admin.id, "Platform Admin Management Direct Admin Updated"],
  );
  await pool.query(
    `
    update public.platform_admin_sessions
    set revoked_at = timezone('utc', now())
    where admin_user_id = $1
      and revoked_at is null
    `,
    [admin.id],
  );
  await insertAdminEvent(pool, {
    actorAdminId: actor.id,
    actorLabel: actor.email,
    eventType: "platform_admin_user.updated",
    targetType: "platform_admin_user",
    targetId: admin.id,
    summary: "Direct smoke updated admin user",
    details: { status: "disabled" },
  });

  const revokedSession = await pool.query(
    `
    select revoked_at
    from public.platform_admin_sessions
    where id = $1
    limit 1
    `,
    [adminSession.id],
  );

  const activeSuperCount = await countActiveSuperAdmins(pool);
  const lastSuperAdminGuard = activeSuperCount >= 1;

  const invitation = await createInvitationCode(pool, {
    code: `B5-DIRECT-${stamp}`,
    note: "Batch 5 direct smoke",
  });
  const listedInvitation = await pool.query(
    `
    select id
    from public.invitation_codes
    where code = $1
    limit 1
    `,
    [invitation.code],
  );
  await pool.query(
    `
    update public.invitation_codes
    set status = 'disabled',
        updated_at = timezone('utc', now())
    where id = $1 and status = 'active'
    `,
    [invitation.id],
  );
  await pool.query(
    `
    update public.invitation_codes
    set status = 'active',
        updated_at = timezone('utc', now())
    where id = $1 and status = 'disabled'
    `,
    [invitation.id],
  );
  await insertAdminEvent(pool, {
    actorAdminId: actor.id,
    actorLabel: actor.email,
    eventType: "invitation_code.updated",
    targetType: "invitation_code",
    targetId: invitation.id,
    summary: "Direct smoke toggled invitation code",
    details: { status: "active" },
  });

  const merchant = await createMerchantFixture(pool, {
    name: `Batch 5 Direct Merchant ${stamp}`,
  });
  const importCount = await countRowsByMerchant(pool, "import_jobs", merchant.id);
  const draftCount = await countRowsByMerchant(pool, "content_drafts", merchant.id);
  await pool.query(
    `
    update public.merchant_profiles
    set status = 'disabled',
        plan = 'plus',
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [merchant.id],
  );
  await insertAdminEvent(pool, {
    actorAdminId: actor.id,
    actorLabel: actor.email,
    eventType: "merchant.updated",
    targetType: "merchant",
    targetId: merchant.id,
    summary: "Direct smoke updated merchant status",
    details: { status: "disabled", plan: "plus" },
  });
  await pool.query(
    `
    update public.merchant_profiles
    set status = 'active',
        plan = 'free',
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [merchant.id],
  );

  const eventCount = await pool.query(
    `
    select count(*)::int as count
    from public.platform_admin_events
    where target_id = any($1::text[])
    `,
    [[admin.id, invitation.id, merchant.id]],
  );

  await pool.query(
    `
    update public.platform_admin_users
    set status = 'disabled',
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [actor.id],
  );

  const checks = {
    adminUserCreatedAndListed: listedAdmin.rowCount === 1,
    disablingAdminRevokedSessions: Boolean(revokedSession.rows[0]?.revoked_at),
    lastActiveSuperAdminGuardEvaluated: lastSuperAdminGuard,
    invitationCodeCreatedAndListed: listedInvitation.rowCount === 1,
    invitationCodeDisableReactivate: (await getInvitationStatus(pool, invitation.id)) === "active",
    merchantCounts: importCount === 1 && draftCount === 1,
    merchantUpdateRestore:
      (await getMerchantStatusPlan(pool, merchant.id)).status === "active" &&
      (await getMerchantStatusPlan(pool, merchant.id)).plan === "free",
    auditEventsWritten: Number(eventCount.rows[0]?.count ?? 0) >= 3,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function runHttpLifecycle(pool, input) {
  const actor = await createAdminUser(pool, {
    email: `platform-admin-management-http-actor-${stamp}@example.test`,
    password: `smoke-${randomBytes(12).toString("base64url")}`,
    displayName: "Platform Admin Management HTTP Actor",
    role: "super_admin",
    createdByAdminId: null,
  });
  const actorSession = await createAdminSession(pool, actor.id);
  const cookie = `${platformAdminSessionCookieName}=${actorSession.token}`;

  const adminListBefore = await getJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/admin-users",
    cookie,
  });
  const adminCreate = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/admin-users",
    cookie,
    body: {
      email: `platform-admin-management-http-admin-${stamp}@example.test`,
      password: `smoke-${randomBytes(12).toString("base64url")}`,
      displayName: "Platform Admin Management HTTP Admin",
      role: "admin",
    },
  });
  const createdAdminId = adminCreate.body?.adminUser?.id;
  if (createdAdminId) {
    cleanup.adminUserIds.push(createdAdminId);
  }
  const createdAdminSession = createdAdminId
    ? await createAdminSession(pool, createdAdminId)
    : null;
  const adminPatch = createdAdminId
    ? await patchJson({
        baseUrl: input.baseUrl,
        path: `/api/platform-admin/admin-users/${createdAdminId}`,
        cookie,
        body: {
          displayName: "Platform Admin Management HTTP Admin Updated",
          status: "disabled",
        },
      })
    : { status: 0, body: null };
  const revokedAdminSession = createdAdminSession
    ? await getSessionRevokedAt(pool, createdAdminSession.id)
    : null;

  const lastSuperAdminGuard = input.withLastSuperAdminGuard
    ? await verifyLastSuperAdminGuard(pool, {
        baseUrl: input.baseUrl,
        cookie,
        actorId: actor.id,
      })
    : { skipped: true, reason: "flag_not_set" };

  const invitationCode = `B5-HTTP-${stamp}`;
  const invitationCreate = await postJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/invitation-codes",
    cookie,
    body: {
      code: invitationCode,
      maxRedemptions: 1,
      note: "Batch 5 HTTP smoke",
    },
  });
  const invitationId = invitationCreate.body?.invitationCode?.id;
  if (invitationId) {
    cleanup.invitationCodeIds.push(invitationId);
  }
  const invitationList = await getJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/invitation-codes?q=${encodeURIComponent(invitationCode)}`,
    cookie,
  });
  const invitationDisable = invitationId
    ? await patchJson({
        baseUrl: input.baseUrl,
        path: `/api/platform-admin/invitation-codes/${invitationId}`,
        cookie,
        body: { status: "disabled" },
      })
    : { status: 0, body: null };
  const invitationReactivate = invitationId
    ? await patchJson({
        baseUrl: input.baseUrl,
        path: `/api/platform-admin/invitation-codes/${invitationId}`,
        cookie,
        body: { status: "active" },
      })
    : { status: 0, body: null };

  const merchant = await createMerchantFixture(pool, {
    name: `Batch 5 HTTP Merchant ${stamp}`,
  });
  const merchantList = await getJson({
    baseUrl: input.baseUrl,
    path: "/api/platform-admin/merchants",
    cookie,
  });
  const merchantDetail = await getJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/merchants/${merchant.id}`,
    cookie,
  });
  const merchantUpdate = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/merchants/${merchant.id}`,
    cookie,
    body: { status: "disabled", plan: "plus" },
  });
  const merchantRestore = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/merchants/${merchant.id}`,
    cookie,
    body: { status: "active", plan: "free" },
  });

  const checks = {
    adminList: adminListBefore.status === 200 && Array.isArray(adminListBefore.body?.adminUsers),
    adminCreate: adminCreate.status === 201 && Boolean(createdAdminId),
    adminPatchDisable:
      adminPatch.status === 200 && adminPatch.body?.adminUser?.status === "disabled",
    disablingAdminRevokedSessions: Boolean(revokedAdminSession),
    lastActiveSuperAdminGuard:
      lastSuperAdminGuard.skipped === true || lastSuperAdminGuard.status === "ok",
    invitationCreate: invitationCreate.status === 201 && Boolean(invitationId),
    invitationList:
      invitationList.status === 200 &&
      Array.isArray(invitationList.body?.invitationCodes) &&
      invitationList.body.invitationCodes.some((item) => item.id === invitationId),
    invitationDisable:
      invitationDisable.status === 200 &&
      invitationDisable.body?.invitationCode?.status === "disabled",
    invitationReactivate:
      invitationReactivate.status === 200 &&
      invitationReactivate.body?.invitationCode?.status === "active",
    merchantList:
      merchantList.status === 200 &&
      Array.isArray(merchantList.body?.merchants) &&
      merchantList.body.merchants.some((item) => item.id === merchant.id),
    merchantDetail:
      merchantDetail.status === 200 &&
      merchantDetail.body?.merchant?.id === merchant.id &&
      merchantDetail.body?.merchant?.totalImports === 1 &&
      merchantDetail.body?.merchant?.totalDrafts === 1,
    merchantUpdate:
      merchantUpdate.status === 200 &&
      merchantUpdate.body?.merchant?.status === "disabled" &&
      merchantUpdate.body?.merchant?.plan === "plus",
    merchantRestore:
      merchantRestore.status === 200 &&
      merchantRestore.body?.merchant?.status === "active" &&
      merchantRestore.body?.merchant?.plan === "free",
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
    lastSuperAdminGuard,
  };
}

async function verifyLastSuperAdminGuard(pool, input) {
  const activeSupers = await pool.query(
    `
    select id
    from public.platform_admin_users
    where role = 'super_admin'
      and status = 'active'
    order by created_at asc
    `,
  );
  const ids = activeSupers.rows.map((row) => row.id);

  if (ids.length !== 1 || ids[0] !== input.actorId) {
    return {
      skipped: true,
      reason: "database_has_other_active_super_admins",
      activeSuperAdminCount: ids.length,
    };
  }

  const result = await patchJson({
    baseUrl: input.baseUrl,
    path: `/api/platform-admin/admin-users/${input.actorId}`,
    cookie: input.cookie,
    body: { status: "disabled" },
  });

  return {
    status:
      result.status === 409 && result.body?.error?.code === "LAST_SUPER_ADMIN_REQUIRED"
        ? "ok"
        : "failed",
    responseStatus: result.status,
    responseCode: result.body?.error?.code ?? null,
  };
}

async function createAdminUser(pool, input) {
  const result = await pool.query(
    `
    insert into public.platform_admin_users (
      email,
      password_hash,
      display_name,
      role,
      status,
      created_by_admin_id
    ) values ($1, $2, $3, $4, 'active', $5)
    returning id, email, role, status
    `,
    [
      input.email,
      createPlatformAdminPasswordHash(input.password),
      input.displayName ?? null,
      input.role,
      input.createdByAdminId ?? null,
    ],
  );
  const user = result.rows[0];
  cleanup.adminUserIds.push(user.id);
  return user;
}

async function createAdminSession(pool, adminUserId) {
  const token = randomBytes(32).toString("base64url");
  const result = await pool.query(
    `
    insert into public.platform_admin_sessions (
      admin_user_id,
      token_hash,
      expires_at
    ) values ($1, $2, timezone('utc', now()) + interval '1 hour')
    returning id
    `,
    [adminUserId, hashSessionToken(token)],
  );
  const session = { id: result.rows[0].id, token };
  cleanup.sessionIds.push(session.id);
  return session;
}

async function createInvitationCode(pool, input) {
  const result = await pool.query(
    `
    insert into public.invitation_codes (
      code,
      max_redemptions,
      note
    ) values ($1, 1, $2)
    returning id, code, status
    `,
    [input.code, input.note ?? null],
  );
  const invitation = result.rows[0];
  cleanup.invitationCodeIds.push(invitation.id);
  return invitation;
}

async function createMerchantFixture(pool, input) {
  const merchantResult = await pool.query(
    `
    insert into public.merchant_profiles (
      name,
      industry,
      service_items,
      default_cta,
      forbidden_words,
      status,
      plan
    ) values ($1, 'smoke', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', 'free')
    returning id, name
    `,
    [input.name],
  );
  const merchant = merchantResult.rows[0];
  cleanup.merchantIds.push(merchant.id);

  const importJob = await pool.query(
    `
    insert into public.import_jobs (
      merchant_id,
      platform,
      import_type,
      input_payload,
      status
    ) values ($1, 'xiaohongshu', 'detail', '{}'::jsonb, 'succeeded')
    returning id
    `,
    [merchant.id],
  );
  cleanup.importJobIds.push(importJob.rows[0].id);

  const sourceItem = await pool.query(
    `
    insert into public.source_items (
      merchant_id,
      platform,
      source_type,
      body_text
    ) values ($1, 'xiaohongshu', 'manual_text', 'Batch 5 smoke source item')
    returning id
    `,
    [merchant.id],
  );
  cleanup.sourceItemIds.push(sourceItem.rows[0].id);

  const draft = await pool.query(
    `
    insert into public.content_drafts (
      source_item_id,
      merchant_id,
      working_title,
      input_snapshot
    ) values ($1, $2, 'Batch 5 smoke draft', '{}'::jsonb)
    returning id
    `,
    [sourceItem.rows[0].id, merchant.id],
  );
  cleanup.contentDraftIds.push(draft.rows[0].id);

  return merchant;
}

async function insertAdminEvent(pool, input) {
  await pool.query(
    `
    insert into public.platform_admin_events (
      actor_admin_id,
      actor_label,
      event_type,
      target_type,
      target_id,
      summary,
      details
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.actorAdminId ?? null,
      input.actorLabel,
      input.eventType,
      input.targetType,
      input.targetId ?? null,
      input.summary,
      JSON.stringify(input.details ?? {}),
    ],
  );
}

async function countRowsByMerchant(pool, table, merchantId) {
  const result = await pool.query(
    `
    select count(*)::int as count
    from public.${table}
    where merchant_id = $1
    `,
    [merchantId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countActiveSuperAdmins(pool) {
  const result = await pool.query(
    `
    select count(*)::int as count
    from public.platform_admin_users
    where role = 'super_admin'
      and status = 'active'
    `,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function getInvitationStatus(pool, invitationCodeId) {
  const result = await pool.query(
    "select status from public.invitation_codes where id = $1 limit 1",
    [invitationCodeId],
  );
  return result.rows[0]?.status ?? null;
}

async function getMerchantStatusPlan(pool, merchantId) {
  const result = await pool.query(
    "select status, plan from public.merchant_profiles where id = $1 limit 1",
    [merchantId],
  );
  return result.rows[0] ?? { status: null, plan: null };
}

async function getSessionRevokedAt(pool, sessionId) {
  const result = await pool.query(
    "select revoked_at from public.platform_admin_sessions where id = $1 limit 1",
    [sessionId],
  );
  return result.rows[0]?.revoked_at ?? null;
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
      ...(input.body ? { "content-type": "application/json" } : {}),
      ...(input.cookie ? { cookie: input.cookie } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
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
      "content_drafts",
      "delete from public.content_drafts where id = any($1::uuid[])",
      cleanup.contentDraftIds,
    ],
    ["source_items", "delete from public.source_items where id = any($1::uuid[])", cleanup.sourceItemIds],
    ["import_jobs", "delete from public.import_jobs where id = any($1::uuid[])", cleanup.importJobIds],
    [
      "merchant_profiles",
      "delete from public.merchant_profiles where id = any($1::uuid[])",
      cleanup.merchantIds,
    ],
    [
      "invitation_codes",
      "delete from public.invitation_codes where id = any($1::uuid[])",
      cleanup.invitationCodeIds,
    ],
    [
      "platform_admin_sessions",
      "delete from public.platform_admin_sessions where id = any($1::uuid[])",
      cleanup.sessionIds,
    ],
    [
      "platform_admin_users",
      "delete from public.platform_admin_users where id = any($1::uuid[])",
      cleanup.adminUserIds,
    ],
  ];

  for (const [name, sql, ids] of steps) {
    if (ids.length === 0) {
      continue;
    }

    try {
      await pool.query(sql, [unique(ids)]);
    } catch (error) {
      result.errors.push({
        name,
        message: error instanceof Error ? error.message : "Cleanup failed.",
      });
    }
  }

  try {
    const targetIds = unique([
      ...cleanup.adminUserIds,
      ...cleanup.invitationCodeIds,
      ...cleanup.merchantIds,
    ]);

    if (targetIds.length > 0) {
      await pool.query(
        `
        delete from public.platform_admin_events
        where target_id = any($1::text[])
           or actor_label like $2
        `,
        [targetIds, "%platform-admin-management-%"],
      );
    }
  } catch (error) {
    result.errors.push({
      name: "platform_admin_events",
      message: error instanceof Error ? error.message : "Cleanup failed.",
    });
  }

  result.status = result.errors.length === 0 ? "ok" : "partial";
  return result;
}

function createPlatformAdminPasswordHash(password) {
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
