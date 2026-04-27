import { listPlatformMerchants } from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertPlatformAdminAccess(request);
    const merchants = await listPlatformMerchants();

    return Response.json({ merchants });
  } catch (error) {
    return handleApiError(error);
  }
}
