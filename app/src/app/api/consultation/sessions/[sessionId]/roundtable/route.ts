import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { runRoundtableActionForUser } from "@/server/api/roundtable-consultation-service";
import { roundtableActionSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const payload = roundtableActionSchema.parse(await request.json());
    const { sessionId } = await context.params;
    const session = await runRoundtableActionForUser({
      userId: user.id,
      sessionId,
      action: payload.action,
    });

    return Response.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
