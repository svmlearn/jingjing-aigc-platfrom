import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import {
  createVideoEditJobSchema,
  listVideoEditJobsQuerySchema,
} from "@/server/api/schemas";
import {
  createVideoEditJobForUser,
  listVideoEditJobsForUser,
} from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = listVideoEditJobsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const jobs = await listVideoEditJobsForUser({
      userId: user.id,
      status: payload.status,
      state: payload.state,
      dailyTaskId: payload.dailyTaskId,
      contentVariantId: payload.contentVariantId,
      limit: payload.limit,
    });

    return Response.json({ jobs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createVideoEditJobSchema.parse(await request.json());
    const job = await createVideoEditJobForUser({
      userId: user.id,
      request: payload,
    });

    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
