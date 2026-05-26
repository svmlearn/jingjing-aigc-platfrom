import "server-only";

import type { ContentVariantDto } from "@/contracts/draft";
import type {
  CreateVideoEditJobRequest,
  VideoEditJobDto,
  VideoEditJobStatus,
  VideoEditJobTriggerSource,
} from "@/contracts/video";
import {
  pgAssertVideoScriptVariantAccess,
  pgCancelVideoEditJob,
  pgCreateVideoEditJob,
  pgFindInFlightVideoEditJobForScope,
  pgGetVideoEditJobById,
  pgListVideoEditJobs,
  pgRetryVideoEditJob,
} from "@/lib/db/postgres-video-chain-repository";

export type VideoEditJobListFilters = {
  status?: VideoEditJobStatus;
  state?: "in_flight";
  createdByUserId?: string | null;
  dailyTaskId?: string | null;
  contentVariantId?: string | null;
  limit?: number;
};

export type VideoEditJobDeduplicationScope = {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
};

export async function assertVideoScriptVariantAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}): Promise<{
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  scriptText?: string | null;
  hashtags?: string[];
  ctaText?: string | null;
  productionScenes?: ContentVariantDto["productionScenes"];
  reviewStatus: ContentVariantDto["reviewStatus"];
}> {
  return pgAssertVideoScriptVariantAccess(input);
}

export async function createVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  triggerSource?: VideoEditJobTriggerSource;
  instructionText?: CreateVideoEditJobRequest["instructionText"];
  inputPayload?: Record<string, unknown>;
  runtimePayload?: Record<string, unknown>;
}): Promise<VideoEditJobDto> {
  const existingInFlightJob = await findInFlightVideoEditJobForScope({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    draftId: input.draftId,
    contentVariantId: input.contentVariantId,
  });

  if (existingInFlightJob) {
    return existingInFlightJob;
  }

  return pgCreateVideoEditJob(input);
}

export async function findInFlightVideoEditJobForScope(
  input: VideoEditJobDeduplicationScope,
): Promise<VideoEditJobDto | null> {
  return pgFindInFlightVideoEditJobForScope(input);
}

export async function listVideoEditJobs(
  merchantId: string,
  filters: VideoEditJobListFilters = {},
): Promise<VideoEditJobDto[]> {
  return pgListVideoEditJobs(merchantId, filters);
}

export async function getVideoEditJobById(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  return pgGetVideoEditJobById(input);
}

export async function retryVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  return pgRetryVideoEditJob(input);
}

export async function cancelVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  return pgCancelVideoEditJob(input);
}
