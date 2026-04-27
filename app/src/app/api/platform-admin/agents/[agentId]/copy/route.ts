import { copyAgentConfig } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { copyAgentSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = copyAgentSchema.parse(await request.json());
    const detail = await copyAgentConfig(agentId, payload);

    return Response.json({ detail }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
