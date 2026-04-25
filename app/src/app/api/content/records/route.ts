import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { listContentRecordsQuerySchema } from "@/server/api/schemas";
import { listContentRecordsForUser } from "@/server/api/content-generation-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = listContentRecordsQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const draftBundles = await listContentRecordsForUser({
      userId: user.id,
      limit: payload.limit,
    });

    return Response.json({ draftBundles });
  } catch (error) {
    return handleApiError(error);
  }
}
