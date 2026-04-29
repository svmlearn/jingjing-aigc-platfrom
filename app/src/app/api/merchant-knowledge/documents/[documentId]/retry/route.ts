import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import { retryKnowledgeDocumentIngestionForMerchant } from "@/server/api/knowledge-service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const { documentId } = await context.params;
    const document = await retryKnowledgeDocumentIngestionForMerchant({
      merchantId: merchant.id,
      documentId,
    });

    return Response.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}
