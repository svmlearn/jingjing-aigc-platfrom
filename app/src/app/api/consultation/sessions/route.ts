import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import {
  createConsultationSessionSchema,
} from "@/server/api/schemas";
import {
  createConsultationSessionForUser,
  listConsultationSessionsForUser,
} from "@/server/api/consultation-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const sessions = await listConsultationSessionsForUser(user.id);

    return Response.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createConsultationSessionSchema.parse(await request.json());
    const session = await createConsultationSessionForUser({
      userId: user.id,
      title: payload.title,
    });

    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
