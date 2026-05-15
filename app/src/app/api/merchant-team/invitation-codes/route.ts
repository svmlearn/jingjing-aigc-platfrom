import { getAuthenticatedUser } from "@/lib/auth/current-user";
import {
  createMemberInvitationCodeForOwner,
  getMerchantTeamManagementForOwner,
} from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import { createMemberInvitationCodeSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createMemberInvitationCodeSchema.parse(await request.json());
    const invitationCode = await createMemberInvitationCodeForOwner({
      ownerUserId: user.id,
      code: payload.code,
      maxRedemptions: payload.maxRedemptions,
      expiresAt: payload.expiresAt,
      note: payload.note,
    });
    const team = await getMerchantTeamManagementForOwner(user.id);

    return Response.json({ invitationCode, team }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
