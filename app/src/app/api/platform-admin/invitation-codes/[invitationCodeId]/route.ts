import { updatePlatformInvitationCode } from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { platformAdminInvitationCodePatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invitationCodeId: string }> },
) {
  try {
    const adminUser = await assertPlatformAdminAccess(request, { roles: ["super_admin"] });
    const { invitationCodeId } = await context.params;
    const payload = platformAdminInvitationCodePatchSchema.parse(await request.json());
    const invitationCode = await updatePlatformInvitationCode(
      invitationCodeId,
      payload,
      adminUser.email,
    );

    return Response.json({ invitationCode });
  } catch (error) {
    return handleApiError(error);
  }
}
