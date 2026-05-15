import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { searchPrivateMediaPexelsForUser } from "@/server/api/private-media-pexels-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const response = await searchPrivateMediaPexelsForUser({
      userId: user.id,
      requestUrl: request.url,
      kind: "photo",
    });

    return Response.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}
