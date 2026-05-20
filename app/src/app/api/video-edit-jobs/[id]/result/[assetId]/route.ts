import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { getVideoEditJobResultAssetRedirectUrlForUser } from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { id, assetId } = await context.params;
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "attachment"
        ? "attachment"
        : "inline";
    const redirectUrl = await getVideoEditJobResultAssetRedirectUrlForUser({
      userId: user.id,
      jobId: id,
      assetId,
      disposition,
    });

    return Response.redirect(redirectUrl, 307);
  } catch (error) {
    return handleApiError(error);
  }
}
