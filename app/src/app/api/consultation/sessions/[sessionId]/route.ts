import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { getConsultationSessionForUser } from "@/server/api/consultation-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { sessionId } = await context.params;
    const session = await getConsultationSessionForUser({
      userId: user.id,
      sessionId,
    });

    return Response.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
