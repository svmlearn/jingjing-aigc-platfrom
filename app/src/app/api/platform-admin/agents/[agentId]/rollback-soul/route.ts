import { rollbackAgentSoulVersion } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { rollbackAgentSoulSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = rollbackAgentSoulSchema.parse(await request.json());
    const soulVersion = await rollbackAgentSoulVersion({
      agentId,
      soulVersionId: payload.soulVersionId,
    });

    return Response.json({ soulVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
