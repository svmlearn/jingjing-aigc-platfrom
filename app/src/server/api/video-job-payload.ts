import type { ProductionConfig, VoiceoverProvider } from "@/contracts/video";

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
  productionConfig: NormalizedProductionConfig;
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
const allowedVoiceoverProviders = new Set<VoiceoverProvider>([
  "bytedance_bigtts",
  "minimax",
  "302",
]);
const allowedSubtitleStyles = new Set(["platform_default", "bold_caption"]);
const allowedBgmFilterKeys = new Set(["mood", "scene", "genre", "lang", "id"]);

type NormalizedProductionConfig = {
  voiceover: {
    enabled: boolean;
    provider: VoiceoverProvider;
    voiceStyle?: string;
    speed?: number;
    volume: number;
  };
  bgm: {
    enabled: boolean;
    userRequest: string;
    include: Record<string, Array<string | number>>;
    exclude: Record<string, Array<string | number>>;
    volume: number;
  };
  subtitles: {
    enabled: boolean;
    style: "platform_default" | "bold_caption";
  };
  render: {
    aspectRatio: "9:16";
    maxDurationSeconds?: number;
    includeOriginalAudio: boolean;
  };
};

export function buildVideoEditJobInputPayload(input: {
  draftId: string;
  variant: VideoJobPayloadVariant;
  materialReferences: VideoJobPayloadMaterialReference[];
  assets: VideoJobPayloadAsset[];
  productionConfig?: ProductionConfig | null;
  now?: string;
}): VideoEditJobInputPayload {
  assertApprovedScript(input.variant);

  const inputAssets = input.assets
    .filter((asset) => asset.assetType === "image" || asset.assetType === "video")
    .map(mapInputAsset)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.asset_id.localeCompare(right.asset_id),
    );
  const materialReferenceIds = uniqueStrings(input.materialReferences.map((item) => item.id));
  const materialIds = uniqueStrings(input.materialReferences.map((item) => item.materialItemId));

  if (materialReferenceIds.length > 0 && inputAssets.length === 0) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_CONFIRMED_MATERIAL_ASSET_REQUIRED",
      "Confirmed video materials do not have downloadable input assets.",
    );
  }

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
    productionConfig: normalizeProductionConfig(input.productionConfig),
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

function normalizeProductionConfig(
  input: ProductionConfig | null | undefined,
): NormalizedProductionConfig {
  const voiceover = input?.voiceover ?? {};
  const provider = voiceover.provider ?? "bytedance_bigtts";
  if (!allowedVoiceoverProviders.has(provider)) {
    throwInvalidProductionConfig("Unsupported voiceover provider.");
  }

  const subtitles = input?.subtitles ?? {};
  const subtitleStyle = subtitles.style ?? "platform_default";
  if (!allowedSubtitleStyles.has(subtitleStyle)) {
    throwInvalidProductionConfig("Unsupported subtitle style.");
  }

  const render = input?.render ?? {};
  const normalizedRender: NormalizedProductionConfig["render"] = {
    aspectRatio: render.aspectRatio ?? "9:16",
    includeOriginalAudio: render.includeOriginalAudio ?? false,
  };
  if (normalizedRender.aspectRatio !== "9:16") {
    throwInvalidProductionConfig("Unsupported render aspect ratio.");
  }
  const maxDurationSeconds = normalizeOptionalNumber(
    render.maxDurationSeconds,
    "render.maxDurationSeconds",
    15,
    180,
    true,
  );
  if (maxDurationSeconds !== undefined) {
    normalizedRender.maxDurationSeconds = maxDurationSeconds;
  }

  const bgm = input?.bgm ?? {};
  const normalizedVoiceover: NormalizedProductionConfig["voiceover"] = {
    enabled: voiceover.enabled ?? true,
    provider,
    volume: normalizeOptionalNumber(voiceover.volume, "voiceover.volume", 0, 3) ?? 2,
  };
  const voiceStyle = normalizeOptionalString(voiceover.voiceStyle);
  if (voiceStyle) {
    normalizedVoiceover.voiceStyle = voiceStyle;
  }
  const speed = normalizeOptionalNumber(voiceover.speed, "voiceover.speed", 0.5, 2);
  if (speed !== undefined) {
    normalizedVoiceover.speed = speed;
  }

  return {
    voiceover: normalizedVoiceover,
    bgm: {
      enabled: bgm.enabled ?? true,
      userRequest: normalizeOptionalString(bgm.userRequest) ?? "",
      include: normalizeBgmFilter(bgm.include, "bgm.include"),
      exclude: normalizeBgmFilter(bgm.exclude, "bgm.exclude"),
      volume: normalizeOptionalNumber(bgm.volume, "bgm.volume", 0, 3) ?? 0.25,
    },
    subtitles: {
      enabled: subtitles.enabled ?? true,
      style: subtitleStyle,
    },
    render: normalizedRender,
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNumber(
  value: number | null | undefined,
  field: string,
  min: number,
  max: number,
  integer = false,
) {
  if (value == null) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throwInvalidProductionConfig(`${field} is out of range.`);
  }
  return value;
}

function normalizeBgmFilter(
  value: Record<string, Array<string | number>> | undefined,
  field: string,
) {
  if (!value) {
    return {};
  }

  const normalized: Record<string, Array<string | number>> = {};
  for (const [key, items] of Object.entries(value)) {
    if (!allowedBgmFilterKeys.has(key)) {
      throwInvalidProductionConfig(`${field}.${key} is unsupported.`);
    }
    if (!Array.isArray(items)) {
      throwInvalidProductionConfig(`${field}.${key} must be an array.`);
    }
    normalized[key] = items.filter((item) => String(item).trim().length > 0);
  }
  return normalized;
}

function throwInvalidProductionConfig(message: string): never {
  throw new VideoJobPayloadValidationError(
    400,
    "VIDEO_PRODUCTION_CONFIG_INVALID",
    message,
  );
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
  const storageProvider = asset.storageProvider.trim();
  const storageKey = asset.storageKey.trim();
  const bucketName = asset.bucketName?.trim() ?? "";

  if (storageProvider !== "tencent_cos") {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_INPUT_ASSET_PROVIDER_UNSUPPORTED",
      "Video worker input assets must use tencent_cos storage.",
    );
  }

  if (!storageKey) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_INPUT_ASSET_STORAGE_KEY_REQUIRED",
      "素材缺少 storage_key，无法交给 worker 执行。",
    );
  }

  if (!bucketName) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_INPUT_ASSET_BUCKET_REQUIRED",
      "COS 素材缺少 bucket_name，无法交给 worker 执行。",
    );
  }

  return {
    asset_id: asset.id,
    asset_type: asset.assetType,
    storage_provider: "tencent_cos",
    bucket_name: bucketName,
    storage_key: storageKey,
    mime_type: asset.mimeType ?? null,
    file_size_bytes: asset.fileSizeBytes ?? null,
    etag: asset.etag ?? null,
    sort_order: asset.sortOrder,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
