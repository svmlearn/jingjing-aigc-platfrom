import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { listContentRecordsQuerySchema } from "@/server/api/schemas";
import { listContentRecordsForUser } from "@/server/api/content-generation-service";
import { listConsultationSessionsForUser } from "@/server/api/consultation-service";
import { listVideoEditJobsForUser } from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = listContentRecordsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const [sessions, draftBundles, videoJobs] = await Promise.all([
      listConsultationSessionsForUser(user.id),
      listContentRecordsForUser({
        userId: user.id,
        limit: payload.limit,
      }),
      listVideoEditJobsForUser({
        userId: user.id,
        limit: payload.limit,
      }),
    ]);

    return Response.json({
      sessions,
      draftBundles,
      videoJobs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
