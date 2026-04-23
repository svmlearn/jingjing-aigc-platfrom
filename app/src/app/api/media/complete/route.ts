import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { mediaCompleteSchema } from "@/server/api/schemas";
import { completeMediaUploadForUser } from "@/server/api/media-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = mediaCompleteSchema.parse(await request.json());
    const asset = await completeMediaUploadForUser({
      userId: user.id,
      request: payload,
    });

    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
