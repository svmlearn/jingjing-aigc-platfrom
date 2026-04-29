import {
  createPlatformAdminUser,
  listPlatformAdminUsers,
} from "@/lib/db/platform-admin-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { platformAdminUserCreateSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertPlatformAdminAccess(request, { roles: ["super_admin"] });
    const adminUsers = await listPlatformAdminUsers();

    return Response.json({ adminUsers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await assertPlatformAdminAccess(request, { roles: ["super_admin"] });
    const payload = platformAdminUserCreateSchema.parse(await request.json());
    const adminUser = await createPlatformAdminUser(
      {
        email: payload.email,
        password: payload.password,
        displayName: payload.displayName,
        role: payload.role,
      },
      actor,
    );

    return Response.json({ adminUser }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
