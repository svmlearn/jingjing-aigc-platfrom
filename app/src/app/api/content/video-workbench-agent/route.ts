import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { runVideoWorkbenchScriptAgentForUser } from "@/server/api/content-generation-service";
import { handleApiError } from "@/server/api/errors";
import { runVideoWorkbenchAgentSchema } from "@/server/api/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = runVideoWorkbenchAgentSchema.parse(await request.json());
    const result = await runVideoWorkbenchScriptAgentForUser({
      userId: user.id,
      sessionId: payload.sessionId,
      dailyTaskId: payload.dailyTaskId,
      source: payload.source,
      calendarItemId: payload.calendarItemId,
      goal: payload.goal,
      userMessage: payload.userMessage,
      messages: payload.messages,
      intent: payload.intent,
      contentVariantId: payload.contentVariantId,
      draftId: payload.draftId,
      materialId: payload.materialId,
      materialReferenceId: payload.materialReferenceId,
      strategyTag: payload.strategyTag,
    });

    return Response.json(result, { status: result.toolApplied ? 201 : 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
