import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { receiveMerchantMediaManifestForUser } from "@/server/api/merchant-media-manifest-service";
import { merchantMediaManifestSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = merchantMediaManifestSchema.parse(await request.json());
    const result = await receiveMerchantMediaManifestForUser({
      userId: user.id,
      request: payload,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
