import { retryKnowledgeDocumentIngestionForPlatformAdmin } from "@/server/api/knowledge-service";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { documentId } = await context.params;
    const document = await retryKnowledgeDocumentIngestionForPlatformAdmin(documentId);

    return Response.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}
