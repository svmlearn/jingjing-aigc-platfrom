import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { createVideoChainTestDraftForUser } from "@/server/api/content-generation-service";
import { ApiError, handleApiError } from "@/server/api/errors";
import { isVideoChainTestDraftEnabled } from "@/server/api/video-chain-test-draft";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (!isVideoChainTestDraftEnabled()) {
      throw new ApiError(
        404,
        "VIDEO_CHAIN_TEST_DRAFT_DISABLED",
        "Video chain test draft entrypoint is disabled.",
      );
    }

    const user = await getAuthenticatedUser();
    const draftBundle = await createVideoChainTestDraftForUser({
      userId: user.id,
    });

    return Response.json({ draftBundle }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
