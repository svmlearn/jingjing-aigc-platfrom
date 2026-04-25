import { createInvitationCodeSchema } from "@/server/api/schemas";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createInvitationCode } from "@/lib/db/merchant-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createInvitationCodeSchema.parse(await request.json());
    const invitationCode = await createInvitationCode({
      code: payload.code,
      maxRedemptions: payload.maxRedemptions,
      expiresAt: payload.expiresAt,
      note: payload.note,
    });

    return Response.json({ invitationCode }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
