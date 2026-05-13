import { isAppPostgresConfigured, queryAppDb } from "@/lib/server-db/postgres";
import { getCosConfig } from "@/server/api/cos";

export const runtime = "nodejs";

export async function GET() {
  const [database, cos] = await Promise.all([checkDatabase(), checkCosConfig()]);
  const ok = database.status === "ok" && cos.status === "configured";

  return Response.json(
    {
      ok,
      app: {
        status: "ok",
        runtime: "nodejs",
      },
      database,
      cos,
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

async function checkCosConfig() {
  try {
    const config = getCosConfig();
    return {
      status: "configured",
      bucket: config.bucket,
      region: config.region,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "COS health check failed.",
    };
  }
}
