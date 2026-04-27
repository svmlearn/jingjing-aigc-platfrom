import { saveAgentPromptDraft } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { saveAgentPromptDraftSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = saveAgentPromptDraftSchema.parse(await request.json());
    const promptVersion = await saveAgentPromptDraft({
      agentId,
      body: payload.body,
      changeNote: payload.changeNote,
    });

    return Response.json({ promptVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
