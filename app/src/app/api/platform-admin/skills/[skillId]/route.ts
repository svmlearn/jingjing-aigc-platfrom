import {
  getAgentSkillById,
  updateAgentSkill,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { updateAgentSkillSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { skillId } = await context.params;
    const skill = await getAgentSkillById(skillId);

    return Response.json({ skill });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  try {
    assertPlatformAdminAccess(request);
    const { skillId } = await context.params;
    const payload = updateAgentSkillSchema.parse(await request.json());
    const skill = await updateAgentSkill(skillId, payload);

    return Response.json({ skill });
  } catch (error) {
    return handleApiError(error);
  }
}
