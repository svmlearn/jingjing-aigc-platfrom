import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { acceptMemberInvitationCode } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import { memberInvitationAcceptSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = memberInvitationAcceptSchema.parse(await request.json());
    const workspace = await acceptMemberInvitationCode({
      code: payload.code,
      userId: user.id,
      displayName: payload.displayName,
    });

    return Response.json({ workspace }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
