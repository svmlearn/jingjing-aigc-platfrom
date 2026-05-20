import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { uploadVoiceProfileAudioForUser } from "@/server/api/voice-profile-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json(
        {
          error: {
            code: "VOICE_PROFILE_AUDIO_REQUIRED",
            message: "Voice clone reference audio is required.",
          },
        },
        { status: 400 },
      );
    }

    const voiceProfileId = readOptionalFormString(formData, "voiceProfileId");
    const displayName = readOptionalFormString(formData, "displayName") || file.name.replace(/\.[^.]+$/, "");
    const authorizationAccepted = readBooleanFormValue(formData.get("authorizationAccepted"));
    const result = await uploadVoiceProfileAudioForUser({
      userId: user.id,
      voiceProfileId,
      displayName,
      authorizationAccepted,
      file,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readBooleanFormValue(value: FormDataEntryValue | null) {
  return value === "true" || value === "1" || value === "on";
}
