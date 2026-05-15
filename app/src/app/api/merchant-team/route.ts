import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getMerchantTeamManagementForOwner } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const team = await getMerchantTeamManagementForOwner(user.id);

    return Response.json({ team });
  } catch (error) {
    return handleApiError(error);
  }
}
