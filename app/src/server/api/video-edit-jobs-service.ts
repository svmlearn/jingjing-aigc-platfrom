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
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
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
    triggerSource: "manual",
    instructionText: input.request.instructionText,
    inputPayload: await buildServerManagedInputPayload(variant.draftId),
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
  const references = extractUploadedAssetReferences(job.resultPayload);

  if (references.assetIds.size === 0 && references.storageKeys.size === 0) {
    return {
      ...job,
      resultAssets: [],
    };
  }

  const assets = await listAssetObjectsByOwner({
    ownerType: "content_variant",
    ownerId: job.contentVariantId,
  });
  const matchedAssets = assets.filter(
    (asset) =>
      references.assetIds.has(asset.id) || references.storageKeys.has(asset.storageKey),
  );

  return {
    ...job,
    resultAssets: matchedAssets.map((asset) => ({
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

async function buildServerManagedInputPayload(draftId: string) {
  if (!isSupabaseAdminConfigured()) {
    return {
      input_assets: [],
      assembled_from_owner_type: "content_draft",
      assembled_from_owner_id: draftId,
      assembled_at: new Date().toISOString(),
      render_mode: "script_only_fallback",
      storageMode: "local_demo_memory",
    };
  }

  const assets = await listAssetObjectsByOwner({
    ownerType: "content_draft",
    ownerId: draftId,
  });
  const inputAssets = assets
    .filter((asset) => asset.assetType === "image" || asset.assetType === "video")
    .map((asset) => ({
      asset_id: asset.id,
      asset_type: asset.assetType,
      storage_provider: asset.storageProvider,
      bucket_name: asset.bucketName ?? null,
      storage_key: asset.storageKey,
      mime_type: asset.mimeType ?? null,
      file_size_bytes: asset.fileSizeBytes ?? null,
      etag: asset.etag ?? null,
      sort_order: asset.sortOrder,
    }));

  return {
    input_assets: inputAssets,
    assembled_from_owner_type: "content_draft",
    assembled_from_owner_id: draftId,
    assembled_at: new Date().toISOString(),
    render_mode: inputAssets.length === 0 ? "script_only_fallback" : "asset_driven",
  };
}

function extractUploadedAssetReferences(resultPayload: Record<string, unknown>) {
  const assetIds = new Set<string>();
  const storageKeys = new Set<string>();
  const uploadedAssets = resultPayload.uploaded_assets;

  if (!Array.isArray(uploadedAssets)) {
    return { assetIds, storageKeys };
  }

  for (const item of uploadedAssets) {
    if (typeof item === "string") {
      if (looksLikeUuid(item)) {
        assetIds.add(item);
      } else {
        storageKeys.add(item);
      }

      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const assetId = firstString(record.asset_id, record.assetId, record.id);
    const storageKey = firstString(record.storage_key, record.storageKey);

    if (assetId) {
      assetIds.add(assetId);
    }

    if (storageKey) {
      storageKeys.add(storageKey);
    }
  }

  return { assetIds, storageKeys };
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
