import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { generateConsultationContentSchema } from "@/server/api/schemas";
import { generateVideoScriptForUser } from "@/server/api/content-generation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = generateConsultationContentSchema.parse(await request.json());
    const draftBundle = await generateVideoScriptForUser({
      userId: user.id,
      sessionId: payload.sessionId,
      goal: payload.goal,
      extraRequirement: payload.extraRequirement,
    });

    return Response.json({ draftBundle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
