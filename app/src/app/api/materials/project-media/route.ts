import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { createProjectMediaMaterialForUser } from "@/server/api/material-library-service";
import { createProjectMediaMaterialSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createProjectMediaMaterialSchema.parse(await request.json());
    const material = await createProjectMediaMaterialForUser({
      userId: user.id,
      title: payload.title,
      note: payload.note,
      assetType: payload.assetType,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
    });

    return Response.json({ material }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
