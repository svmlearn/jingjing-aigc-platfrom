#!/usr/bin/env node

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const requiredAliyunOssEnv = [
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_ENDPOINT",
];
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

const requireVideoChainTestEntrypoint = process.argv.includes(
  "--require-video-chain-test-entrypoint",
);
const checks = [];
const databaseUrl = firstEnv("APP_DATABASE_URL", "DATABASE_URL", "LOCAL_REAL_CHAIN_DB_URL");
checks.push({
  name: "database_url",
  status: databaseUrl.value ? "ok" : "missing",
  source: databaseUrl.name,
});

const storageProvider = process.env.STORAGE_PROVIDER?.trim() || "aliyun_oss";
checks.push({
  name: "STORAGE_PROVIDER",
  status: storageProvider === "aliyun_oss" ? "ok" : "missing",
  value: storageProvider,
});

for (const name of requiredAliyunOssEnv) {
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

const videoChainTestEntrypointEnabled =
  normalizeBooleanFlag(process.env.VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED) === true;
checks.push({
  name: "VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED",
  status: videoChainTestEntrypointEnabled
    ? "ok"
    : requireVideoChainTestEntrypoint
      ? "missing"
      : "warning",
  value: videoChainTestEntrypointEnabled ? "enabled" : "disabled",
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

function normalizeBooleanFlag(value) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}
