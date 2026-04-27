import {
  createAgentConfig,
  listAgentConfigs,
  listAgentRouteBindings,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createAgentConfigSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const [agents, routeBindings] = await Promise.all([
      listAgentConfigs(),
      listAgentRouteBindings(),
    ]);

    return Response.json({ agents, routeBindings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createAgentConfigSchema.parse(await request.json());
    const agent = await createAgentConfig(payload);

    return Response.json({ agent }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
