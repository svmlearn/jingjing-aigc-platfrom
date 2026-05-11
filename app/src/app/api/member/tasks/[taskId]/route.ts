import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getDailyContentTaskForUser } from "@/server/api/daily-content-task-service";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { taskId } = await context.params;
    const task = await getDailyContentTaskForUser({
      userId: user.id,
      dailyTaskId: taskId,
    });

    return Response.json({ task });
  } catch (error) {
    return handleApiError(error);
  }
}
