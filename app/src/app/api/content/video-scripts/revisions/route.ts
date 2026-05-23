import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { reviseVideoScriptForUser } from "@/server/api/content-generation-service";
import { handleApiError } from "@/server/api/errors";
import { reviseVideoScriptSchema } from "@/server/api/schemas";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = reviseVideoScriptSchema.parse(await request.json());
    const result = await reviseVideoScriptForUser({
      userId: user.id,
      contentVariantId: payload.contentVariantId,
      sessionId: payload.sessionId,
      revisionInstruction: payload.revisionInstruction,
      materialId: payload.materialId,
      materialReferenceId: payload.materialReferenceId,
      strategyTag: payload.strategyTag,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
