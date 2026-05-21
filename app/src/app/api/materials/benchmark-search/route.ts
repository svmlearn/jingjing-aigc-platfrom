import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/server/api/errors";
import { createBenchmarkMaterialsForUser } from "@/server/api/material-library-service";
import { benchmarkMaterialSearchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = benchmarkMaterialSearchSchema.parse(await request.json());
    const materials = await createBenchmarkMaterialsForUser({
      userId: user.id,
      platform: payload.platform,
      findMethod: payload.findMethod,
      keyword: payload.keyword,
      profileUrl: payload.profileUrl,
      detailUrl: payload.detailUrl,
      count: payload.count,
    });

    return Response.json({ materials }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
