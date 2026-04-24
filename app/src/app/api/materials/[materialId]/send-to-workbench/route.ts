import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { sendMaterialToWorkbenchForUser } from "@/server/api/material-library-service";
import { materialWorkbenchReferenceSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ materialId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { materialId } = await context.params;
    const payload = materialWorkbenchReferenceSchema.parse(await request.json());
    const reference = await sendMaterialToWorkbenchForUser({
      userId: user.id,
      materialItemId: materialId,
      targetWorkbench: payload.targetWorkbench,
    });

    return Response.json({ reference }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
