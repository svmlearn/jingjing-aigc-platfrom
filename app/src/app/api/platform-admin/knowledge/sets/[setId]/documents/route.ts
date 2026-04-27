import { replaceKnowledgeSetDocuments } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateKnowledgeSetDocumentsSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ setId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { setId } = await context.params;
    const payload = updateKnowledgeSetDocumentsSchema.parse(await request.json());
    const detail = await replaceKnowledgeSetDocuments({
      knowledgeSetId: setId,
      documentIds: payload.documentIds,
    });

    return Response.json({ detail });
  } catch (error) {
    return handleApiError(error);
  }
}
