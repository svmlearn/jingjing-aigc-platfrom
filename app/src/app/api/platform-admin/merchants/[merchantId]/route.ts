import {
  getPlatformMerchantById,
  updatePlatformMerchant,
} from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { platformAdminMerchantPatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { merchantId } = await context.params;
    const merchant = await getPlatformMerchantById(merchantId);

    return Response.json({ merchant });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { merchantId } = await context.params;
    const payload = platformAdminMerchantPatchSchema.parse(await request.json());
    const merchant = await updatePlatformMerchant(merchantId, payload);

    return Response.json({ merchant });
  } catch (error) {
    return handleApiError(error);
  }
}
