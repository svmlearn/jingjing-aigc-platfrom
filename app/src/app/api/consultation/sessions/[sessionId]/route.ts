import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import {
  deleteConsultationSessionForUser,
  getConsultationSessionForUser,
} from "@/server/api/consultation-service";

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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { sessionId } = await context.params;
    await deleteConsultationSessionForUser({
      userId: user.id,
      sessionId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
