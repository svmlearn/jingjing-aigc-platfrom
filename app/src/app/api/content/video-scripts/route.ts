import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { generateConsultationContentSchema } from "@/server/api/schemas";
import { generateVideoScriptForUser } from "@/server/api/content-generation-service";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = generateConsultationContentSchema.parse(await request.json());
    const draftBundle = await generateVideoScriptForUser({
      userId: user.id,
      sessionId: payload.sessionId,
      dailyTaskId: payload.dailyTaskId,
      source: payload.source,
      calendarItemId: payload.calendarItemId,
      goal: payload.goal,
      extraRequirement: payload.extraRequirement,
      materialId: payload.materialId,
      materialReferenceId: payload.materialReferenceId,
      strategyTag: payload.strategyTag,
    });

    return Response.json({ draftBundle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
