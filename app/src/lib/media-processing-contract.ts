import {
  getMerchantMediaAssetStorageKey,
  validateMerchantMediaReadyAsset,
  type MerchantMediaAssetRecord,
} from "./merchant-media-library-contract.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

export type ExtractedMediaMetadata = {
  mediaType: "image" | "video";
  width: number;
  height: number;
  durationSeconds?: number | null;
  mimeType: string;
};

export type ProcessedMediaTags = {
  description: string;
  tags: string[];
  industryTags?: string[];
  sceneTags?: string[];
  shotTags?: string[];
  peopleTags?: string[];
  qualityTags?: string[];
  tagConfidence: number;
  tagSource: "fixture" | "mock" | "manual" | "vision_model";
};

export type ProcessMerchantRawUploadInput = {
  asset: MerchantMediaAssetRecord;
  detectedMimeType: string;
  metadata?: ExtractedMediaMetadata | null;
  maxAutoReadyVideoDurationSeconds?: number | null;
  thumbnailCosKey?: string | null;
  thumbnailStorageKey?: string | null;
  tags?: ProcessedMediaTags | null;
  now: string;
};

export type ProcessMerchantRawUploadResult =
  | {
      ok: true;
      status: "processed_ready";
      stages: RawUploadProcessingStage[];
      readyAsset: MerchantMediaAssetRecord;
      readyClips: PrivateMediaClipRecord[];
    }
  | {
      ok: false;
      status: "validation_failed" | "processing_failed" | "needs_reclip" | "needs_retag";
      stages: RawUploadProcessingStage[];
      errors: string[];
    };

export type RawUploadProcessingStage =
  | "raw_upload"
  | "post_upload_validated"
  | "metadata_extracted"
  | "clip_extracted"
  | "thumbnail_generated"
  | "tagged"
  | "processed_ready";

const MIN_READY_TAG_CONFIDENCE = 0.6;

export function processMerchantRawUploadFixture(
  input: ProcessMerchantRawUploadInput,
): ProcessMerchantRawUploadResult {
  const validationErrors = validateRawUpload(input);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: "validation_failed",
      stages: ["raw_upload"],
      errors: validationErrors,
    };
  }

  const processingErrors = validateProcessingEvidence(input);
  if (isOverDurationLimit(input)) {
    return {
      ok: false,
      status: "needs_reclip",
      stages: ["raw_upload", "post_upload_validated", "metadata_extracted"],
      errors: ["video exceeds V1 full_video auto-ready duration limit and must go to needs_reclip."],
    };
  }
  if (processingErrors.length > 0) {
    return {
      ok: false,
      status: "processing_failed",
      stages: ["raw_upload", "post_upload_validated"],
      errors: processingErrors,
    };
  }

  const tagErrors = validateReadyTags(input.tags);
  if (tagErrors.length > 0) {
    return {
      ok: false,
      status: "needs_retag",
      stages: [
        "raw_upload",
        "post_upload_validated",
        "metadata_extracted",
        "clip_extracted",
        "thumbnail_generated",
      ],
      errors: tagErrors,
    };
  }

  const metadata = input.metadata;
  const tags = input.tags;
  const thumbnailStorageKey = getThumbnailStorageKey(input);
  if (!metadata || !tags || !thumbnailStorageKey) {
    return {
      ok: false,
      status: "processing_failed",
      stages: ["raw_upload", "post_upload_validated"],
      errors: ["processed clip evidence is incomplete."],
    };
  }

  const readyAsset: MerchantMediaAssetRecord = {
    ...input.asset,
    status: "ready",
  };
  const readyClip: PrivateMediaClipRecord = {
    id: `${input.asset.id}-clip-1`,
    merchantId: input.asset.merchantId,
    mediaType: input.asset.mediaType,
    status: "ready",
    clipIndex: 0,
    clipType: input.asset.mediaType === "video" ? "full_video" : "image",
    startTimeSeconds: input.asset.mediaType === "video" ? 0 : null,
    endTimeSeconds: input.asset.mediaType === "video" ? metadata.durationSeconds ?? null : null,
    width: metadata.width,
    height: metadata.height,
    durationSeconds: metadata.mediaType === "video" ? metadata.durationSeconds ?? null : null,
    orientation: metadata.width >= metadata.height ? "landscape" : "portrait",
    description: tags.description,
    tags: tags.tags,
    industryTags: tags.industryTags,
    sceneTags: tags.sceneTags,
    shotTags: tags.shotTags,
    peopleTags: tags.peopleTags,
    qualityTags: tags.qualityTags,
    tagConfidence: tags.tagConfidence,
    tagSource: tags.tagSource,
    bucketName: "fixture-private-bucket",
    cosKey: getMerchantMediaAssetStorageKey(input.asset),
    storageKey: getMerchantMediaAssetStorageKey(input.asset),
    thumbCosKey: thumbnailStorageKey,
    thumbStorageKey: thumbnailStorageKey,
    mimeType: metadata.mimeType,
    createdAt: input.now,
  };
  const readyValidation = validateMerchantMediaReadyAsset({
    asset: readyAsset,
    clips: [readyClip],
  });

  if (!readyValidation.ok) {
    return {
      ok: false,
      status: "processing_failed",
      stages: [
        "raw_upload",
        "post_upload_validated",
        "metadata_extracted",
        "clip_extracted",
        "thumbnail_generated",
        "tagged",
      ],
      errors: readyValidation.errors,
    };
  }

  return {
    ok: true,
    status: "processed_ready",
    stages: [
      "raw_upload",
      "post_upload_validated",
      "metadata_extracted",
      "clip_extracted",
      "thumbnail_generated",
      "tagged",
      "processed_ready",
    ],
    readyAsset,
    readyClips: readyValidation.readyClips,
  };
}

function validateRawUpload(input: ProcessMerchantRawUploadInput) {
  const errors: string[] = [];

  if (input.asset.status !== "uploaded" && input.asset.status !== "validating") {
    errors.push("merchant media processing must start from raw uploaded or validating asset.");
  }
  if (input.asset.source !== "merchant_upload" && input.asset.source !== "merchant_confirmed") {
    errors.push("only explicit merchant-side raw uploads can enter processing.");
  }
  if (!input.detectedMimeType.startsWith(`${input.asset.mediaType}/`)) {
    errors.push("detected MIME type must match the asset media type.");
  }

  return errors;
}

function validateProcessingEvidence(input: ProcessMerchantRawUploadInput) {
  const errors: string[] = [];
  const metadata = input.metadata;

  if (hasConflictingThumbnailStorageKeys(input)) {
    errors.push("thumbnailStorageKey must match thumbnailCosKey when both are provided.");
  }
  if (!metadata) {
    errors.push("media metadata extraction is required before an asset can become ready.");
    return errors;
  }
  if (metadata.mediaType !== input.asset.mediaType) {
    errors.push("extracted media type must match the asset media type.");
  }
  if (!Number.isFinite(metadata.width) || metadata.width <= 0) {
    errors.push("metadata width is required.");
  }
  if (!Number.isFinite(metadata.height) || metadata.height <= 0) {
    errors.push("metadata height is required.");
  }
  if (
    input.asset.mediaType === "video" &&
    (!Number.isFinite(metadata.durationSeconds ?? NaN) || (metadata.durationSeconds ?? 0) <= 0)
  ) {
    errors.push("metadata duration_seconds is required for video.");
  }
  const thumbnailStorageKey = getThumbnailStorageKey(input);
  if (!thumbnailStorageKey?.startsWith(`merchant-media/${input.asset.merchantId}/thumbs/${input.asset.id}/`)) {
    errors.push("thumbnail storage key is required under merchant-media/{merchant_id}/thumbs/{asset_id}/.");
  }

  return errors;
}

function getThumbnailStorageKey(input: Pick<ProcessMerchantRawUploadInput, "thumbnailCosKey" | "thumbnailStorageKey">) {
  return input.thumbnailStorageKey?.trim() || input.thumbnailCosKey?.trim() || null;
}

function hasConflictingThumbnailStorageKeys(input: Pick<ProcessMerchantRawUploadInput, "thumbnailCosKey" | "thumbnailStorageKey">) {
  const thumbnailCosKey = input.thumbnailCosKey?.trim() ?? "";
  const thumbnailStorageKey = input.thumbnailStorageKey?.trim() ?? "";

  return Boolean(thumbnailCosKey && thumbnailStorageKey && thumbnailCosKey !== thumbnailStorageKey);
}

function validateReadyTags(tags: ProcessedMediaTags | null | undefined) {
  const errors: string[] = [];

  if (!tags) {
    return ["tagging evidence is required before an asset can become ready."];
  }
  if (!tags.description.trim()) {
    errors.push("tag description is required.");
  }
  if (tags.tags.length < 3) {
    errors.push("at least three tags are required.");
  }
  if (!Number.isFinite(tags.tagConfidence) || tags.tagConfidence < MIN_READY_TAG_CONFIDENCE) {
    errors.push("low tag confidence must go to needs_retag instead of ready.");
  }
  if ((tags.tagSource === "mock" || tags.tagSource === "fixture") && tags.tags.some((tag) => !tag.trim())) {
    errors.push("mock or fixture tags must be explicit non-empty labels.");
  }

  return errors;
}

function isOverDurationLimit(input: ProcessMerchantRawUploadInput) {
  const limit = input.maxAutoReadyVideoDurationSeconds;

  return (
    input.asset.mediaType === "video" &&
    typeof limit === "number" &&
    Number.isFinite(limit) &&
    limit > 0 &&
    (input.metadata?.durationSeconds ?? 0) > limit
  );
}
