import {
  getAgentConfigDetail,
  updateAgentConfig,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateAgentConfigSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const detail = await getAgentConfigDetail(agentId);

    return Response.json({ detail });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = updateAgentConfigSchema.parse(await request.json());
    const agent = await updateAgentConfig(agentId, payload);

    return Response.json({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}
