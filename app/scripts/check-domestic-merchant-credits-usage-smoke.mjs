#!/usr/bin/env node

import { pbkdf2Sync, randomBytes } from "node:crypto";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;
const requiredTables = [
  "merchant_credit_accounts",
  "merchant_usage_events",
  "merchant_credit_ledger",
  "merchant_profiles",
  "agent_configs",
  "app_users",
];

loadEnvFileFromArgs();

const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
const keepFixture = hasFlag("--keep-fixture");
const stamp = `${Date.now()}_${randomBytes(4).toString("hex")}`;

const report = {
  status: "failed",
  database: {
    source: databaseUrl.name,
    connected: false,
    requiredTablesPresent: false,
    missingTables: [...requiredTables],
  },
  direct: {},
  http: { skipped: true, reason: "no_safe_no_model_route_for_consultation_entitlement" },
  cleanup: { skipped: true },
};

const cleanup = {
  ledgerIds: [],
  usageEventIds: [],
  creditAccountIds: [],
  agentIds: [],
  merchantIds: [],
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

  const passed =
    report.database.connected &&
    report.database.requiredTablesPresent &&
    report.direct.status === "ok";

  report.status = passed ? "ok" : "failed";
  exitCode = passed ? 0 : 1;
} catch (error) {
  report.status = "error";
  report.message =
    error instanceof Error ? error.message : "Merchant credits usage smoke failed.";
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
  const account = await ensureCreditAccount(pool, {
    merchantId: fixture.merchantId,
    initialBalance: 3,
    reason: "batch8_initial_grant",
  });
  const secondEnsure = await ensureCreditAccount(pool, {
    merchantId: fixture.merchantId,
    initialBalance: 99,
    reason: "batch8_should_not_duplicate",
  });
  const grantLedgerRows = await listLedger(pool, {
    merchantId: fixture.merchantId,
    direction: "grant",
  });
  const reservedEvent = await recordUsageEvent(pool, {
    merchantId: fixture.merchantId,
    agentId: fixture.agentId,
    actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
    estimatedCost: 1,
    actualCost: null,
    status: "reserved",
    metadata: {
      reason: "credit_reserved_before_runtime",
      smokeStamp: stamp,
    },
  });
  const consumedEvent = await updateUsageEvent(pool, {
    usageEventId: reservedEvent.id,
    actualCost: 1,
    status: "consumed",
    metadata: {
      reservationStatus: "consumed_after_runtime_success",
      smokeStamp: stamp,
    },
  });
  const accountAfterConsume = await consumeCredits(pool, {
    merchantId: fixture.merchantId,
    creditAccountId: account.id,
    amount: 1,
    reason: "consultation_agent_message",
    relatedUsageEventId: consumedEvent.id,
  });
  const consumeLedgerRows = await listLedger(pool, {
    merchantId: fixture.merchantId,
    direction: "consume",
  });
  const insufficient = await consumeCreditsExpectingInsufficient(pool, {
    merchantId: fixture.merchantId,
    creditAccountId: account.id,
    amount: 99,
    reason: "insufficient_smoke",
    relatedUsageEventId: consumedEvent.id,
  });
  const skippedEvent = await recordUsageEvent(pool, {
    merchantId: fixture.merchantId,
    actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
    estimatedCost: 0,
    actualCost: 0,
    status: "skipped",
    metadata: {
      reason: "credit_gate_not_configured",
      smokeStamp: stamp,
    },
  });
  const failedEvent = await recordUsageEvent(pool, {
    merchantId: fixture.merchantId,
    agentId: fixture.agentId,
    actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
    estimatedCost: 1,
    actualCost: 0,
    status: "failed",
    metadata: {
      reason: "usage_compensation_required",
      smokeStamp: stamp,
    },
  });
  const crossMerchantAccount = await getCreditAccount(pool, {
    merchantId: fixture.crossMerchantId,
    creditAccountId: account.id,
  });

  const checks = {
    accountCreated:
      Boolean(account.id) &&
      account.merchant_id === fixture.merchantId &&
      account.balance === 3,
    secondEnsureSameAccount: secondEnsure.id === account.id && secondEnsure.balance === 3,
    grantLedgerOnce:
      grantLedgerRows.length === 1 &&
      grantLedgerRows[0].amount === 3 &&
      grantLedgerRows[0].direction === "grant",
    reservedUsage:
      reservedEvent.status === "reserved" &&
      reservedEvent.estimated_cost === 1 &&
      reservedEvent.actual_cost === null,
    usageUpdate:
      consumedEvent.id === reservedEvent.id &&
      consumedEvent.status === "consumed" &&
      consumedEvent.actual_cost === 1 &&
      consumedEvent.metadata?.reservationStatus === "consumed_after_runtime_success",
    consumeCredits:
      accountAfterConsume.id === account.id && accountAfterConsume.balance === 2,
    consumeLedger:
      consumeLedgerRows.length === 1 &&
      consumeLedgerRows[0].amount === 1 &&
      consumeLedgerRows[0].related_usage_event_id === consumedEvent.id,
    insufficientCredit: insufficient.code === "MERCHANT_CREDIT_INSUFFICIENT",
    skippedUsage:
      skippedEvent.status === "skipped" &&
      skippedEvent.actual_cost === 0 &&
      skippedEvent.metadata?.reason === "credit_gate_not_configured",
    failedUsage:
      failedEvent.status === "failed" &&
      failedEvent.actual_cost === 0 &&
      failedEvent.metadata?.reason === "usage_compensation_required",
    merchantScoping: crossMerchantAccount === null,
  };

  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "failed",
    checks,
  };
}

async function createFixture(pool) {
  const owner = await createUser(pool, {
    email: `credits-smoke-owner-${stamp}@example.test`,
    displayName: "Credits Smoke Owner",
  });
  const crossOwner = await createUser(pool, {
    email: `credits-smoke-cross-${stamp}@example.test`,
    displayName: "Credits Smoke Cross Owner",
  });
  const merchant = await createMerchant(pool, {
    ownerUserId: owner.id,
    name: `Credits Smoke Merchant ${stamp}`,
  });
  const crossMerchant = await createMerchant(pool, {
    ownerUserId: crossOwner.id,
    name: `Credits Smoke Cross Merchant ${stamp}`,
  });
  const agent = await createAgent(pool);

  return {
    userId: owner.id,
    crossUserId: crossOwner.id,
    merchantId: merchant.id,
    crossMerchantId: crossMerchant.id,
    agentId: agent.id,
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

async function createAgent(pool) {
  const result = await pool.query(
    `
    insert into public.agent_configs (
      agent_key,
      display_name,
      role_description,
      description,
      service_status,
      service_flags,
      model_config
    ) values ($1, $2, $3, $4, 'enabled', $5::jsonb, $6::jsonb)
    returning id
    `,
    [
      `credits_smoke_${stamp}`.replace(/[^a-z0-9_]/g, "_"),
      `Credits Smoke Agent ${stamp}`,
      "Credit accounting smoke agent",
      "Used only for merchant usage event FK checks.",
      JSON.stringify({
        systemPromptEnabled: true,
        skillsEnabled: true,
        knowledgeEnabled: false,
      }),
      JSON.stringify({ provider: "smoke" }),
    ],
  );
  const agent = result.rows[0];
  cleanup.agentIds.push(agent.id);
  return agent;
}

async function ensureCreditAccount(pool, input) {
  const initialBalance = Math.max(0, input.initialBalance ?? 0);
  const metadata = {
    createdBy: "consultation_entitlement_gate",
    reason: input.reason ?? "signup_bonus",
  };
  const insertResult = await pool.query(
    `
    insert into public.merchant_credit_accounts (
      merchant_id,
      balance,
      metadata
    ) values ($1, $2, $3::jsonb)
    on conflict (merchant_id) do nothing
    returning *
    `,
    [input.merchantId, initialBalance, JSON.stringify(metadata)],
  );

  if (insertResult.rows[0]) {
    const account = insertResult.rows[0];
    cleanup.creditAccountIds.push(account.id);

    if (initialBalance > 0) {
      await recordLedger(pool, {
        merchantId: input.merchantId,
        creditAccountId: account.id,
        direction: "grant",
        amount: initialBalance,
        reason: input.reason ?? "signup_bonus",
        metadata: {
          createdBy: "consultation_entitlement_gate",
        },
      });
    }

    return account;
  }

  const existing = await pool.query(
    `
    select *
    from public.merchant_credit_accounts
    where merchant_id = $1
    limit 1
    `,
    [input.merchantId],
  );
  return existing.rows[0] ?? null;
}

async function getCreditAccount(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.merchant_credit_accounts
    where id = $1
      and merchant_id = $2
    limit 1
    `,
    [input.creditAccountId, input.merchantId],
  );
  return result.rows[0] ?? null;
}

async function recordUsageEvent(pool, input) {
  const result = await pool.query(
    `
    insert into public.merchant_usage_events (
      merchant_id,
      action_type,
      agent_id,
      estimated_cost,
      actual_cost,
      status,
      metadata
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    returning *
    `,
    [
      input.merchantId,
      input.actionType,
      input.agentId ?? null,
      input.estimatedCost ?? null,
      input.actualCost ?? null,
      input.status,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const event = result.rows[0];
  cleanup.usageEventIds.push(event.id);
  return event;
}

async function updateUsageEvent(pool, input) {
  const result = await pool.query(
    `
    update public.merchant_usage_events
    set status = $2,
        actual_cost = case when $3::boolean then $4 else actual_cost end,
        metadata = case when $5::boolean then $6::jsonb else metadata end
    where id = $1
    returning *
    `,
    [
      input.usageEventId,
      input.status,
      input.actualCost !== undefined,
      input.actualCost ?? null,
      input.metadata !== undefined,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return result.rows[0] ?? null;
}

async function consumeCredits(pool, input) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const accountResult = await client.query(
      `
      select *
      from public.merchant_credit_accounts
      where id = $1
        and merchant_id = $2
      for update
      `,
      [input.creditAccountId, input.merchantId],
    );
    const account = accountResult.rows[0];

    if (!account) {
      throw Object.assign(new Error("Credit account not found."), {
        status: 404,
        code: "MERCHANT_CREDIT_ACCOUNT_NOT_FOUND",
      });
    }

    if (account.balance < input.amount) {
      throw Object.assign(
        new Error("当前积分不足，无法继续使用该 AI 能力。请升级会员或补充积分。"),
        { status: 402, code: "MERCHANT_CREDIT_INSUFFICIENT" },
      );
    }

    const updated = await client.query(
      `
      update public.merchant_credit_accounts
      set balance = balance - $2
      where id = $1
      returning *
      `,
      [input.creditAccountId, input.amount],
    );

    await recordLedger(client, {
      merchantId: input.merchantId,
      creditAccountId: input.creditAccountId,
      direction: "consume",
      amount: input.amount,
      reason: input.reason,
      relatedUsageEventId: input.relatedUsageEventId ?? null,
      metadata: {
        createdBy: "consultation_entitlement_gate",
      },
    });
    await client.query("commit");
    return updated.rows[0];
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function consumeCreditsExpectingInsufficient(pool, input) {
  try {
    await consumeCredits(pool, input);
    return { code: "unexpected_success" };
  } catch (error) {
    return {
      code: error?.code ?? "unknown_error",
      message: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

async function recordLedger(executor, input) {
  const result = await executor.query(
    `
    insert into public.merchant_credit_ledger (
      merchant_id,
      credit_account_id,
      direction,
      amount,
      reason,
      related_usage_event_id,
      metadata
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    returning *
    `,
    [
      input.merchantId,
      input.creditAccountId ?? null,
      input.direction,
      input.amount,
      input.reason,
      input.relatedUsageEventId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const row = result.rows[0];
  cleanup.ledgerIds.push(row.id);
  return row;
}

async function listLedger(pool, input) {
  const result = await pool.query(
    `
    select *
    from public.merchant_credit_ledger
    where merchant_id = $1
      and direction = $2
    order by created_at asc
    `,
    [input.merchantId, input.direction],
  );
  return result.rows;
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
  const tables = result.rows.map((row) => row.table_name);
  const missingTables = requiredTables.filter((table) => !tables.includes(table));

  return { missingTables };
}

async function cleanupSmokeData(pool) {
  const result = { skipped: false, errors: [] };
  const steps = [
    [
      "merchant_credit_ledger",
      "delete from public.merchant_credit_ledger where id = any($1::uuid[])",
      cleanup.ledgerIds,
    ],
    [
      "merchant_usage_events",
      "delete from public.merchant_usage_events where id = any($1::uuid[])",
      cleanup.usageEventIds,
    ],
    [
      "merchant_credit_accounts",
      "delete from public.merchant_credit_accounts where id = any($1::uuid[])",
      cleanup.creditAccountIds,
    ],
    [
      "agent_configs",
      "delete from public.agent_configs where id = any($1::uuid[])",
      cleanup.agentIds,
    ],
    [
      "merchant_profiles",
      "delete from public.merchant_profiles where id = any($1::uuid[])",
      cleanup.merchantIds,
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

function hasFlag(name) {
  return process.argv.includes(name);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function writeReport(value, code) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  process.exit(code);
}
