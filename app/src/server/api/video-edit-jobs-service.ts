import "server-only";

import type { ContentVariantDto } from "@/contracts/draft";
import type { MediaAssetDto } from "@/contracts/media";
import type {
  CreateVideoEditJobRequest,
  PublicVideoEditJobDto,
  VideoEditJobDto,
  VideoEditJobStatus,
} from "@/contracts/video";
import { approveContentVariant } from "@/lib/db/content-draft-repository";
import {
  isLocalRealChainEnabled,
  listLocalRealChainAssetObjectsByOwner,
} from "@/lib/db/local-real-chain-repository";
import { getPrivateMediaRepository } from "@/lib/db/merchant-media-repository";
import { listAssetObjectsByOwner } from "@/lib/db/media-repository";
import { isPostgresVideoChainEnabled } from "@/lib/db/postgres-video-chain-repository";
import {
  getMaterialLibraryItemById,
  listMaterialWorkbenchReferencesByDraft,
} from "@/lib/db/material-library-repository";
import { materialMatchesRetrievalTarget } from "@/lib/material-routing";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  assertVideoScriptVariantAccess,
  cancelVideoEditJob,
  createVideoEditJob,
  findInFlightVideoEditJobForScope,
  getVideoEditJobById,
  listVideoEditJobs,
  retryVideoEditJob,
} from "@/lib/db/video-edit-job-repository";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  VideoJobPayloadValidationError,
  buildVideoEditJobInputPayload,
  type VideoJobPayloadVariant,
} from "@/server/api/video-job-payload";
import {
  assertVoiceProfileAccess,
  assertVoiceProfileAudioAsset,
} from "@/lib/db/voice-profile-repository";
import { extractPayloadResultAssets, toPublicVideoEditJob } from "@/server/api/video-job-public-dto";
import { ApiError } from "@/server/api/errors";
import { getObjectStorageProvider } from "@/server/storage";

export async function createVideoEditJobForUser(input: {
  userId: string;
  request: CreateVideoEditJobRequest;
}): Promise<PublicVideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const variant = await assertVideoScriptVariantAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.request.contentVariantId,
  });
  if (input.request.sourceJobId) {
    await getVideoEditJobById({
      merchantId: variant.merchantId,
      createdByUserId: input.userId,
      jobId: input.request.sourceJobId,
    });
  }

  const inFlightJob = await findInFlightVideoEditJobForScope({
    merchantId: variant.merchantId,
    createdByUserId: input.userId,
    draftId: variant.draftId,
    contentVariantId: variant.contentVariantId,
  });

  if (inFlightJob) {
    return toPublicVideoEditJob(inFlightJob);
  }

  const executableVariant = await ensureVideoScriptApprovedForJob({
    userId: input.userId,
    merchantId: variant.merchantId,
    variant,
  });
  const inputPayload = await buildServerManagedInputPayload({
    userId: input.userId,
    merchantId: executableVariant.merchantId,
    draftId: executableVariant.draftId,
    variant: executableVariant,
    productionConfig: input.request.productionConfig ?? null,
  });
  const runtimePayload = {
    engine_adapter: "fire_red",
    provider_settings_source: "env",
    tts_provider:
      inputPayload.productionConfig.voiceover.mode === "voice_profile"
        ? "pixelle_clone"
        : inputPayload.productionConfig.voiceover.provider,
  };

  const job = await createVideoEditJob({
    merchantId: executableVariant.merchantId,
    createdByUserId: input.userId,
    draftId: executableVariant.draftId,
    contentVariantId: executableVariant.contentVariantId,
    triggerSource: input.request.sourceJobId ? "regenerate" : "manual",
    instructionText: input.request.instructionText,
    inputPayload: input.request.sourceJobId
      ? {
          ...inputPayload,
          revisionContext: {
            sourceJobId: input.request.sourceJobId,
            revisionType: "production",
          },
        }
      : inputPayload,
    runtimePayload,
  });

  return toPublicVideoEditJob(job);
}

export async function approveVideoScriptVariantForUser(input: {
  userId: string;
  contentVariantId: string;
}): Promise<ContentVariantDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const executableVariant = await assertVideoScriptVariantAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.contentVariantId,
  });

  if (!executableVariant.scriptText?.trim()) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_TEXT_REQUIRED",
      "视频脚本缺少正文，无法确认。",
    );
  }

  return approveContentVariant({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.contentVariantId,
  });
}

async function ensureVideoScriptApprovedForJob(input: {
  userId: string;
  merchantId: string;
  variant: VideoJobPayloadVariant & {
    merchantId: string;
    createdByUserId?: string | null;
    variantType?: ContentVariantDto["variantType"];
    title?: string | null;
    hashtags?: string[];
    ctaText?: string | null;
  };
}) {
  if (!input.variant.scriptText?.trim()) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_TEXT_REQUIRED",
      "视频脚本缺少正文，无法创建 AI 剪辑任务。",
    );
  }

  if (input.variant.reviewStatus === "approved") {
    return input.variant;
  }

  const approvedVariant = await approveContentVariant({
    merchantId: input.merchantId,
    createdByUserId: input.userId,
    contentVariantId: input.variant.contentVariantId,
  });

  return {
    ...input.variant,
    title: approvedVariant.title,
    scriptText: approvedVariant.scriptText ?? input.variant.scriptText,
    hashtags: approvedVariant.hashtags,
    ctaText: approvedVariant.ctaText,
    productionScenes:
      approvedVariant.productionScenes && approvedVariant.productionScenes.length > 0
        ? approvedVariant.productionScenes
        : input.variant.productionScenes,
    reviewStatus: approvedVariant.reviewStatus,
  };
}

export async function listVideoEditJobsForUser(input: {
  userId: string;
  status?: VideoEditJobStatus;
  limit?: number;
}): Promise<PublicVideoEditJobDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  const jobs = await listVideoEditJobs(merchant.id, {
    createdByUserId: input.userId,
    status: input.status,
    limit: input.limit,
  });

  return jobs.map(toPublicVideoEditJob);
}

export async function getVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<PublicVideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const job = await getVideoEditJobById({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    jobId: input.jobId,
  });

  return toPublicVideoEditJob(await attachSignedResultAssets(job));
}

export async function getVideoEditJobResultAssetRedirectUrlForUser(input: {
  userId: string;
  jobId: string;
  assetId: string;
  disposition?: "inline" | "attachment";
}): Promise<string> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const job = await getVideoEditJobById({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    jobId: input.jobId,
  });
  const references = extractUploadedAssetReferences(job.resultPayload);

  if (references.assetIds.size === 0 && references.storageKeys.size === 0) {
    throw new ApiError(404, "VIDEO_RESULT_ASSET_NOT_FOUND", "Video result asset was not found.");
  }

  const assets = await listAssetObjectsByOwner({
    ownerType: "content_variant",
    ownerId: job.contentVariantId,
  });
  const asset = assets.find(
    (item) =>
      item.id === input.assetId &&
      (references.assetIds.has(item.id) || references.storageKeys.has(item.storageKey)),
  );

  if (!asset) {
    throw new ApiError(404, "VIDEO_RESULT_ASSET_NOT_FOUND", "Video result asset was not found.");
  }

  if (asset.storageProvider === "tencent_cos" || asset.storageProvider === "aliyun_oss") {
    return getObjectStorageProvider(asset.storageProvider).createSignedReadUrl({
      bucketName: asset.bucketName,
      storageKey: asset.storageKey,
      responseContentDisposition: input.disposition ?? "inline",
      responseContentType: getPreviewContentType(asset),
    });
  }

  if (asset.signedPreviewUrl || asset.originUrl) {
    return asset.signedPreviewUrl ?? asset.originUrl ?? "";
  }

  throw new ApiError(404, "VIDEO_RESULT_ASSET_URL_MISSING", "Video result asset URL is missing.");
}

export async function retryVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<PublicVideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  const job = await retryVideoEditJob({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    jobId: input.jobId,
  });

  return toPublicVideoEditJob(job);
}

export async function cancelVideoEditJobForUser(input: {
  userId: string;
  jobId: string;
}): Promise<PublicVideoEditJobDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  const job = await cancelVideoEditJob({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    jobId: input.jobId,
  });

  return toPublicVideoEditJob(job);
}

async function attachSignedResultAssets(job: VideoEditJobDto): Promise<VideoEditJobDto> {
  const references = extractUploadedAssetReferences(job.resultPayload);
  const payloadResultAssets = extractPayloadResultAssets(job.resultPayload);

  if (references.assetIds.size === 0 && references.storageKeys.size === 0) {
    return {
      ...job,
      resultAssets: payloadResultAssets,
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
    resultAssets: [
      ...matchedAssets.map((asset) => ({
        ...asset,
        signedPreviewUrl:
          asset.storageProvider === "tencent_cos" || asset.storageProvider === "aliyun_oss"
            ? buildStableVideoResultAssetUrl(job.id, asset.id, "inline")
            : null,
        signedDownloadUrl:
          asset.storageProvider === "tencent_cos" || asset.storageProvider === "aliyun_oss"
            ? buildStableVideoResultAssetUrl(job.id, asset.id, "attachment")
            : asset.signedDownloadUrl ?? asset.signedPreviewUrl ?? asset.originUrl ?? null,
      })),
      ...payloadResultAssets,
    ],
  };
}

function buildStableVideoResultAssetUrl(
  jobId: string,
  assetId: string,
  disposition: "inline" | "attachment",
) {
  return `/api/video-edit-jobs/${encodeURIComponent(jobId)}/result/${encodeURIComponent(
    assetId,
  )}?disposition=${disposition}`;
}

function getPreviewContentType(asset: MediaAssetDto) {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  if (asset.assetType === "video") {
    return "video/mp4";
  }

  if (asset.assetType === "cover" || asset.assetType === "image") {
    return "image/jpeg";
  }

  if (asset.assetType === "subtitle") {
    return "text/plain; charset=utf-8";
  }

  return null;
}

async function buildServerManagedInputPayload(input: {
  userId: string;
  merchantId: string;
  draftId: string;
  variant: VideoJobPayloadVariant;
  productionConfig: CreateVideoEditJobRequest["productionConfig"];
}) {
  if (isPostgresVideoChainEnabled() || !isSupabaseAdminConfigured()) {
    const assets = isLocalRealChainEnabled()
      ? await listLocalRealChainAssetObjectsByOwner({
          ownerType: "content_draft",
          ownerId: input.draftId,
        })
      : await listAssetObjectsByOwner({
          ownerType: "content_draft",
          ownerId: input.draftId,
        });

    return buildVideoEditJobPayloadOrThrow({
      draftId: input.draftId,
      variant: input.variant,
      materialReferences: [],
      assets,
      productionConfig: input.productionConfig,
    });
  }

  const [assets, materialReferences, merchantMediaClips] = await Promise.all([
    listAssetObjectsByOwner({
      ownerType: "content_draft",
      ownerId: input.draftId,
    }),
    listMaterialWorkbenchReferencesByDraft({
      merchantId: input.merchantId,
      draftId: input.draftId,
      targetWorkbench: "video",
    }),
    getPrivateMediaRepository().listClipsByMerchant({ merchantId: input.merchantId }),
  ]);

  const videoEditMaterialReferences = await filterVideoEditMaterialReferences({
    merchantId: input.merchantId,
    references: materialReferences,
  });

  const payload = buildVideoEditJobPayloadOrThrow({
    draftId: input.draftId,
    variant: input.variant,
    materialReferences: videoEditMaterialReferences.map((reference) => ({
      id: reference.id,
      materialItemId: reference.materialItemId,
    })),
    assets,
    merchantMediaClips,
    requireUserTalkingHead: true,
    productionConfig: input.productionConfig,
  });
  return attachVoiceProfileReference({
    userId: input.userId,
    merchantId: input.merchantId,
    payload,
  });
}

async function attachVoiceProfileReference(input: {
  userId: string;
  merchantId: string;
  payload: ReturnType<typeof buildVideoEditJobInputPayload>;
}) {
  const voiceover = input.payload.productionConfig.voiceover;
  if (voiceover.mode !== "voice_profile") {
    return input.payload;
  }

  const voiceProfile = await assertVoiceProfileAccess({
    merchantId: input.merchantId,
    createdByUserId: input.userId,
    voiceProfileId: voiceover.voiceProfileId,
  });
  const refAudioAsset = await assertVoiceProfileAudioAsset({
    merchantId: input.merchantId,
    createdByUserId: input.userId,
    voiceProfileId: voiceover.voiceProfileId,
    assetId: voiceover.refAudioAssetId,
  });

  return {
    ...input.payload,
    productionConfig: {
      ...input.payload.productionConfig,
      voiceover: {
        ...voiceover,
        voiceProfile: {
          id: voiceProfile.id,
          displayName: voiceProfile.displayName,
          provider: voiceProfile.provider,
          externalVoiceId: voiceProfile.externalVoiceId,
          externalModelId: voiceProfile.externalModelId,
        },
        refAudioAsset: {
          assetId: refAudioAsset.id,
          assetType: refAudioAsset.assetType,
          ownerType: refAudioAsset.ownerType,
          ownerId: refAudioAsset.ownerId,
          storageProvider: refAudioAsset.storageProvider,
          bucketName: refAudioAsset.bucketName,
          storageKey: refAudioAsset.storageKey,
          mimeType: refAudioAsset.mimeType,
          fileSizeBytes: refAudioAsset.fileSizeBytes,
          etag: refAudioAsset.etag,
        },
      },
    },
  };
}

async function filterVideoEditMaterialReferences(input: {
  merchantId: string;
  references: Array<{
    id: string;
    materialItemId: string;
  }>;
}) {
  const pairs = await Promise.all(
    input.references.map(async (reference) => {
      try {
        const material = await getMaterialLibraryItemById({
          merchantId: input.merchantId,
          materialItemId: reference.materialItemId,
        });

        return materialMatchesRetrievalTarget(material, "video_edit_asset")
          ? reference
          : null;
      } catch {
        return null;
      }
    }),
  );

  return pairs.filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
}

function buildVideoEditJobPayloadOrThrow(input: Parameters<typeof buildVideoEditJobInputPayload>[0]) {
  try {
    return buildVideoEditJobInputPayload(input);
  } catch (error) {
    if (error instanceof VideoJobPayloadValidationError) {
      throw new ApiError(error.status, error.code, error.message);
    }

    throw error;
  }
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
