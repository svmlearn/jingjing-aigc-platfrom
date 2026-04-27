import { createInvitationCodeSchema } from "@/server/api/schemas";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createPlatformInvitationCode } from "@/lib/db/platform-admin-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const adminUser = await assertPlatformAdminAccess(request, { roles: ["super_admin"] });
    const payload = createInvitationCodeSchema.parse(await request.json());
    const invitationCode = await createPlatformInvitationCode({
      code: payload.code,
      maxRedemptions: payload.maxRedemptions,
      expiresAt: payload.expiresAt,
      note: payload.note,
      actorLabel: adminUser.email,
    });

    return Response.json({ invitationCode }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
