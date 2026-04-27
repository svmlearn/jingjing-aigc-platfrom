import {
  createKnowledgeSet,
  listKnowledgeSets,
} from "@/lib/db/agent-console-repository";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createKnowledgeSetSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const knowledgeSets = await listKnowledgeSets();

    return Response.json({ knowledgeSets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createKnowledgeSetSchema.parse(await request.json());
    const knowledgeSet = await createKnowledgeSet(payload);

    return Response.json({ knowledgeSet }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
