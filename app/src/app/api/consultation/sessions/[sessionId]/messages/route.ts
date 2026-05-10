import { after } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { isSupabasePublicConfigured } from "@/lib/supabase/server";
import { handleApiError } from "@/server/api/errors";
import { sendConsultationMessageSchema } from "@/server/api/schemas";
import {
  enqueueConsultationMessageForUser,
  processQueuedConsultationMessageForUser,
} from "@/server/api/consultation-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const payload = sendConsultationMessageSchema.parse(await request.json());
    const { sessionId } = await context.params;
    const queued = await enqueueConsultationMessageForUser({
      userId: user.id,
      sessionId,
      content: payload.content,
    });

    if (queued.processing && !isSupabasePublicConfigured()) {
      const session = await processQueuedConsultationMessageForUser({
        userId: user.id,
        sessionId,
        userMessageId: queued.processing.userMessageId,
        entitlement: queued.processing.entitlement,
      });

      return Response.json({
        session,
        processing: {
          status: "completed",
          userMessageId: queued.processing.userMessageId,
        },
      });
    }

    if (queued.processing) {
      const { userMessageId, entitlement } = queued.processing;

      after(() =>
        processQueuedConsultationMessageForUser({
          userId: user.id,
          sessionId,
          userMessageId,
          entitlement,
        }).catch((error) => {
          console.error("Async consultation message processing failed", error);
        }),
      );
    }

    return Response.json(
      {
        session: queued.session,
        processing: queued.processing
          ? {
              status: queued.processing.status,
              userMessageId: queued.processing.userMessageId,
            }
          : null,
      },
      { status: queued.processing ? 202 : 200 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
