import { getAuthenticatedUser } from "@/lib/auth/current-user";
import {
  getMerchantProfileByOwnerUserId,
  updateMerchantProfile,
} from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import { merchantProfilePatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const merchantProfile = await getMerchantProfileByOwnerUserId(user.id);

    return Response.json({ merchantProfile });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = merchantProfilePatchSchema.parse(await request.json());
    const merchantProfile = await updateMerchantProfile(user.id, payload);

    return Response.json({ merchantProfile });
  } catch (error) {
    return handleApiError(error);
  }
}
