import type { BgmFilter, ProductionConfig, VoiceoverProvider } from "@/contracts/video";
import { tokenizeMaterialRetrievalQuery } from "../../lib/material-retrieval.ts";

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
  productionScenes?: VideoJobPayloadSceneInput[];
  reviewStatus: string;
};

export type VideoJobPayloadSceneInput = {
  sceneNo?: number | null;
  timeRange?: string | null;
  shotRequirement?: string | null;
  visual?: string | null;
  materials?: string[] | null;
  fallbackShot?: string | null;
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

export type VideoEditJobSceneAssetQuery = {
  sceneNo: number;
  timeRange: string | null;
  query: string;
  visualRequirement: string;
  fallbackShot: string | null;
};

export type VideoEditJobAssetMatchPlanItem = {
  sceneNo: number;
  query: string;
  matchedAssetIds: string[];
  missing: boolean;
  reason:
    | "filename_keyword_match"
    | "draft_video_assets_available_no_scene_index"
    | "no_video_asset";
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
    retrievalTarget: "video_edit_asset";
    assetPlanId: string | null;
    assetMatchReportId: string | null;
    scriptBindingId: string;
    materialIds: string[];
    materialReferenceIds: string[];
    selectionMode: "user_confirmed" | "none";
    fallbackMode: string | null;
    excludedAssetIds: string[];
    missingVideoAssetHints: string[];
    sceneAssetQueries: VideoEditJobSceneAssetQuery[];
    assetMatchPlan: VideoEditJobAssetMatchPlanItem[];
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
const allowedWorkerInputStorageProviders = new Set(["tencent_cos", "aliyun_oss"] as const);
const allowedSubtitleStyles = new Set(["platform_default", "bold_caption"]);
const allowedTalkingHeadSubtitleSources = new Set(["script", "asr_original_audio"] as const);
const allowedBgmFilterKeys = new Set(["mood", "scene", "genre", "lang", "id"]);

type WorkerInputStorageProvider = "tencent_cos" | "aliyun_oss";

type NormalizedProductionConfig = {
  voiceover:
    | {
        enabled: boolean;
        mode?: "system";
        provider: VoiceoverProvider;
        speaker?: string;
        voiceStyle?: string;
        speed?: number;
        volume: number;
      }
    | {
        enabled: boolean;
        mode: "voice_profile";
        voiceProfileId: string;
        refAudioAssetId: string;
        speed?: number;
        volume: number;
      };
  bgm: {
    enabled: boolean;
    userRequest: string;
    include: BgmFilter;
    exclude: BgmFilter;
    volume: number;
  };
  subtitles: {
    enabled: boolean;
    style: "platform_default" | "bold_caption";
    talkingHeadSource: "script" | "asr_original_audio";
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

  const excludedAssets = input.assets.filter((asset) => asset.assetType !== "video");
  const inputAssets = input.assets
    .filter((asset) => asset.assetType === "video")
    .map(mapInputAsset)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.asset_id.localeCompare(right.asset_id),
    );
  const materialReferenceIds = uniqueStrings(input.materialReferences.map((item) => item.id));
  const materialIds = uniqueStrings(input.materialReferences.map((item) => item.materialItemId));
  const sceneAssetQueries = buildSceneAssetQueries(input.variant);
  const assetMatchPlan = buildAssetMatchPlan({
    sceneAssetQueries,
    inputAssets,
  });

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
      retrievalTarget: "video_edit_asset",
      assetPlanId: null,
      assetMatchReportId: null,
      scriptBindingId: input.variant.contentVariantId,
      materialIds,
      materialReferenceIds,
      selectionMode: materialReferenceIds.length > 0 ? "user_confirmed" : "none",
      fallbackMode: materialReferenceIds.length > 0 ? null : "no_material_reference",
      excludedAssetIds: excludedAssets.map((asset) => asset.id),
      missingVideoAssetHints:
        inputAssets.length > 0
          ? []
          : buildMissingVideoAssetHints({
              sceneAssetQueries,
            }),
      sceneAssetQueries,
      assetMatchPlan,
    },
    input_assets: inputAssets,
    assembled_from_owner_type: "content_draft",
    assembled_from_owner_id: input.draftId,
    assembled_at: input.now ?? new Date().toISOString(),
    render_mode: inputAssets.length > 0 ? "asset_driven" : "script_only_fallback",
  };
}

function buildSceneAssetQueries(
  variant: VideoJobPayloadVariant,
): VideoEditJobSceneAssetQuery[] {
  const sceneQueries = (variant.productionScenes ?? [])
    .map((scene, index) => {
      const visualRequirement = firstNonEmptyString(
        scene.shotRequirement,
        scene.visual,
        ...(scene.materials ?? []),
      );

      if (!visualRequirement) {
        return null;
      }

      return {
        sceneNo: normalizePositiveInteger(scene.sceneNo) ?? index + 1,
        timeRange: normalizeOptionalString(scene.timeRange) ?? null,
        query: uniqueStrings([
          visualRequirement,
          scene.visual ?? "",
          ...(scene.materials ?? []),
        ]).join(" "),
        visualRequirement,
        fallbackShot: normalizeOptionalString(scene.fallbackShot) ?? null,
      };
    })
    .filter((item): item is VideoEditJobSceneAssetQuery => Boolean(item));

  if (sceneQueries.length > 0) {
    return sceneQueries.slice(0, 12);
  }

  return extractSceneAssetQueriesFromScript(variant.scriptText).slice(0, 12);
}

function buildAssetMatchPlan(input: {
  sceneAssetQueries: VideoEditJobSceneAssetQuery[];
  inputAssets: VideoEditJobInputAsset[];
}): VideoEditJobAssetMatchPlanItem[] {
  if (input.sceneAssetQueries.length === 0) {
    return [];
  }

  return input.sceneAssetQueries.map((sceneQuery) => {
    if (input.inputAssets.length === 0) {
      return {
        sceneNo: sceneQuery.sceneNo,
        query: sceneQuery.query,
        matchedAssetIds: [],
        missing: true,
        reason: "no_video_asset" as const,
      };
    }

    const matchedAssets = matchInputAssetsByQuery(sceneQuery.query, input.inputAssets);
    const candidateAssets = matchedAssets.length > 0 ? matchedAssets : input.inputAssets;

    return {
      sceneNo: sceneQuery.sceneNo,
      query: sceneQuery.query,
      matchedAssetIds: candidateAssets.map((asset) => asset.asset_id),
      missing: false,
      reason:
        matchedAssets.length > 0
          ? ("filename_keyword_match" as const)
          : ("draft_video_assets_available_no_scene_index" as const),
    };
  });
}

function normalizeProductionConfig(
  input: ProductionConfig | null | undefined,
): NormalizedProductionConfig {
  const voiceover = input?.voiceover ?? {};
  const voiceoverMode = voiceover.mode ?? "system";
  if (voiceoverMode !== "system" && voiceoverMode !== "voice_profile") {
    throwInvalidProductionConfig("Unsupported voiceover mode.");
  }

  const subtitles = input?.subtitles ?? {};
  const subtitleStyle = subtitles.style ?? "platform_default";
  if (!allowedSubtitleStyles.has(subtitleStyle)) {
    throwInvalidProductionConfig("Unsupported subtitle style.");
  }
  const talkingHeadSource = subtitles.talkingHeadSource ?? "script";
  if (!allowedTalkingHeadSubtitleSources.has(talkingHeadSource)) {
    throwInvalidProductionConfig("Unsupported talking head subtitle source.");
  }

  const render = input?.render ?? {};
  const normalizedRender: NormalizedProductionConfig["render"] = {
    aspectRatio: render.aspectRatio ?? "9:16",
    includeOriginalAudio:
      "includeOriginalAudio" in voiceover && typeof voiceover.includeOriginalAudio === "boolean"
        ? voiceover.includeOriginalAudio
        : render.includeOriginalAudio ?? false,
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
  const normalizedVoiceover = normalizeVoiceover(voiceover, voiceoverMode);

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
      talkingHeadSource,
    },
    render: normalizedRender,
  };
}

function normalizeVoiceover(
  voiceover: NonNullable<ProductionConfig["voiceover"]> | Record<string, never>,
  mode: "system" | "voice_profile",
): NormalizedProductionConfig["voiceover"] {
  const speed = normalizeOptionalNumber(voiceover.speed, "voiceover.speed", 0.5, 2);
  const volume = normalizeOptionalNumber(voiceover.volume, "voiceover.volume", 0, 3) ?? 2;

  if (mode === "voice_profile") {
    const voiceProfileId = normalizeOptionalString(voiceover.voiceProfileId);
    const refAudioAssetId = normalizeOptionalString(voiceover.refAudioAssetId);

    if (!voiceProfileId || !refAudioAssetId) {
      throwInvalidProductionConfig("voice_profile voiceover requires voiceProfileId and refAudioAssetId.");
    }

    const normalized: NormalizedProductionConfig["voiceover"] = {
      enabled: voiceover.enabled ?? true,
      mode: "voice_profile",
      voiceProfileId,
      refAudioAssetId,
      volume,
    };
    if (speed !== undefined) {
      normalized.speed = speed;
    }
    return normalized;
  }

  const provider = voiceover.provider ?? "bytedance_bigtts";
  if (!allowedVoiceoverProviders.has(provider)) {
    throwInvalidProductionConfig("Unsupported voiceover provider.");
  }

  const normalized: NormalizedProductionConfig["voiceover"] = {
    enabled: voiceover.enabled ?? true,
    provider,
    volume,
  };
  const speaker = normalizeOptionalString(voiceover.speaker);
  if (speaker) {
    normalized.speaker = speaker;
  }
  const voiceStyle = normalizeOptionalString(voiceover.voiceStyle);
  if (voiceStyle) {
    normalized.voiceStyle = voiceStyle;
  }
  if (speed !== undefined) {
    normalized.speed = speed;
  }
  return normalized;
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
  value: BgmFilter | undefined,
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
  const storageProvider = normalizeWorkerInputStorageProvider(asset.storageProvider);
  const storageKey = asset.storageKey.trim();
  const bucketName = asset.bucketName?.trim() ?? "";

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
      "素材缺少 bucket_name，无法交给 worker 执行。",
    );
  }

  return {
    asset_id: asset.id,
    asset_type: asset.assetType,
    storage_provider: storageProvider,
    bucket_name: bucketName,
    storage_key: storageKey,
    mime_type: asset.mimeType ?? null,
    file_size_bytes: asset.fileSizeBytes ?? null,
    etag: asset.etag ?? null,
    sort_order: asset.sortOrder,
  };
}

function normalizeWorkerInputStorageProvider(value: string): WorkerInputStorageProvider {
  const normalized = value.trim().toLowerCase();

  if (allowedWorkerInputStorageProviders.has(normalized as WorkerInputStorageProvider)) {
    return normalized as WorkerInputStorageProvider;
  }

  throw new VideoJobPayloadValidationError(
    409,
    "VIDEO_INPUT_ASSET_PROVIDER_UNSUPPORTED",
    "Video worker input assets must use tencent_cos or aliyun_oss storage.",
  );
}

function extractSceneAssetQueriesFromScript(
  scriptText: string | null | undefined,
): VideoEditJobSceneAssetQuery[] {
  const text = scriptText?.trim();

  if (!text) {
    return [];
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /镜头要求|所需画面|素材|画面/.test(line))
    .map((line, index) => {
      const query = line.replace(/^(镜头要求|所需画面|素材|画面)[：:]\s*/, "").trim();

      return {
        sceneNo: index + 1,
        timeRange: null,
        query: query || line,
        visualRequirement: query || line,
        fallbackShot: null,
      };
    });
}

function matchInputAssetsByQuery(
  query: string,
  inputAssets: VideoEditJobInputAsset[],
) {
  const terms = tokenizeMaterialRetrievalQuery(query);

  if (terms.length === 0) {
    return [];
  }

  return inputAssets.filter((asset) => {
    const assetText = [
      asset.asset_id,
      asset.storage_key,
      asset.mime_type ?? "",
      asset.etag ?? "",
    ]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();

    return terms.some((term) => assetText.includes(term));
  });
}

function buildMissingVideoAssetHints(input: {
  sceneAssetQueries: VideoEditJobSceneAssetQuery[];
}) {
  const hints = input.sceneAssetQueries
    .map((scene) => scene.visualRequirement || scene.query)
    .filter(Boolean)
    .slice(0, 6);

  return hints.length
    ? hints
    : ["当前草稿没有可剪辑视频素材，请上传项目外立面、样板间、周边配套或口播片段后重试。"];
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizePositiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
