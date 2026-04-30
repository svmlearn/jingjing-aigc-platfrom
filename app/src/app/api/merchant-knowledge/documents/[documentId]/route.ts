import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import {
  deleteKnowledgeDocumentForMerchant,
  updateKnowledgeDocumentForMerchant,
} from "@/server/api/knowledge-service";
import { merchantKnowledgeDocumentPatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const { documentId } = await context.params;
    const payload = merchantKnowledgeDocumentPatchSchema.parse(await request.json());
    const document = await updateKnowledgeDocumentForMerchant({
      merchantId: merchant.id,
      documentId,
      title: payload.title,
      textContent: payload.textContent,
    });

    return Response.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const { documentId } = await context.params;
    await deleteKnowledgeDocumentForMerchant({
      merchantId: merchant.id,
      documentId,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
