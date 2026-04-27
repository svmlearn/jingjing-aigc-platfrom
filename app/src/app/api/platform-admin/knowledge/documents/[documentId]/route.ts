import {
  deleteKnowledgeDocumentForPlatformAdmin,
  getKnowledgeDocumentForPlatformAdmin,
} from "@/server/api/knowledge-service";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { documentId } = await context.params;
    const document = await getKnowledgeDocumentForPlatformAdmin(documentId);

    return Response.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    await assertPlatformAdminAccess(request);
    const { documentId } = await context.params;
    await deleteKnowledgeDocumentForPlatformAdmin(documentId);

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
