import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { reviseArticleDraftForUser } from "@/server/api/content-generation-service";
import { handleApiError } from "@/server/api/errors";
import { reviseArticleDraftSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = reviseArticleDraftSchema.parse(await request.json());
    const result = await reviseArticleDraftForUser({
      userId: user.id,
      contentVariantId: payload.contentVariantId,
      revisionInstruction: payload.revisionInstruction,
      toneStyle: payload.toneStyle,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
