import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { mediaUploadIntentSchema } from "@/server/api/schemas";
import { createMediaUploadIntentForUser } from "@/server/api/media-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = mediaUploadIntentSchema.parse(await request.json());
    const uploadIntent = await createMediaUploadIntentForUser({
      userId: user.id,
      request: payload,
    });

    return Response.json({ uploadIntent }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
