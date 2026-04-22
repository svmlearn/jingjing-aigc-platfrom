import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getSourceItemById } from "@/lib/db/import-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getOperationalMerchantProfileByOwnerUserId(user.id);
    const { id } = await context.params;
    const sourceItem = await getSourceItemById({
      merchantId: merchant.id,
      sourceItemId: id,
    });

    return Response.json({ sourceItem });
  } catch (error) {
    return handleApiError(error);
  }
}
