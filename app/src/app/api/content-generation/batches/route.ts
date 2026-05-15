import { getAuthenticatedUser } from "@/lib/auth/current-user";
import type { ContentGenerationJobDto } from "@/contracts/content-generation";
import { createDifyDailyTaskGenerationBatchForUser } from "@/server/api/content-generation-batch-service";
import { handleApiError } from "@/server/api/errors";
import { createContentGenerationBatchSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const payload = createContentGenerationBatchSchema.parse(await request.json());
    const result = await createDifyDailyTaskGenerationBatchForUser({
      userId: user.id,
      date: payload.date,
      days: payload.days,
      memberScope: payload.memberScope,
      extraRequirement: payload.extraRequirement,
    });

    return Response.json(
      {
        batch: result.batch,
        jobs: result.jobs.map(toJobSummary),
      },
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

function toJobSummary(job: ContentGenerationJobDto) {
  return {
    id: job.id,
    batchId: job.batchId,
    memberUserId: job.memberUserId,
    dailyTaskId: job.dailyTaskId,
    taskDate: job.taskDate,
    status: job.status,
    currentStage: job.currentStage,
    workflowProvider: job.workflowProvider,
    workflowVersion: job.workflowVersion,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
