import {
  createAgentSkill,
  listAgentSkills,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createAgentSkillSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const skills = await listAgentSkills();

    return Response.json({ skills });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createAgentSkillSchema.parse(await request.json());
    const skill = await createAgentSkill(payload);

    return Response.json({ skill }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
