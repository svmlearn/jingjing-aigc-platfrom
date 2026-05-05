import { saveAgentSoulDraft } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { saveAgentSoulDraftSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = saveAgentSoulDraftSchema.parse(await request.json());
    const soulVersion = await saveAgentSoulDraft({
      agentId,
      body: payload.body,
      changeNote: payload.changeNote,
    });

    return Response.json({ soulVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
