export type VideoJobPayloadAsset = {
  id: string;
  assetType: string;
  storageProvider: string;
  bucketName?: string | null;
  storageKey: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder: number;
};

export type VideoJobPayloadMaterialReference = {
  id: string;
  materialItemId: string;
};

export type VideoJobPayloadVariant = {
  contentVariantId: string;
  draftId: string;
  scriptText?: string | null;
  reviewStatus: string;
};

export type VideoEditJobInputAsset = {
  asset_id: string;
  asset_type: string;
  storage_provider: string;
  bucket_name: string | null;
  storage_key: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  etag: string | null;
  sort_order: number;
};

export type VideoEditJobInputPayload = {
  source: "video_workbench";
  executionMode: "staging_worker";
  script: {
    text: string;
    locked: true;
    variantId: string;
  };
  productionDirective: {
    targetPlatform: "douyin";
    aspectRatio: "9:16";
    desiredOutputs: ["final_video", "cover", "subtitles"];
    lockedFields: ["script", "cta", "target_user", "claims"];
  };
  materialContext: {
    assetPlanId: string | null;
    assetMatchReportId: string | null;
    scriptBindingId: string;
    materialIds: string[];
    materialReferenceIds: string[];
    selectionMode: "user_confirmed" | "none";
    fallbackMode: string | null;
  };
  input_assets: VideoEditJobInputAsset[];
  assembled_from_owner_type: "content_draft";
  assembled_from_owner_id: string;
  assembled_at: string;
  render_mode: "asset_driven" | "script_only_fallback";
};

export class VideoJobPayloadValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "VideoJobPayloadValidationError";
    this.status = status;
    this.code = code;
  }
}

const desiredOutputs = ["final_video", "cover", "subtitles"] as const;
const lockedFields = ["script", "cta", "target_user", "claims"] as const;

export function buildVideoEditJobInputPayload(input: {
  draftId: string;
  variant: VideoJobPayloadVariant;
  materialReferences: VideoJobPayloadMaterialReference[];
  assets: VideoJobPayloadAsset[];
  now?: string;
}): VideoEditJobInputPayload {
  assertApprovedScript(input.variant);

  const inputAssets = input.assets
    .filter((asset) => asset.assetType === "image" || asset.assetType === "video")
    .map(mapInputAsset);
  const materialReferenceIds = uniqueStrings(input.materialReferences.map((item) => item.id));
  const materialIds = uniqueStrings(input.materialReferences.map((item) => item.materialItemId));

  return {
    source: "video_workbench",
    executionMode: "staging_worker",
    script: {
      text: input.variant.scriptText!.trim(),
      locked: true,
      variantId: input.variant.contentVariantId,
    },
    productionDirective: {
      targetPlatform: "douyin",
      aspectRatio: "9:16",
      desiredOutputs: [...desiredOutputs],
      lockedFields: [...lockedFields],
    },
    materialContext: {
      assetPlanId: null,
      assetMatchReportId: null,
      scriptBindingId: input.variant.contentVariantId,
      materialIds,
      materialReferenceIds,
      selectionMode: materialReferenceIds.length > 0 ? "user_confirmed" : "none",
      fallbackMode: materialReferenceIds.length > 0 ? null : "no_material_reference",
    },
    input_assets: inputAssets,
    assembled_from_owner_type: "content_draft",
    assembled_from_owner_id: input.draftId,
    assembled_at: input.now ?? new Date().toISOString(),
    render_mode: inputAssets.length > 0 ? "asset_driven" : "script_only_fallback",
  };
}

export function assertApprovedScript(variant: VideoJobPayloadVariant) {
  if (variant.reviewStatus !== "approved") {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_SCRIPT_NOT_APPROVED",
      "请先确认脚本，再创建正式视频任务。",
    );
  }

  if (!variant.scriptText?.trim()) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_SCRIPT_TEXT_REQUIRED",
      "已确认脚本缺少正文，无法创建视频任务。",
    );
  }
}

function mapInputAsset(asset: VideoJobPayloadAsset): VideoEditJobInputAsset {
  if (!asset.storageKey.trim()) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_INPUT_ASSET_STORAGE_KEY_REQUIRED",
      "素材缺少 storage_key，无法交给 worker 执行。",
    );
  }

  if (asset.storageProvider === "tencent_cos" && !asset.bucketName?.trim()) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_INPUT_ASSET_BUCKET_REQUIRED",
      "COS 素材缺少 bucket_name，无法交给 worker 执行。",
    );
  }

  return {
    asset_id: asset.id,
    asset_type: asset.assetType,
    storage_provider: asset.storageProvider,
    bucket_name: asset.bucketName ?? null,
    storage_key: asset.storageKey,
    mime_type: asset.mimeType ?? null,
    file_size_bytes: asset.fileSizeBytes ?? null,
    etag: asset.etag ?? null,
    sort_order: asset.sortOrder,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
