import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { createVideoChainTestDraftForUser } from "@/server/api/content-generation-service";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    const draftBundle = await createVideoChainTestDraftForUser({
      userId: user.id,
    });

    return Response.json({ draftBundle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
