import { runAgentDebugTest } from "@/server/api/consultation-service";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { runAgentTestSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertPlatformAdminAccess(request);
    const payload = runAgentTestSchema.parse(await request.json());
    const result = await runAgentDebugTest(payload);

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
