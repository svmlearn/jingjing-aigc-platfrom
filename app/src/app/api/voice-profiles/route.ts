import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { createVoiceProfileSchema } from "@/server/api/schemas";
import {
  createVoiceProfileForUser,
  listVoiceProfilesForUser,
} from "@/server/api/voice-profile-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const voiceProfiles = await listVoiceProfilesForUser({ userId: user.id });

    return Response.json({ voiceProfiles });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createVoiceProfileSchema.parse(await request.json());
    const voiceProfile = await createVoiceProfileForUser({
      userId: user.id,
      request: payload,
    });

    return Response.json({ voiceProfile }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
