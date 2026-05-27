import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import {
  createMaterialLibraryItemSchema,
  listMaterialLibraryQuerySchema,
} from "@/server/api/schemas";
import {
  createUploadedMaterialForUser,
  listMaterialLibraryForUser,
} from "@/server/api/material-library-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = listMaterialLibraryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const materials = await listMaterialLibraryForUser({
      userId: user.id,
      limit: payload.limit,
      retrievalTarget: payload.retrievalTarget,
      query: payload.query,
      platform: payload.platform,
      materialType: payload.materialType,
      usageType: payload.usageType,
    });

    return Response.json({ materials });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createMaterialLibraryItemSchema.parse(await request.json());
    const material = await createUploadedMaterialForUser({
      userId: user.id,
      platform: payload.platform,
      url: payload.url,
    });

    return Response.json({ material }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
