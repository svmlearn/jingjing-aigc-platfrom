import { publishAgentSoulDraft } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { publishAgentSoulSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const payload = publishAgentSoulSchema.parse(await request.json().catch(() => ({})));
    const soulVersion = await publishAgentSoulDraft({
      agentId,
      soulVersionId: payload.soulVersionId,
    });

    return Response.json({ soulVersion });
  } catch (error) {
    return handleApiError(error);
  }
}
