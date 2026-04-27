import { replaceAgentSkillBindings } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateAgentSkillBindingsSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = updateAgentSkillBindingsSchema.parse(await request.json());
    const skillBindings = await replaceAgentSkillBindings({
      agentId,
      skillIds: payload.skillIds,
    });

    return Response.json({ skillBindings });
  } catch (error) {
    return handleApiError(error);
  }
}
