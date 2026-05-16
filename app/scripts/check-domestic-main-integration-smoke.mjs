#!/usr/bin/env node

import { pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const { Pool } = pg;

const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const taskDate = getArgValue("--date") || new Date().toISOString().slice(0, 10);
const ownerEmail = process.env.DOMESTIC_SMOKE_EMAIL || "";
const ownerPassword = process.env.DOMESTIC_SMOKE_PASSWORD || "";
const databaseUrl =
  process.env.APP_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.LOCAL_REAL_CHAIN_DB_URL?.trim() ||
  "";

const missing = [
  ["baseUrl", baseUrl],
  ["DOMESTIC_SMOKE_EMAIL", ownerEmail],
  ["DOMESTIC_SMOKE_PASSWORD", ownerPassword],
  ["APP_DATABASE_URL", databaseUrl],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  writeReport({ status: "missing_input", missing }, 2);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: resolveSslConfig(),
  max: 1,
});

try {
  const ownerLogin = await login(ownerEmail, ownerPassword, "/dashboard/team");
  const owner = await findOwnerFixture(ownerEmail);
  const teamBefore = await requestJson("/api/merchant-team", { cookie: ownerLogin.cookie });
  const inviteCode = `CODX${Date.now().toString(36).toUpperCase()}`;
  const invitation = await requestJson("/api/merchant-team/invitation-codes", {
    method: "POST",
    cookie: ownerLogin.cookie,
    body: {
      code: inviteCode,
      maxRedemptions: 10,
      note: "selfhost main integration smoke",
    },
  });
  const member = await seedLoginableMember({
    merchantId: owner.merchant_id,
    invitedByUserId: owner.owner_user_id,
  });
  const memberLogin = await login(member.email, member.password, "/member");
  const accepted = await requestJson("/api/member/invitations/accept", {
    method: "POST",
    cookie: memberLogin.cookie,
    body: {
      code: inviteCode,
      displayName: "Main Integration Member",
    },
  });
  const teamAfter = await requestJson("/api/merchant-team", { cookie: ownerLogin.cookie });
  const batch = await requestJson("/api/content-generation/batches", {
    method: "POST",
    cookie: ownerLogin.cookie,
    body: {
      date: taskDate,
      days: 1,
      memberScope: "active_members",
      extraRequirement: "self-hosted Dify mock regression",
    },
  });

  const batchId = batch.body?.batch?.id ?? "";
  const runResults = [];
  for (let index = 0; index < 12; index += 1) {
    const result = await requestJson("/api/content-generation/jobs/run-next", {
      method: "POST",
      cookie: ownerLogin.cookie,
      body: {},
    });
    runResults.push({
      status: result.status,
      processed: result.body?.processed ?? null,
      jobStatus: result.body?.job?.status ?? null,
    });

    if (!result.body?.processed) {
      break;
    }
  }

  const memberToday = await requestJson(`/api/member/tasks/today?date=${taskDate}`, {
    cookie: memberLogin.cookie,
  });
  const batchDb = await getBatchDbSnapshot(batchId);
  const memberJob = await getMemberJobSnapshot({
    batchId,
    memberUserId: member.userId,
  });
  const report = {
    status:
      teamBefore.status === 200 &&
      invitation.status === 201 &&
      accepted.status === 201 &&
      teamAfter.status === 200 &&
      batch.status === 202 &&
      (batchDb?.succeeded_jobs ?? 0) >= 1 &&
      memberJob?.status === "succeeded" &&
      memberToday.status === 200 &&
      memberToday.body?.today?.articleTask?.generationStatus === "succeeded" &&
      memberToday.body?.today?.videoTask?.generationStatus === "succeeded"
        ? "ok"
        : "failed",
    teamBeforeStatus: teamBefore.status,
    invitationStatus: invitation.status,
    acceptStatus: accepted.status,
    teamAfterStatus: teamAfter.status,
    activeMemberCount: teamAfter.body?.team?.members?.length ?? null,
    batchStatus: batch.status,
    batchId,
    batchDb,
    runResults,
    memberJob,
    memberReadStatus: memberToday.status,
    memberArticleGenerationStatus:
      memberToday.body?.today?.articleTask?.generationStatus ?? null,
    memberVideoGenerationStatus:
      memberToday.body?.today?.videoTask?.generationStatus ?? null,
  };

  writeReport(report, report.status === "ok" ? 0 : 1);
} catch (error) {
  writeReport(
    {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Domestic main integration smoke failed.",
    },
    1,
  );
} finally {
  await pool.end();
}

async function login(email, password, next) {
  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);
  form.set("next", next);
  const response = await fetch(`${baseUrl}/api/auth/merchant-login`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const cookie = extractCookieHeader(response);

  if (response.status !== 303 || !cookie) {
    throw new Error(`Login failed for ${email}: ${response.status}`);
  }

  return {
    status: response.status,
    cookie,
  };
}

async function requestJson(path, input = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers: {
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(input.cookie ? { Cookie: input.cookie } : {}),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function findOwnerFixture(email) {
  const result = await pool.query(
    `
    select u.id as owner_user_id, mp.id as merchant_id
    from public.app_users u
    join public.merchant_profiles mp on mp.owner_user_id = u.id
    where lower(u.email) = lower($1)
    limit 1
    `,
    [email],
  );

  if (!result.rows[0]) {
    throw new Error("Owner smoke fixture is missing.");
  }

  return result.rows[0];
}

async function seedLoginableMember(input) {
  const password = randomBytes(18).toString("base64url");
  const email = `member+main-integration-${Date.now()}@example.com`;
  const userResult = await pool.query(
    `
    insert into public.app_users (
      email,
      password_hash,
      display_name,
      role,
      status
    ) values ($1, $2, $3, $4, $5)
    returning id
    `,
    [
      email,
      createPasswordHash(password),
      "Main Integration Member",
      "merchant_member",
      "active",
    ],
  );
  const userId = userResult.rows[0].id;

  await pool.query(
    `
    insert into public.merchant_team_members (
      merchant_id,
      user_id,
      role,
      status,
      display_name,
      invited_by_user_id
    ) values ($1, $2, $3, $4, $5, $6)
    on conflict (user_id) do update set
      merchant_id = excluded.merchant_id,
      role = excluded.role,
      status = excluded.status,
      display_name = excluded.display_name,
      invited_by_user_id = excluded.invited_by_user_id,
      updated_at = timezone('utc', now())
    `,
    [
      input.merchantId,
      userId,
      "member",
      "active",
      "Main Integration Member",
      input.invitedByUserId,
    ],
  );

  return { email, password, userId };
}

async function getBatchDbSnapshot(batchId) {
  if (!batchId) {
    return null;
  }

  const result = await pool.query(
    `
    select status, total_jobs, succeeded_jobs, failed_jobs, running_jobs
    from public.content_generation_batches
    where id = $1
    limit 1
    `,
    [batchId],
  );

  return result.rows[0] ?? null;
}

async function getMemberJobSnapshot(input) {
  if (!input.batchId) {
    return null;
  }

  const result = await pool.query(
    `
    select id, status, content_draft_id, article_variant_id, video_variant_id
    from public.content_generation_jobs
    where batch_id = $1 and member_user_id = $2
    limit 1
    `,
    [input.batchId, input.memberUserId],
  );

  return result.rows[0] ?? null;
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  const derived = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url");

  return `pbkdf2_sha256$210000$${salt}$${derived}`;
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

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
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

function writeReport(report, exitCode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(exitCode);
}
