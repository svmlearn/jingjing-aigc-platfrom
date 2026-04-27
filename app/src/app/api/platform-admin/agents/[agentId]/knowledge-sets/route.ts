import { replaceAgentKnowledgeSetBindings } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateAgentKnowledgeSetBindingsSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = updateAgentKnowledgeSetBindingsSchema.parse(await request.json());
    const knowledgeSetBindings = await replaceAgentKnowledgeSetBindings({
      agentId,
      knowledgeSetIds: payload.knowledgeSetIds,
    });

    return Response.json({ knowledgeSetBindings });
  } catch (error) {
    return handleApiError(error);
  }
}
