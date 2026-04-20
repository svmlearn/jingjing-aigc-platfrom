import { getAuthenticatedUser } from "@/lib/auth/current-user";
import {
  createAndRunImportJob,
  listUserImportJobs,
} from "@/server/import-jobs/service";
import { handleApiError } from "@/server/api/errors";
import { importRequestSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const importJobs = await listUserImportJobs(user.id);

    return Response.json({ importJobs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = importRequestSchema.parse(await request.json());
    const job = await createAndRunImportJob({
      userId: user.id,
      request: payload,
    });

    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
