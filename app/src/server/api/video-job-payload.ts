import type { BgmFilter, ProductionConfig, VoiceoverProvider } from "@/contracts/video";

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
  createdAt?: string | null;
  role?: string | null;
  sceneType?: string | null;
  tags?: string[] | null;
  labels?: string[] | null;
  metadata?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown> | null;
};

export type VideoJobPayloadSceneInput = {
  sceneNo?: number | null;
  timeRange?: string | null;
  durationSeconds?: number | null;
  shotRequirement?: string | null;
  visual?: string | null;
  materials?: string[] | null;
  fallbackShot?: string | null;
  requiresUserUpload?: boolean | null;
  sceneType?: string | null;
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
  role?: string;
  scene_type?: string;
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, unknown>;
};

export type VideoEditJobSceneAssetQuery = {
  sceneNo: number;
  timeRange: string | null;
  query: string;
  visualRequirement: string;
  fallbackShot: string | null;
  sourceRole: "user_talking_head" | "merchant_broll";
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
    dailyTaskId: string | null;
    memberUserId: string | null;
    assetPlanId: string | null;
    assetMatchReportId: string | null;
    scriptBindingId: string;
    excludedAssetIds: string[];
    userTalkingHeadAssetIds: string[];
    missingVideoAssetHints: string[];
    sceneAssetQueries: VideoEditJobSceneAssetQuery[];
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
  "aliyun_cosyvoice",
  "bytedance_bigtts",
  "minimax",
  "302",
]);
const allowedWorkerInputStorageProviders = new Set(["aliyun_oss"] as const);
const allowedSubtitleStyles = new Set(["platform_default", "bold_caption"]);
const allowedTalkingHeadSubtitleSources = new Set([
  "script",
  "script_audio_alignment",
  "asr_original_audio",
] as const);
const allowedLipSyncProviders = new Set(["aliyun_videoretalk"] as const);
const allowedBgmFilterKeys = new Set(["mood", "scene", "genre", "lang", "id"]);
const lipSyncInputRequirements = {
  audio: {
    allowedExtensions: ["wav", "mp3", "aac"],
    maxFileSizeBytes: 30 * 1024 * 1024,
    minDurationSecondsExclusive: 2,
    maxDurationSecondsExclusive: 120,
    requiresCleanSpeech: true,
  },
  video: {
    allowedExtensions: ["mp4", "avi", "mov"],
    maxFileSizeBytes: 300 * 1024 * 1024,
    minDurationSecondsExclusive: 2,
    maxDurationSecondsExclusive: 120,
    minFps: 15,
    maxFps: 60,
    allowedCodecs: ["h264", "h265"],
    minSidePixels: 640,
    maxSidePixels: 2048,
    requiresClearFrontalFace: true,
  },
} as const;

type WorkerInputStorageProvider = "aliyun_oss";
type TalkingHeadSubtitleSource = "script" | "script_audio_alignment" | "asr_original_audio";

type NormalizedProductionConfig = {
  voiceover:
    | {
        enabled: boolean;
        mode: "system";
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
    talkingHeadSource: TalkingHeadSubtitleSource;
  };
  lipSync: {
    enabled: boolean;
    provider: "aliyun_videoretalk";
    scope: "talking_head_segments";
    subtitleSource: TalkingHeadSubtitleSource;
    requireVoiceProfile: boolean;
    inputRequirements: typeof lipSyncInputRequirements;
  };
  render: {
    aspectRatio: "9:16";
    maxDurationSeconds?: number;
    includeOriginalAudio: boolean;
    preserveTalkingHeadOriginalAudio?: boolean;
  };
};

export function buildVideoEditJobInputPayload(input: {
  draftId: string;
  variant: VideoJobPayloadVariant;
  materialReferences?: VideoJobPayloadMaterialReference[];
  assets: VideoJobPayloadAsset[];
  merchantMediaClips?: unknown[];
  requireUserTalkingHead?: boolean;
  productionConfig?: ProductionConfig | null;
  now?: string;
}): VideoEditJobInputPayload {
  assertApprovedScript(input.variant);

  const excludedAssets = input.assets.filter((asset) => asset.assetType !== "video");
  const rawInputAssets = dedupeVideoInputAssets(
    input.assets.filter((asset) => asset.assetType === "video"),
  )
    .map(mapInputAsset)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.asset_id.localeCompare(right.asset_id),
    );
  const sceneAssetQueries = buildSceneAssetQueries(input.variant);
  const shouldUseTalkingHeadDefaults =
    input.requireUserTalkingHead === true ||
    sceneAssetQueries.some((query) => query.sourceRole === "user_talking_head");
  const userTalkingHeadAssetIds = rawInputAssets
    .filter((asset) =>
      isUserTalkingHeadAsset(asset, input.draftId, {
        allowDraftInputHeuristic: shouldUseTalkingHeadDefaults,
      }),
    )
    .map((asset) => asset.asset_id);
  const userTalkingHeadAssetIdSet = new Set(userTalkingHeadAssetIds);
  const shouldApplyTalkingHeadDefaults =
    shouldUseTalkingHeadDefaults || userTalkingHeadAssetIds.length > 0;
  const inputAssets = rawInputAssets.map((asset) =>
    userTalkingHeadAssetIdSet.has(asset.asset_id) && shouldApplyTalkingHeadDefaults
      ? markTalkingHeadInputAsset(asset)
      : asset,
  );
  if (input.requireUserTalkingHead && userTalkingHeadAssetIds.length === 0) {
    throw new VideoJobPayloadValidationError(
      409,
      "VIDEO_USER_TALKING_HEAD_ASSET_REQUIRED",
      "请先上传至少一段开头或结尾真人口播视频，再创建 AI 剪辑任务。",
    );
  }

  return {
    source: "video_workbench",
    executionMode: "staging_worker",
    script: {
      text: stripDisplayOnlyDurationLines(input.variant.scriptText!),
      locked: true,
      variantId: input.variant.contentVariantId,
    },
    productionDirective: {
      targetPlatform: "douyin",
      aspectRatio: "9:16",
      desiredOutputs: [...desiredOutputs],
      lockedFields: [...lockedFields],
    },
    productionConfig: normalizeProductionConfig(input.productionConfig, {
      defaultTalkingHeadScriptAudioAlignment:
        shouldApplyTalkingHeadDefaults && userTalkingHeadAssetIds.length > 0,
    }),
    materialContext: {
      retrievalTarget: "video_edit_asset",
      dailyTaskId: null,
      memberUserId: null,
      assetPlanId: null,
      assetMatchReportId: null,
      scriptBindingId: input.variant.contentVariantId,
      excludedAssetIds: excludedAssets.map((asset) => asset.id),
      userTalkingHeadAssetIds,
      missingVideoAssetHints: [],
      sceneAssetQueries,
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
        query: buildSceneSearchQuery(scene, visualRequirement),
        visualRequirement,
        fallbackShot: normalizeOptionalString(scene.fallbackShot) ?? null,
        sourceRole: inferSceneSourceRole(scene),
      };
    })
    .filter((item): item is VideoEditJobSceneAssetQuery => Boolean(item));

  if (sceneQueries.length > 0) {
    return sceneQueries.slice(0, 12);
  }

  if ((variant.productionScenes ?? []).length > 0) {
    return [];
  }

  return extractSceneAssetQueriesFromScript(variant.scriptText).slice(0, 12);
}

function buildSceneSearchQuery(
  scene: VideoJobPayloadSceneInput,
  visualRequirement: string,
) {
  const materialTerms = uniqueStrings([
    ...(scene.materials ?? []),
    scene.fallbackShot ?? "",
  ]);

  if (materialTerms.length > 0) {
    return materialTerms.join(" ");
  }

  return visualRequirement;
}

function normalizeProductionConfig(
  input: ProductionConfig | null | undefined,
  options: { defaultTalkingHeadScriptAudioAlignment?: boolean } = {},
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
  const talkingHeadSource =
    subtitles.talkingHeadSource ??
    (options.defaultTalkingHeadScriptAudioAlignment ? "script_audio_alignment" : "script");
  if (!allowedTalkingHeadSubtitleSources.has(talkingHeadSource)) {
    throwInvalidProductionConfig("Unsupported talking-head subtitle source.");
  }

  const lipSync = input?.lipSync ?? {};
  const lipSyncProvider = lipSync.provider ?? "aliyun_videoretalk";
  if (!allowedLipSyncProviders.has(lipSyncProvider)) {
    throwInvalidProductionConfig("Unsupported lip-sync provider.");
  }
  const lipSyncSubtitleSource = lipSync.subtitleSource ?? talkingHeadSource;
  if (!allowedTalkingHeadSubtitleSources.has(lipSyncSubtitleSource)) {
    throwInvalidProductionConfig("Unsupported lip-sync subtitle source.");
  }

  const render = input?.render ?? {};
  const preserveTalkingHeadOriginalAudio =
    render.preserveTalkingHeadOriginalAudio ?? talkingHeadSource === "asr_original_audio";
  const normalizedRender: NormalizedProductionConfig["render"] = {
    aspectRatio: render.aspectRatio ?? "9:16",
    includeOriginalAudio:
      preserveTalkingHeadOriginalAudio
        ? true
        : "includeOriginalAudio" in voiceover && typeof voiceover.includeOriginalAudio === "boolean"
        ? voiceover.includeOriginalAudio
        : render.includeOriginalAudio ?? false,
  };
  if (preserveTalkingHeadOriginalAudio) {
    normalizedRender.preserveTalkingHeadOriginalAudio = true;
  }
  if (normalizedRender.aspectRatio !== "9:16") {
    throwInvalidProductionConfig("Unsupported render aspect ratio.");
  }
  const maxDurationSeconds = normalizeOptionalNumber(
    render.maxDurationSeconds,
    "render.maxDurationSeconds",
    15,
    600,
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
    lipSync: {
      enabled:
        lipSync.enabled ??
        (options.defaultTalkingHeadScriptAudioAlignment ||
          talkingHeadSource === "script_audio_alignment"),
      provider: lipSyncProvider,
      scope: "talking_head_segments",
      subtitleSource: lipSyncSubtitleSource,
      requireVoiceProfile: lipSync.requireVoiceProfile ?? true,
      inputRequirements: lipSyncInputRequirements,
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

  const provider = voiceover.provider ?? "aliyun_cosyvoice";
  if (!allowedVoiceoverProviders.has(provider)) {
    throwInvalidProductionConfig("Unsupported voiceover provider.");
  }

  const normalized: NormalizedProductionConfig["voiceover"] = {
    enabled: voiceover.enabled ?? true,
    mode: "system",
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
    ...normalizeInputAssetClassification(asset),
  };
}

function dedupeVideoInputAssets(assets: VideoJobPayloadAsset[]) {
  const passthroughAssets: VideoJobPayloadAsset[] = [];
  const byContentSignature = new Map<string, VideoJobPayloadAsset>();

  for (const asset of assets) {
    const signature = videoInputAssetContentSignature(asset);
    if (!signature) {
      passthroughAssets.push(asset);
      continue;
    }

    const existing = byContentSignature.get(signature);
    if (!existing || shouldPreferDuplicateVideoAsset(asset, existing)) {
      byContentSignature.set(signature, asset);
    }
  }

  return [...passthroughAssets, ...byContentSignature.values()];
}

function videoInputAssetContentSignature(asset: VideoJobPayloadAsset) {
  const etag = normalizeOptionalString(asset.etag)?.replace(/^"+|"+$/g, "");
  if (!etag) {
    return null;
  }

  return [
    asset.storageProvider.trim().toLowerCase(),
    asset.bucketName?.trim().toLowerCase() ?? "",
    etag.toLowerCase(),
    asset.fileSizeBytes ?? "",
  ].join("|");
}

function shouldPreferDuplicateVideoAsset(
  candidate: VideoJobPayloadAsset,
  existing: VideoJobPayloadAsset,
) {
  const candidateCreatedAt = normalizeOptionalString(candidate.createdAt);
  const existingCreatedAt = normalizeOptionalString(existing.createdAt);
  if (candidateCreatedAt && existingCreatedAt && candidateCreatedAt !== existingCreatedAt) {
    return candidateCreatedAt > existingCreatedAt;
  }

  if (candidateCreatedAt && !existingCreatedAt) {
    return true;
  }

  if (candidate.sortOrder !== existing.sortOrder) {
    return candidate.sortOrder > existing.sortOrder;
  }

  return candidate.id.localeCompare(existing.id) > 0;
}

function normalizeInputAssetClassification(
  asset: VideoJobPayloadAsset,
): Pick<VideoEditJobInputAsset, "role" | "scene_type" | "tags" | "labels" | "metadata"> {
  const role = normalizeOptionalString(asset.role);
  const sceneType = normalizeOptionalString(asset.sceneType);
  const tags = Array.isArray(asset.tags) ? uniqueStrings(asset.tags) : [];
  const labels = Array.isArray(asset.labels) ? uniqueStrings(asset.labels) : [];
  const metadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? asset.metadata
      : null;

  return {
    ...(role ? { role } : {}),
    ...(sceneType ? { scene_type: sceneType } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(metadata ? { metadata } : {}),
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
    "Video worker input assets must use aliyun_oss storage.",
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
        sourceRole: "merchant_broll" as const,
      };
    });
}

function stripDisplayOnlyDurationLines(scriptText: string) {
  return scriptText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(预计时长|预计成片|目标时长|成片时长|视频时长|总时长)\s*[：:]/.test(line))
    .join("\n")
    .trim();
}

function inferSceneSourceRole(scene: VideoJobPayloadSceneInput): VideoEditJobSceneAssetQuery["sourceRole"] {
  if (scene.requiresUserUpload === true) {
    return "user_talking_head";
  }

  const sceneType = normalizeOptionalString(scene.sceneType)?.normalize("NFKC").toLowerCase() ?? "";
  const text = [
    scene.shotRequirement,
    scene.visual,
    scene.fallbackShot,
    ...(scene.materials ?? []),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();

  if (
    sceneType.includes("intro") ||
    sceneType.includes("outro") ||
    sceneType.includes("talking") ||
    sceneType.includes("口播") ||
    sceneType.includes("真人") ||
    sceneType.includes("出镜") ||
    text.includes("talking head") ||
    text.includes("口播") ||
    text.includes("真人") ||
    text.includes("出镜")
  ) {
    return "user_talking_head";
  }

  return "merchant_broll";
}

function isUserTalkingHeadAsset(
  asset: VideoEditJobInputAsset,
  draftId: string,
  options: { allowDraftInputHeuristic?: boolean } = {},
) {
  if (asset.asset_type !== "video") {
    return false;
  }
  if (!allowedWorkerInputStorageProviders.has(asset.storage_provider as WorkerInputStorageProvider)) {
    return false;
  }
  if (assetHasTalkingHeadClassification(asset)) {
    return true;
  }
  return (
    options.allowDraftInputHeuristic === true &&
    asset.storage_key.startsWith("draft-inputs/") &&
    asset.storage_key.includes(`/${draftId}/`)
  );
}

function markTalkingHeadInputAsset(asset: VideoEditJobInputAsset): VideoEditJobInputAsset {
  return {
    ...asset,
    role: "talking_head",
    scene_type: "talking_head",
    tags: uniqueStrings([...(asset.tags ?? []), "talking_head"]),
    labels: uniqueStrings([...(asset.labels ?? []), "talking_head"]),
    metadata: {
      ...(asset.metadata ?? {}),
      content_type: "talking_head",
      audio_source: "clone_voiceover",
      subtitle_source: "script_audio_alignment",
      lip_sync_provider: "aliyun_videoretalk",
      lip_sync_video_requirements: lipSyncInputRequirements.video,
    },
  };
}

function assetHasTalkingHeadClassification(asset: VideoEditJobInputAsset) {
  const values = [
    asset.role,
    asset.scene_type,
    ...(asset.tags ?? []),
    ...(asset.labels ?? []),
  ];
  if (asset.metadata && typeof asset.metadata === "object") {
    for (const key of ["role", "scene_type", "sceneType", "asset_type", "assetType", "content_type"]) {
      const value = asset.metadata[key];
      if (typeof value === "string") {
        values.push(value);
      }
    }
    for (const key of ["tags", "labels"]) {
      const value = asset.metadata[key];
      if (Array.isArray(value)) {
        values.push(...value.map((item) => String(item)));
      }
    }
  }

  const normalized = values
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-"))
    .filter(Boolean);
  return normalized.some((value) =>
    ["talking-head", "talkinghead", "user-talking-head", "真人口播", "口播", "出镜讲解", "人物讲解"].includes(value),
  );
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
    : ["当前草稿没有可剪辑视频素材，请上传开头或结尾真人口播视频后重试。"];
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
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}
