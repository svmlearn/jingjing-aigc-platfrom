import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { runNextDifyContentGenerationJob } from "@/server/api/content-generation-batch-service";
import { ApiError, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await assertWorkerAccess(request);
    const result = await runNextDifyContentGenerationJob();

    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

async function assertWorkerAccess(request: Request) {
  const secret = process.env.CONTENT_GENERATION_WORKER_SECRET?.trim();

  if (!secret) {
    await getAuthenticatedUser();
    return;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const workerSecret = request.headers.get("x-content-generation-worker-secret") ?? bearerToken;

  if (workerSecret !== secret) {
    throw new ApiError(401, "CONTENT_GENERATION_WORKER_UNAUTHORIZED", "Worker secret is invalid.");
  }
}
