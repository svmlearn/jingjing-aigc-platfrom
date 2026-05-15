import type { ContentVariantDto, VideoScriptSceneDto } from "../contracts/draft.ts";

export type DifyMappedContentVariant = Pick<
  ContentVariantDto,
  | "platform"
  | "variantType"
  | "title"
  | "bodyText"
  | "scriptText"
  | "hashtags"
  | "ctaText"
  | "productionScenes"
  | "reviewStatus"
>;

export type DifyFinalResultMapping = {
  status: "ready" | "needs_review" | "blocked" | "schema_failed";
  schemaErrors: string[];
  workflowVersion: string | null;
  quality: Record<string, unknown> | null;
  debug: Record<string, unknown> | null;
  draftInputSnapshot: Record<string, unknown>;
  variants: DifyMappedContentVariant[];
};

export function extractDifyFinalResultJson(response: unknown) {
  const outputs = toRecord(toRecord(response).outputs);
  return parseFinalResultJson(outputs.final_result_json);
}

export function parseFinalResultJson(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return JSON.parse(trimmed) as unknown;
  }

  return value ?? null;
}

export function mapDifyFinalResultToVariants(value: unknown): DifyFinalResultMapping {
  const finalResult = toRecord(parseFinalResultJson(value));
  const workflowVersion = readString(finalResult.workflowVersion) ?? null;
  const article = toRecord(finalResult.article);
  const video = toRecord(finalResult.video);
  const quality = toRecord(finalResult.quality);
  const debug = toRecord(finalResult.debug);
  const schemaErrors = validateDifyFinalResult({
    workflowVersion,
    article,
    video,
    quality,
  });

  if (schemaErrors.length > 0) {
    return buildMapping({
      status: "schema_failed",
      schemaErrors,
      workflowVersion,
      quality,
      debug,
      variants: [],
    });
  }

  const qualityStatus = readString(quality.status);
  if (qualityStatus === "blocked" || quality.pass === false) {
    return buildMapping({
      status: "blocked",
      schemaErrors: [],
      workflowVersion,
      quality,
      debug,
      variants: [],
    });
  }

  const videoScenes = readArray(video.scenes).map((scene) => toRecord(scene));
  const variants: DifyMappedContentVariant[] = [
    {
      platform: "xiaohongshu",
      variantType: "note",
      title: readString(article.title),
      bodyText: readString(article.copyText),
      scriptText: null,
      hashtags: readStringArray(article.hashtags),
      ctaText: readString(article.ctaText),
      productionScenes: [],
      reviewStatus: "review_pending",
    },
    {
      platform: "douyin",
      variantType: "video_script",
      title: readString(video.title) ?? readString(article.title),
      bodyText: null,
      scriptText: buildVideoScriptText(video, videoScenes),
      hashtags: [],
      ctaText: readString(video.ctaText) ?? readString(article.ctaText),
      productionScenes: videoScenes.map(mapDifySceneToProductionScene),
      reviewStatus: "review_pending",
    },
  ];

  return buildMapping({
    status: qualityStatus === "needs_review" ? "needs_review" : "ready",
    schemaErrors: [],
    workflowVersion,
    quality,
    debug,
    variants,
  });
}

function validateDifyFinalResult(input: {
  workflowVersion: string | null;
  article: Record<string, unknown>;
  video: Record<string, unknown>;
  quality: Record<string, unknown>;
}) {
  const errors: string[] = [];
  requireString(input.workflowVersion, "workflowVersion", errors);
  requireString(input.article.title, "article.title", errors);
  requireString(input.article.coverCopy, "article.coverCopy", errors);
  requireString(input.article.copyText, "article.copyText", errors);
  const images = readArray(input.article.images);
  if (images.length === 0) {
    errors.push("article.images[] is required.");
  }
  for (const [index, image] of images.entries()) {
    const imageRecord = toRecord(image);
    requireString(imageRecord.cosPath, `article.images[${index}].cosPath`, errors);
    requireString(imageRecord.role, `article.images[${index}].role`, errors);
  }
  requireString(input.video.storyOutline, "video.storyOutline", errors);
  requireNumber(input.video.estimatedDuration, "video.estimatedDuration", errors);
  const scenes = readArray(input.video.scenes);
  if (scenes.length === 0) {
    errors.push("video.scenes[] is required.");
  }
  for (const [index, scene] of scenes.entries()) {
    const sceneRecord = toRecord(scene);
    requireNumber(sceneRecord.sceneNo, `video.scenes[${index}].sceneNo`, errors);
    requireString(sceneRecord.timeRange, `video.scenes[${index}].timeRange`, errors);
    requireNumber(sceneRecord.durationSec, `video.scenes[${index}].durationSec`, errors);
    requireString(sceneRecord.sceneType, `video.scenes[${index}].sceneType`, errors);
    requireString(sceneRecord.title, `video.scenes[${index}].title`, errors);
    requireBoolean(sceneRecord.requiresUserUpload, `video.scenes[${index}].requiresUserUpload`, errors);
    requireString(sceneRecord.taskDescription, `video.scenes[${index}].taskDescription`, errors);
    requireString(sceneRecord.visualDescription, `video.scenes[${index}].visualDescription`, errors);
    requireString(sceneRecord.voiceover, `video.scenes[${index}].voiceover`, errors);
  }
  requireString(input.quality.status, "quality.status", errors);
  if (typeof input.quality.pass !== "boolean") {
    errors.push("quality.pass must be a boolean.");
  }

  return errors;
}

function buildMapping(input: {
  status: DifyFinalResultMapping["status"];
  schemaErrors: string[];
  workflowVersion: string | null;
  quality: Record<string, unknown>;
  debug: Record<string, unknown>;
  variants: DifyMappedContentVariant[];
}): DifyFinalResultMapping {
  return {
    status: input.status,
    schemaErrors: input.schemaErrors,
    workflowVersion: input.workflowVersion,
    quality: hasKeys(input.quality) ? input.quality : null,
    debug: hasKeys(input.debug) ? input.debug : null,
    draftInputSnapshot: {
      source: "dify_final_result_json",
      workflowProvider: "dify",
      workflowVersion: input.workflowVersion,
      quality: input.quality,
      debug: input.debug,
      schemaErrors: input.schemaErrors,
    },
    variants: input.variants,
  };
}

function mapDifySceneToProductionScene(scene: Record<string, unknown>): VideoScriptSceneDto {
  const shotLanguage = toRecord(scene.shotLanguage);
  const filmingGuide = toRecord(scene.filmingGuide);
  const props = readStringArray(filmingGuide.props);
  const assetQuery = readString(scene.assetQuery);

  return {
    sceneNo: readNumber(scene.sceneNo) ?? 1,
    timeRange: readString(scene.timeRange) ?? "",
    shotRequirement:
      readString(scene.taskDescription) ??
      readString(scene.visualDescription) ??
      readString(scene.title) ??
      "",
    visual: readString(scene.visualDescription) ?? "",
    voiceover: readString(scene.voiceover) ?? "",
    subtitle: readString(scene.subtitle) ?? readString(scene.voiceover) ?? "",
    materials: [...props, ...(assetQuery ? [assetQuery] : [])],
    cameraMovement: readString(shotLanguage.cameraMovement) ?? "",
    purpose: readString(scene.purpose) ?? readString(scene.title) ?? "",
    fallbackShot: readString(scene.fallbackVisual) ?? "",
  };
}

function buildVideoScriptText(video: Record<string, unknown>, scenes: Record<string, unknown>[]) {
  return [
    readString(video.title),
    readString(video.storyOutline),
    ...scenes.flatMap((scene, index) => [
      `Scene ${readNumber(scene.sceneNo) ?? index + 1} | ${readString(scene.timeRange) ?? ""}`,
      `Visual: ${readString(scene.visualDescription) ?? ""}`,
      `Task: ${readString(scene.taskDescription) ?? ""}`,
      `Voiceover: ${readString(scene.voiceover) ?? ""}`,
      readString(scene.subtitle) ? `Subtitle: ${readString(scene.subtitle)}` : "",
      readString(scene.assetQuery) ? `Asset query: ${readString(scene.assetQuery)}` : "",
      readString(scene.fallbackVisual) ? `Fallback: ${readString(scene.fallbackVisual)}` : "",
    ]),
  ]
    .filter((line): line is string => Boolean(line?.trim()))
    .join("\n");
}

function requireString(value: unknown, path: string, errors: string[]) {
  if (!readString(value)) {
    errors.push(`${path} is required.`);
  }
}

function requireNumber(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a number.`);
  }
}

function requireBoolean(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean.`);
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasKeys(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}
