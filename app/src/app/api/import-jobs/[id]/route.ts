import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { getUserImportJob } from "@/server/import-jobs/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id } = await context.params;
    const job = await getUserImportJob({
      userId: user.id,
      jobId: id,
    });

    return Response.json({ job });
  } catch (error) {
    return handleApiError(error);
  }
}
