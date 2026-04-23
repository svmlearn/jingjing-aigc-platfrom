import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { platformSettingsUpdateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const settings = await getPlatformSettings();

    return Response.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = platformSettingsUpdateSchema.parse(await request.json());
    const settings = await updatePlatformSettings(payload);

    return Response.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
