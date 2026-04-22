import {
  createPlatformInvitationCode,
  listPlatformInvitationCodes,
} from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createInvitationCodeSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const invitationCodes = await listPlatformInvitationCodes();

    return Response.json({ invitationCodes });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createInvitationCodeSchema.parse(await request.json());
    const invitationCode = await createPlatformInvitationCode({
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
