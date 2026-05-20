import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { ApiError } from "@/server/api/errors";

let pool: Pool | null = null;

export type DatabaseClient = Pick<PoolClient, "query">;

export function getAppDatabaseUrl() {
  return (
    process.env.APP_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.LOCAL_REAL_CHAIN_DB_URL?.trim() ||
    ""
  );
}

export function isAppPostgresConfigured() {
  return Boolean(getAppDatabaseUrl());
}

export function isAppPostgresPreferred() {
  return Boolean(
    process.env.APP_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_PROVIDER === "postgres" ||
      process.env.DOMESTIC_DATABASE_ENABLED === "true",
  );
}

export function getAppPostgresPool() {
  if (pool) {
    return pool;
  }

  const connectionString = getAppDatabaseUrl();
  if (!connectionString) {
    throw new ApiError(
      503,
      "APP_DATABASE_NOT_CONFIGURED",
      "APP_DATABASE_URL or DATABASE_URL is required for PostgreSQL mode.",
    );
  }

  pool = new Pool({
    connectionString,
    ssl: resolveSslConfig(),
    max: parsePositiveInt(
      process.env.APP_DATABASE_POOL_MAX ?? process.env.DATABASE_POOL_MAX,
      8,
    ),
  });

  return pool;
}

export async function queryAppDb<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  try {
    return await getAppPostgresPool().query<T>(sql, params);
  } catch (error) {
    throw mapPostgresError(error, "APP_DATABASE_QUERY_FAILED");
  }
}

export async function withAppDbTransaction<T>(
  callback: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await getAppPostgresPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw mapPostgresError(error, "APP_DATABASE_TRANSACTION_FAILED");
  } finally {
    client.release();
  }
}

export function mapPostgresError(error: unknown, code: string) {
  if (error instanceof ApiError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "PostgreSQL request failed.";
  return new ApiError(500, code, message);
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

function parsePositiveInt(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
