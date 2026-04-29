import { setConsultationDefaultAgent } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { agentId } = await context.params;
    const routeBinding = await setConsultationDefaultAgent({ agentId });

    return Response.json({ routeBinding });
  } catch (error) {
    return handleApiError(error);
  }
}
