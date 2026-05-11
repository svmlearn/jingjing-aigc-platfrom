import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getDailyContentWorkspaceForUser } from "@/server/api/daily-content-task-service";
import { handleApiError } from "@/server/api/errors";
import { dailyContentTasksQuerySchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const url = new URL(request.url);
    const query = dailyContentTasksQuerySchema.parse({
      date: url.searchParams.get("date"),
    });
    const workspace = await getDailyContentWorkspaceForUser({
      userId: user.id,
      date: query.date,
    });

    return Response.json({
      project: workspace.project,
      role: workspace.role,
      today: workspace.today,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
