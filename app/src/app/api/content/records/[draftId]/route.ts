import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { getContentRecordForUser } from "@/server/api/content-generation-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { draftId } = await context.params;
    const draftBundle = await getContentRecordForUser({
      userId: user.id,
      draftId,
    });

    return Response.json({ draftBundle });
  } catch (error) {
    return handleApiError(error);
  }
}
