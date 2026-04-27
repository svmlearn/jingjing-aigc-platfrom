import { updatePlatformAdminUser } from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { platformAdminUserPatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ adminUserId: string }> },
) {
  try {
    const actor = await assertPlatformAdminAccess(request, { roles: ["super_admin"] });
    const { adminUserId } = await context.params;
    const payload = platformAdminUserPatchSchema.parse(await request.json());
    const adminUser = await updatePlatformAdminUser(adminUserId, payload, actor);

    return Response.json({ adminUser });
  } catch (error) {
    return handleApiError(error);
  }
}
