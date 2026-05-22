import { isAppPostgresConfigured, queryAppDb } from "@/lib/server-db/postgres";
import { getConfiguredObjectStorageProvider } from "@/server/storage";
import { defaultStorageProviderName } from "@/server/storage/object-storage";

export const runtime = "nodejs";

export async function GET() {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorageConfig()]);
  const ok = database.status === "ok" && storage.status === "configured";

  return Response.json(
    {
      ok,
      app: {
        status: "ok",
        runtime: "nodejs",
      },
      database,
      storage,
      cos: storage.provider === "tencent_cos" ? storage : undefined,
    },
    { status: ok ? 200 : 503 },
  );
}

async function checkDatabase() {
  if (!isAppPostgresConfigured()) {
    return {
      status: "error",
      provider: "postgres",
      message: "PostgreSQL environment variables are not configured.",
    };
  }

  try {
    await queryAppDb("select 1 as ok");
    return {
      status: "ok",
      provider: "postgres",
    };
  } catch (error) {
    return {
      status: "error",
      provider: "postgres",
      message: error instanceof Error ? error.message : "Database health check failed.",
    };
  }
}

async function checkStorageConfig() {
  try {
    const provider = getConfiguredObjectStorageProvider();
    const config = provider.getConfig();
    return {
      status: "configured",
      provider: config.provider,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint ?? null,
    };
  } catch (error) {
    return {
      status: "error",
      provider: process.env.STORAGE_PROVIDER?.trim() || defaultStorageProviderName,
      message: error instanceof Error ? error.message : "Object storage health check failed.",
    };
  }
}
