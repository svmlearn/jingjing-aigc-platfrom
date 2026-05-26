import type { MediaAssetDto } from "@/contracts/media";
import type { PublicVideoEditJobDto, VideoEditJobDto } from "@/contracts/video";

const currentDefaultPayloadStorageProvider: MediaAssetDto["storageProvider"] = "aliyun_oss";

export function toPublicVideoEditJob(job: VideoEditJobDto): PublicVideoEditJobDto {
  const resultAssets =
    job.resultAssets && job.resultAssets.length > 0
      ? job.resultAssets
      : extractPayloadResultAssets(job.resultPayload, job.contentVariantId);

  return {
    id: job.id,
    draftId: job.draftId,
    contentVariantId: job.contentVariantId,
    status: job.status,
    currentStage: job.currentStage,
    triggerSource: job.triggerSource,
    instructionText: job.instructionText,
    progressPct: job.progressPct,
    retryCount: job.retryCount,
    failureReason: job.failureReason,
    progressModules: job.progressModules,
    resultAssets,
    dailyTaskId: readNestedString(job.inputPayload, ["materialContext", "dailyTaskId"]),
    calendarItemId: readNestedString(job.inputPayload, ["materialContext", "calendarItemId"]),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function extractPayloadResultAssets(
  resultPayload: Record<string, unknown>,
  fallbackOwnerId = "",
): NonNullable<VideoEditJobDto["resultAssets"]> {
  const rawAssets = Array.isArray(resultPayload.resultAssets)
    ? resultPayload.resultAssets
    : Array.isArray(resultPayload.uploaded_assets)
      ? resultPayload.uploaded_assets
      : null;

  if (!rawAssets) {
    return [];
  }

  return rawAssets
    .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object")
    .map((asset): MediaAssetDto => ({
      id: String(asset.id ?? asset.assetId ?? asset.asset_id ?? asset.storageKey ?? asset.storage_key ?? ""),
      ownerType: "content_variant",
      ownerId: String(asset.ownerId ?? asset.owner_id ?? fallbackOwnerId),
      assetType: normalizePayloadAssetType(asset),
      storageProvider: normalizePayloadStorageProvider(asset),
      bucketName: readString(asset, "bucketName", "bucket_name"),
      storageKey: String(asset.storageKey ?? asset.storage_key ?? ""),
      originUrl: readString(asset, "originUrl", "origin_url"),
      mimeType: readString(asset, "mimeType", "mime_type"),
      fileSizeBytes:
        typeof asset.fileSizeBytes === "number" && Number.isFinite(asset.fileSizeBytes)
          ? asset.fileSizeBytes
          : typeof asset.file_size_bytes === "number" && Number.isFinite(asset.file_size_bytes)
            ? asset.file_size_bytes
          : null,
      etag: typeof asset.etag === "string" ? asset.etag : null,
      sortOrder:
        typeof asset.sortOrder === "number" && Number.isFinite(asset.sortOrder)
          ? asset.sortOrder
          : typeof asset.sort_order === "number" && Number.isFinite(asset.sort_order)
            ? asset.sort_order
          : 0,
      createdAt:
        readString(asset, "createdAt", "created_at") ?? new Date().toISOString(),
      updatedAt: readString(asset, "updatedAt", "updated_at"),
      signedPreviewUrl:
        typeof asset.signedPreviewUrl === "string"
          ? asset.signedPreviewUrl
          : typeof asset.signed_preview_url === "string"
            ? asset.signed_preview_url
            : typeof asset.originUrl === "string"
              ? asset.originUrl
              : typeof asset.origin_url === "string"
                ? asset.origin_url
                : null,
      signedDownloadUrl:
        typeof asset.signedDownloadUrl === "string"
          ? asset.signedDownloadUrl
          : typeof asset.signed_download_url === "string"
            ? asset.signed_download_url
            : typeof asset.downloadUrl === "string"
              ? asset.downloadUrl
              : typeof asset.download_url === "string"
                ? asset.download_url
                : null,
    }))
    .filter((asset) => asset.id && asset.ownerId && asset.storageKey);
}

function normalizePayloadStorageProvider(asset: Record<string, unknown>): MediaAssetDto["storageProvider"] {
  const storageProvider = asset.storageProvider ?? asset.storage_provider;

  if (storageProvider === "aliyun_oss") {
    return storageProvider;
  }

  return currentDefaultPayloadStorageProvider;
}

function normalizePayloadAssetType(asset: Record<string, unknown>): MediaAssetDto["assetType"] {
  const assetType = asset.assetType ?? asset.asset_type;
  if (
    assetType === "image" ||
    assetType === "video" ||
    assetType === "cover" ||
    assetType === "subtitle"
  ) {
    return assetType;
  }

  return "video";
}

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readNestedString(source: Record<string, unknown>, path: string[]) {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current.length > 0 ? current : null;
}
