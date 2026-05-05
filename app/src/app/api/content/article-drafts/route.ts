import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { generateConsultationContentSchema } from "@/server/api/schemas";
import { generateArticleDraftForUser } from "@/server/api/content-generation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = generateConsultationContentSchema.parse(await request.json());
    const draftBundle = await generateArticleDraftForUser({
      userId: user.id,
      sessionId: payload.sessionId,
      source: payload.source,
      calendarItemId: payload.calendarItemId,
      goal: payload.goal,
      extraRequirement: payload.extraRequirement,
      toneStyle: payload.toneStyle,
      mode: payload.mode,
      materialId: payload.materialId,
      materialReferenceId: payload.materialReferenceId,
      strategyTag: payload.strategyTag,
      articlePlaybook: payload.articlePlaybook,
    });

    return Response.json({ draftBundle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
