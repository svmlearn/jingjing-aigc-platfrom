import "server-only";

import type { CreateVideoEditJobRequest, VideoEditJobDto, VideoEditJobStatus } from "@/contracts/video";
import { listAssetObjectsByOwner } from "@/lib/db/media-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  assertVideoScriptVariantAccess,
  cancelVideoEditJob,
  createVideoEditJob,
  getVideoEditJobById,
  listVideoEditJobs,
  retryVideoEditJob,
} from "@/lib/db/video-edit-job-repository";
import { createCosSignedPreviewUrl } from "@/server/api/cos";

export async function createVideoEditJobForUser(input: {
  userId: string;
  request: CreateVideoEditJobRequest;
}): Promise<VideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const variant = await assertVideoScriptVariantAccess({
    merchantId: merchant.id,
    contentVariantId: input.request.contentVariantId,
  });

  return createVideoEditJob({
    merchantId: variant.merchantId,
    draftId: variant.draftId,
    contentVariantId: variant.contentVariantId,
    instructionText: input.request.instructionText,
    inputPayload: input.request.inputPayload,
  });
}

export async function listVideoEditJobsForUser(input: {
  userId: string;
  status?: VideoEditJobStatus;
  limit?: number;
}): Promise<VideoEditJobDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  return listVideoEditJobs(merchant.id, {
    status: input.status,
    limit: input.limit,
  });
}

export async function getVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const job = await getVideoEditJobById({
    merchantId: merchant.id,
    jobId: input.jobId,
  });

  return attachSignedResultAssets(job);
}

export async function retryVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  return retryVideoEditJob({
    merchantId: merchant.id,
    jobId: input.jobId,
  });
}

export async function cancelVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  return cancelVideoEditJob({
    merchantId: merchant.id,
    jobId: input.jobId,
  });
}

async function attachSignedResultAssets(job: VideoEditJobDto): Promise<VideoEditJobDto> {
  const assets = await listAssetObjectsByOwner({
    ownerType: "content_variant",
    ownerId: job.contentVariantId,
  });

  return {
    ...job,
    resultAssets: assets.map((asset) => ({
      ...asset,
      signedPreviewUrl:
        asset.storageProvider === "tencent_cos"
          ? createCosSignedPreviewUrl({
              bucketName: asset.bucketName,
              storageKey: asset.storageKey,
            })
          : null,
    })),
  };
}
