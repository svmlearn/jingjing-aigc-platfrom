import { publishAgentPromptDraft } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { publishAgentPromptSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = publishAgentPromptSchema.parse(await request.json().catch(() => ({})));
    const promptVersion = await publishAgentPromptDraft({
      agentId,
      promptVersionId: payload.promptVersionId,
    });

    return Response.json({ promptVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
