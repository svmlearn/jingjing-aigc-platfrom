import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { getVideoEditJobResultAssetRedirectUrlForUser } from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id, assetId } = await context.params;
    const redirectUrl = await getVideoEditJobResultAssetRedirectUrlForUser({
      userId: user.id,
      jobId: id,
      assetId,
    });

    return Response.redirect(redirectUrl, 307);
  } catch (error) {
    return handleApiError(error);
  }
}
