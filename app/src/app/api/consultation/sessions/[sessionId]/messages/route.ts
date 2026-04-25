import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { sendConsultationMessageSchema } from "@/server/api/schemas";
import { sendConsultationMessageForUser } from "@/server/api/consultation-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const payload = sendConsultationMessageSchema.parse(await request.json());
    const { sessionId } = await context.params;
    const session = await sendConsultationMessageForUser({
      userId: user.id,
      sessionId,
      content: payload.content,
    });

    return Response.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
