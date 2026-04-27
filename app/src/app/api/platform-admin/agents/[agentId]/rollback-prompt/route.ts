import { rollbackAgentPromptVersion } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { rollbackAgentPromptSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = rollbackAgentPromptSchema.parse(await request.json());
    const promptVersion = await rollbackAgentPromptVersion({
      agentId,
      promptVersionId: payload.promptVersionId,
    });

    return Response.json({ promptVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
