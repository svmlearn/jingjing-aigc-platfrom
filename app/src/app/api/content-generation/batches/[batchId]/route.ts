import { getAuthenticatedUser } from "@/lib/auth/current-user";
import type { ContentGenerationJobDto } from "@/contracts/content-generation";
import { getDifyContentGenerationBatchStatusForUser } from "@/server/api/content-generation-batch-service";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { batchId } = await params;
    const result = await getDifyContentGenerationBatchStatusForUser({
      userId: user.id,
      batchId,
    });

    return Response.json({
      batch: result.batch,
      jobs: result.jobs.map(toJobSummary),
    });
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
    errorMessage: job.errorMessage,
    contentDraftId: job.contentDraftId,
    articleVariantId: job.articleVariantId,
    videoVariantId: job.videoVariantId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
