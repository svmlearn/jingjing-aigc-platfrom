import {
  getKnowledgeSetDetail,
  updateKnowledgeSet,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateKnowledgeSetSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ setId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { setId } = await context.params;
    const detail = await getKnowledgeSetDetail(setId);

    return Response.json({ detail });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ setId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { setId } = await context.params;
    const payload = updateKnowledgeSetSchema.parse(await request.json());
    const knowledgeSet = await updateKnowledgeSet(setId, payload);

    return Response.json({ knowledgeSet });
  } catch (error) {
    return handleApiError(error);
  }
}
