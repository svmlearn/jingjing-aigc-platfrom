import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listContentRecordsForUser } from "@/server/api/content-generation-service";
import { handleApiError } from "@/server/api/errors";
import { listContentRecordsQuerySchema } from "@/server/api/schemas";
import { listVideoEditJobsForUser } from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = listContentRecordsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const [draftBundles, videoJobs] = await Promise.all([
      listContentRecordsForUser({
        userId: user.id,
        limit: payload.limit,
      }),
      listVideoEditJobsForUser({
        userId: user.id,
        limit: payload.limit,
      }),
    ]);

    return Response.json({ draftBundles, videoJobs });
  } catch (error) {
    return handleApiError(error);
  }
}
