import { replaceKnowledgeDocumentSets } from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateKnowledgeDocumentSetsSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { documentId } = await context.params;
    const payload = updateKnowledgeDocumentSetsSchema.parse(await request.json());
    const memberships = await replaceKnowledgeDocumentSets({
      documentId,
      knowledgeSetIds: payload.knowledgeSetIds,
    });

    return Response.json({ memberships });
  } catch (error) {
    return handleApiError(error);
  }
}
