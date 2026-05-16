#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const sessionCookieName = "platform_admin_session";
const requiredTables = ["platform_admin_users", "platform_admin_sessions"];
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
  process.env.DOMESTIC_PLATFORM_ADMIN_SMOKE_EMAIL ||
  `platform-admin-smoke-${Date.now()}@example.test`;
const password =
  getArgValue("--password") ||
  process.env.DOMESTIC_PLATFORM_ADMIN_SMOKE_PASSWORD ||
  `smoke-${randomBytes(12).toString("base64url")}`;
const keepAdmin = hasFlag("--keep-admin");

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
let adminUserId = null;
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
    throw new Error(`Missing required platform admin tables: ${tableCheck.missingTables.join(", ")}`);
  }

  const passwordHash = createPasswordHash(password);
  report.checks.passwordHashConvention = verifyPasswordHash(password, passwordHash);

  const adminUser = await createSmokeAdmin(pool, {
    email,
    passwordHash,
  });
  adminUserId = adminUser.id;
  report.checks.adminCreated = Boolean(adminUser.id);
  report.checks.adminFound = await findAdminByEmail(pool, email);

  const session = await createSmokeSession(pool, adminUser.id);
  report.checks.sessionCreated = Boolean(session.id);

  const lookupBeforeRevoke = await lookupActiveSession(pool, session.token);
  report.checks.sessionLookupBeforeRevoke = lookupBeforeRevoke?.id === adminUser.id;

  if (baseUrl) {
    const unauthenticated = await getJson(`${baseUrl}/api/platform-admin/agents`);
    const authenticated = await getJson(`${baseUrl}/api/platform-admin/agents`, {
      Cookie: `${sessionCookieName}=${session.token}`,
    });

    report.http.unauthenticatedStatus = unauthenticated.status;
    report.http.authenticatedStatus = authenticated.status;
    report.http.authenticatedErrorCode = authenticated.body?.error?.code ?? null;
    report.http.authenticatedAgentCount = Array.isArray(authenticated.body?.agents)
      ? authenticated.body.agents.length
      : null;
  }

  await revokeSmokeSession(pool, session.token);
  report.checks.logoutInvalidated = (await lookupActiveSession(pool, session.token)) === null;

  if (baseUrl) {
    const revoked = await getJson(`${baseUrl}/api/platform-admin/agents`, {
      Cookie: `${sessionCookieName}=${session.token}`,
    });
    report.http.revokedStatus = revoked.status;
    report.http.revokedErrorCode = revoked.body?.error?.code ?? null;
  }

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.checks.passwordHashConvention === true &&
    report.checks.adminCreated === true &&
    report.checks.adminFound === true &&
    report.checks.sessionCreated === true &&
    report.checks.sessionLookupBeforeRevoke === true &&
    report.checks.logoutInvalidated === true &&
    (
      !baseUrl ||
      (
        report.http.unauthenticatedStatus === 401 &&
        report.http.authenticatedStatus === 200 &&
        report.http.revokedStatus === 401
      )
    );

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message = error instanceof Error ? error.message : "Platform admin session smoke failed.";
  exitCode = 1;
} finally {
  if (pool && adminUserId && !keepAdmin) {
    report.cleanup = await cleanupSmokeAdmin(pool, adminUserId);
  } else if (adminUserId && keepAdmin) {
    report.cleanup = { skipped: true, reason: "keep_admin" };
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

async function createSmokeAdmin(pool, input) {
  const result = await pool.query(
    `
    insert into public.platform_admin_users (
      email,
      password_hash,
      display_name,
      role,
      status
    ) values ($1, $2, $3, 'super_admin', 'active')
    returning id, email
    `,
    [input.email.trim().toLowerCase(), input.passwordHash, "Platform Admin Smoke"],
  );

  return result.rows[0];
}

async function findAdminByEmail(pool, email) {
  const result = await pool.query(
    `
    select id
    from public.platform_admin_users
    where lower(email) = lower($1)
    limit 1
    `,
    [email],
  );

  return Boolean(result.rows[0]?.id);
}

async function createSmokeSession(pool, adminUserId) {
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

  return {
    id: result.rows[0]?.id,
    token,
  };
}

async function lookupActiveSession(pool, token) {
  const result = await pool.query(
    `
    select u.id, u.email
    from public.platform_admin_sessions s
    join public.platform_admin_users u on u.id = s.admin_user_id
    where s.token_hash = $1
      and s.expires_at > timezone('utc', now())
      and s.revoked_at is null
      and u.status = 'active'
    limit 1
    `,
    [hashSessionToken(token)],
  );

  return result.rows[0] ?? null;
}

async function revokeSmokeSession(pool, token) {
  await pool.query(
    `
    update public.platform_admin_sessions
    set revoked_at = timezone('utc', now())
    where token_hash = $1
    `,
    [hashSessionToken(token)],
  );
}

async function cleanupSmokeAdmin(pool, adminUserId) {
  try {
    await pool.query("delete from public.platform_admin_users where id = $1", [adminUserId]);
    return { status: "ok", adminUserId };
  } catch (error) {
    return {
      status: "error",
      adminUserId,
      message: error instanceof Error ? error.message : "Cleanup failed.",
    };
  }
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  const text = await response.text();
  const body = parseJson(text);

  return {
    status: response.status,
    body,
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

function verifyPasswordHash(password, storedHash) {
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split("$");
  if (algorithm !== passwordHashAlgorithm || !iterationsRaw || !salt || !expected) {
    return false;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, iterations, passwordHashKeyLength, "sha256");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (expectedBuffer.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(actual, expectedBuffer);
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
