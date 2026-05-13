#!/usr/bin/env node

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const requiredCosEnv = ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"];
const requiredTables = [
  "app_users",
  "user_sessions",
  "merchant_profiles",
  "merchant_team_members",
  "source_items",
  "content_drafts",
  "content_variants",
  "asset_objects",
  "video_edit_jobs",
];

loadEnvFileFromArgs();

const checks = [];
const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
checks.push({
  name: "database_url",
  status: databaseUrl.value ? "ok" : "missing",
  source: databaseUrl.name,
});

for (const name of requiredCosEnv) {
  checks.push({
    name,
    status: process.env[name]?.trim() ? "ok" : "missing",
  });
}

const provider = process.env.DATABASE_PROVIDER?.trim();
checks.push({
  name: "DATABASE_PROVIDER",
  status: provider === "postgres" || databaseUrl.value ? "ok" : "warning",
  value: provider === "postgres" ? "postgres" : provider ? "non-postgres" : "unset",
});

const database = databaseUrl.value
  ? await checkDatabase(databaseUrl.value)
  : { status: "skipped", reason: "database_url_missing" };

const failed =
  checks.some((check) => check.status === "missing") ||
  database.status !== "ok" ||
  database.requiredTablesPresent === false;

const report = {
  status: failed ? "failed" : "ok",
  checks,
  database,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;

async function checkDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: resolveSslConfig(),
    max: 1,
  });

  try {
    const selectOne = await pool.query("select 1 as ok");
    const tablesResult = await pool.query(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1)
      order by table_name
      `,
      [requiredTables],
    );
    const tables = tablesResult.rows.map((row) => row.table_name);
    const missingTables = requiredTables.filter((table) => !tables.includes(table));

    return {
      status: "ok",
      selectOne: selectOne.rows[0]?.ok === 1,
      requiredTablesPresent: missingTables.length === 0,
      missingTables,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Database check failed.",
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
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
