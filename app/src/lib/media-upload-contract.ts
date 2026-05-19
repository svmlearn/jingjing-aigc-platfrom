export type UploadOwnerType = "source_item" | "content_draft" | "voice_profile";
export type UploadAssetType = "image" | "video" | "audio";

export type MediaUploadCompleteContractInput = {
  merchantId: string;
  ownerType: UploadOwnerType;
  ownerId: string;
  assetType: UploadAssetType;
  expectedBucket: string;
  bucketName?: string | null;
  storageProvider: string;
  storageKey: string;
  declaredMimeType?: string | null;
  detectedMimeType?: string | null;
  source?: "merchant_upload" | "member_task_temp" | "content_draft_temp" | "voice_profile";
};

export type MediaUploadCompleteContractResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function validateMediaUploadCompleteContract(
  input: MediaUploadCompleteContractInput,
): MediaUploadCompleteContractResult {
  if (input.storageProvider !== "aliyun_oss") {
    return failure("MEDIA_STORAGE_PROVIDER_UNSUPPORTED", "New media uploads must use Aliyun OSS.");
  }

  const actualBucket = input.bucketName ?? input.expectedBucket;
  if (actualBucket !== input.expectedBucket) {
    return failure("MEDIA_BUCKET_MISMATCH", "Uploaded media must target the configured object storage bucket.");
  }

  const expectedPrefix = getUploadKeyPrefix(input);
  if (!input.storageKey.startsWith(`${expectedPrefix}/`)) {
    return failure("MEDIA_STORAGE_KEY_INVALID", "Uploaded media key does not match the expected owner prefix.");
  }

  if (input.ownerType === "voice_profile" && input.assetType !== "audio") {
    return failure("MEDIA_ASSET_TYPE_UNSUPPORTED", "Voice profiles only support audio reference assets.");
  }

  if (input.ownerType !== "voice_profile" && input.assetType === "audio") {
    return failure("MEDIA_ASSET_TYPE_UNSUPPORTED", "Audio uploads are only supported for voice profiles.");
  }

  if (input.source && !isOwnerSourceAllowed(input.ownerType, input.source)) {
    return failure("MEDIA_SOURCE_UNSUPPORTED", "This upload source is not allowed for the requested owner type.");
  }

  if (!mimeMatchesAssetType(input.detectedMimeType ?? input.declaredMimeType ?? "", input.assetType)) {
    return failure("MEDIA_DETECTED_TYPE_MISMATCH", "Detected file type does not match the requested asset type.");
  }

  if (
    input.detectedMimeType &&
    input.declaredMimeType &&
    !mimeFamilyMatches(input.declaredMimeType, input.detectedMimeType)
  ) {
    return failure("MEDIA_DECLARED_TYPE_MISMATCH", "Declared MIME type does not match detected file type.");
  }

  return { ok: true };
}

export function getUploadKeyPrefix(input: {
  merchantId: string;
  ownerType: UploadOwnerType;
  ownerId: string;
}) {
  if (input.ownerType === "source_item") {
    return `source-assets/${input.merchantId}/${input.ownerId}`;
  }
  if (input.ownerType === "voice_profile") {
    return `voice-profiles/${input.merchantId}/${input.ownerId}`;
  }

  return `draft-inputs/${input.merchantId}/${input.ownerId}`;
}

function isOwnerSourceAllowed(ownerType: UploadOwnerType, source: NonNullable<MediaUploadCompleteContractInput["source"]>) {
  if (ownerType === "source_item") {
    return source === "merchant_upload";
  }
  if (ownerType === "voice_profile") {
    return source === "voice_profile";
  }

  return source === "member_task_temp" || source === "content_draft_temp";
}

function mimeMatchesAssetType(mimeType: string, assetType: UploadAssetType) {
  const normalized = mimeType.toLowerCase();
  if (assetType === "image") {
    return normalized.startsWith("image/");
  }
  if (assetType === "video") {
    return normalized.startsWith("video/");
  }

  return normalized.startsWith("audio/");
}

function mimeFamilyMatches(declaredMimeType: string, detectedMimeType: string) {
  return declaredMimeType.split("/")[0]?.toLowerCase() === detectedMimeType.split("/")[0]?.toLowerCase();
}

function failure(code: string, message: string): MediaUploadCompleteContractResult {
  return { ok: false, code, message };
}
