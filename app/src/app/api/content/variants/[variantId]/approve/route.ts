import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { approveVideoScriptVariantForUser } from "@/server/api/video-edit-jobs-service";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ variantId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { variantId } = await context.params;
    const variant = await approveVideoScriptVariantForUser({
      userId: user.id,
      contentVariantId: variantId,
    });

    return Response.json({ variant });
  } catch (error) {
    return handleApiError(error);
  }
}
