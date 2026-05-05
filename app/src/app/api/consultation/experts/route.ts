import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { listConsultationExpertsForUser } from "@/server/api/consultation-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const experts = await listConsultationExpertsForUser(user.id);

    return Response.json({ experts });
  } catch (error) {
    return handleApiError(error);
  }
}
