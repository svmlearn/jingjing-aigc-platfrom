import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listOperationalMerchantWorkspacesByUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const workspaces = await listOperationalMerchantWorkspacesByUserId(user.id);

    return Response.json({ workspaces });
  } catch (error) {
    return handleApiError(error);
  }
}
