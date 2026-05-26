import type {
  DailyArticleContentPackageDto,
  DailyVideoScriptPackageDto,
  DailyVideoScriptSceneDto,
} from "@/contracts/daily-task";

export type DifyFinalJson = {
  status: "passed" | "needs_review" | "blocked" | string;
  article: {
    title: string;
    coverCopy: string;
    images: Array<{
      cosPath: string;
      role: string;
    }>;
    copyText: string;
  };
  video: {
    storyOutline: string;
    estimatedDuration: string;
    bgm: string;
    toneOfVoice: string;
    scenes: DifyFinalVideoScene[];
  };
  quality: {
    riskTerms: string[];
  };
};

export type DifyFinalVideoScene = {
  sceneNo: number;
  timeRange: string;
  durationSec: number;
  sceneType: string;
  title: string;
  requiresUserUpload: boolean;
  purpose: string;
  taskDescription: string;
  visualDescription: string;
  voiceover: string;
  subtitle: string;
  shotLanguage: {
    framing: string;
    cameraMovement: string;
    orientation: string;
    composition: string;
  };
  filmingGuide: {
    method: string;
    location: string;
    posture: string;
    tips: string[];
  };
  editGuide: {
    transition: string;
    pacing: string;
    minUsableSeconds: number;
  };
  assetQuery: string;
};

const removedFinalJsonKeys = new Set([
  "workflowVersion",
  "articlePackage",
  "titleStrategy",
  "videoScript",
  "memberDelivery",
  "workerDelivery",
  "qualityReview",
  "trace",
  "saveHints",
  "assetId",
  "imageBriefIfMissing",
  "blocks",
  "props",
  "fallbackVisual",
  "scores",
  "debug",
  "pass",
  "blockingReasons",
  "missingInputs",
]);

export function parseDifyFinalJson(input: unknown): DifyFinalJson {
  const payload = typeof input === "string" ? parseJsonObject(input) : toRecord(input);
  const topLevelKeys = Object.keys(payload).sort();

  if (topLevelKeys.join("|") !== "article|quality|status|video") {
    throw new Error(`Dify final JSON top-level keys mismatch: ${topLevelKeys.join(", ")}`);
  }

  assertNoRemovedKeys(payload);

  const article = toRecord(payload.article);
  const video = toRecord(payload.video);
  const quality = toRecord(payload.quality);
  const scenes = toRecordArray(video.scenes).map(normalizeDifyScene);

  if (!scenes.length) {
    throw new Error("Dify final JSON video.scenes is empty.");
  }

  return {
    status: readRequiredString(payload.status, "status"),
    article: {
      title: readRequiredString(article.title, "article.title"),
      coverCopy: readRequiredString(article.coverCopy, "article.coverCopy"),
      copyText: readRequiredString(article.copyText, "article.copyText"),
      images: toRecordArray(article.images).map((image, index) => ({
        cosPath: readRequiredString(image.cosPath, `article.images[${index}].cosPath`),
        role: readRequiredString(image.role, `article.images[${index}].role`),
      })),
    },
    video: {
      storyOutline: readRequiredString(video.storyOutline, "video.storyOutline"),
      estimatedDuration: readRequiredString(video.estimatedDuration, "video.estimatedDuration"),
      bgm: readRequiredString(video.bgm, "video.bgm"),
      toneOfVoice: readRequiredString(video.toneOfVoice, "video.toneOfVoice"),
      scenes,
    },
    quality: {
      riskTerms: toStringArray(quality.riskTerms),
    },
  };
}

export function mapDifyArticleToMemberPackage(input: {
  finalJson: DifyFinalJson;
  generatedAt?: string;
  fallbackCta?: string | null;
}): DailyArticleContentPackageDto {
  const article = input.finalJson.article;

  return {
    title: article.title,
    body: article.copyText,
    hashtags: extractHashtags(article.copyText),
    cta: input.fallbackCta?.trim() || "想了解具体户型和看房安排，可以私信我。",
    coverText: article.coverCopy,
    imageAssets: article.images.map((image, index) => ({
      id: `${normalizeIdSegment(image.role || "image")}-${index + 1}`,
      title: image.role === "cover" ? "封面图" : `配图 ${index + 1}`,
      description: null,
      url: buildDifyImageRenderUrl(image.cosPath),
      source: "dify_cos",
    })),
    imageBriefs: [],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function mapDifyVideoToMemberPackage(input: {
  finalJson: DifyFinalJson;
  generatedAt?: string;
  fallbackTitle?: string | null;
}): DailyVideoScriptPackageDto {
  const video = input.finalJson.video;
  const scenes = video.scenes.map(mapDifySceneToMemberScene);
  const firstVoiceover = scenes.find((scene) => scene.spokenText.trim())?.spokenText ?? "";
  const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return {
    title: input.fallbackTitle?.trim() || video.scenes[0]?.title || "今日视频镜头脚本",
    hook: firstVoiceover || video.storyOutline,
    storyOutline: video.storyOutline,
    targetDurationSeconds: totalDurationSeconds || parseDurationSeconds(video.estimatedDuration),
    scenes,
    cta: [...scenes].reverse().find((scene) => scene.spokenText.trim())?.spokenText ?? "",
    materialChecklist: scenes
      .filter((scene) => scene.required)
      .map((scene) => scene.materialSlot),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function buildDifyImageRenderUrl(storagePath: string): string {
  const value = storagePath.trim();

  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }

  return `/api/media/object-preview?path=${encodeURIComponent(value)}`;
}

function mapDifySceneToMemberScene(scene: DifyFinalVideoScene): DailyVideoScriptSceneDto {
  return {
    id: `scene-${scene.sceneNo}`,
    order: scene.sceneNo,
    title: scene.title,
    durationSeconds: scene.durationSec,
    camera: scene.visualDescription,
    spokenText: scene.voiceover || scene.subtitle || scene.taskDescription,
    subtitle: scene.subtitle || scene.voiceover,
    shootingGuide: compactStrings([
      scene.filmingGuide.method,
      scene.filmingGuide.location ? `地点：${scene.filmingGuide.location}` : "",
      scene.filmingGuide.posture ? `姿态：${scene.filmingGuide.posture}` : "",
      ...scene.filmingGuide.tips,
    ]).join("\n"),
    materialSlot: scene.taskDescription || scene.title,
    required: scene.requiresUserUpload,
  };
}

function normalizeDifyScene(value: Record<string, unknown>, index: number): DifyFinalVideoScene {
  const sceneNo = readNumber(value.sceneNo, index + 1);
  const shotLanguage = toRecord(value.shotLanguage);
  const filmingGuide = toRecord(value.filmingGuide);
  const editGuide = toRecord(value.editGuide);

  return {
    sceneNo,
    timeRange: readRequiredString(value.timeRange, `video.scenes[${index}].timeRange`),
    durationSec: readNumber(value.durationSec, 5),
    sceneType: readRequiredString(value.sceneType, `video.scenes[${index}].sceneType`),
    title: readRequiredString(value.title, `video.scenes[${index}].title`),
    requiresUserUpload: value.requiresUserUpload === true,
    purpose: readRequiredString(value.purpose, `video.scenes[${index}].purpose`),
    taskDescription: readRequiredString(
      value.taskDescription,
      `video.scenes[${index}].taskDescription`,
    ),
    visualDescription: readRequiredString(
      value.visualDescription,
      `video.scenes[${index}].visualDescription`,
    ),
    voiceover: readString(value.voiceover),
    subtitle: readString(value.subtitle),
    shotLanguage: {
      framing: readString(shotLanguage.framing),
      cameraMovement: readString(shotLanguage.cameraMovement),
      orientation: readString(shotLanguage.orientation),
      composition: readString(shotLanguage.composition),
    },
    filmingGuide: {
      method: readRequiredString(
        filmingGuide.method,
        `video.scenes[${index}].filmingGuide.method`,
      ),
      location: readRequiredString(
        filmingGuide.location,
        `video.scenes[${index}].filmingGuide.location`,
      ),
      posture: readString(filmingGuide.posture),
      tips: toStringArray(filmingGuide.tips),
    },
    editGuide: {
      transition: readString(editGuide.transition),
      pacing: readString(editGuide.pacing),
      minUsableSeconds: readNumber(editGuide.minUsableSeconds, 3),
    },
    assetQuery: readString(value.assetQuery),
  };
}

function assertNoRemovedKeys(value: unknown) {
  const present = new Set<string>();

  for (const key of walkKeys(value)) {
    if (removedFinalJsonKeys.has(key)) {
      present.add(key);
    }
  }

  if (present.size) {
    throw new Error(`Dify final JSON still contains removed keys: ${Array.from(present).sort().join(", ")}`);
  }
}

function* walkKeys(value: unknown): Generator<string> {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) {
        yield* walkKeys(item);
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      yield key;
      yield* walkKeys(child);
    }
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return toRecord(parsed);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = readString(value);

  if (!text) {
    throw new Error(`Dify final JSON missing ${fieldName}.`);
  }

  return text;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function extractHashtags(text: string): string[] {
  return Array.from(new Set(text.match(/#[^\s#，,。；;、]+/g) ?? [])).map((tag) =>
    tag.replace(/^#/, ""),
  );
}

function parseDurationSeconds(value: string): number {
  const matches = value.match(/\d+/g)?.map((item) => Number.parseInt(item, 10)) ?? [];
  const numbers = matches.filter((item) => Number.isFinite(item) && item > 0);

  if (!numbers.length) {
    return 45;
  }

  return Math.max(...numbers);
}

function normalizeIdSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "image";
}

function compactStrings(values: string[]) {
  return values.filter((value) => Boolean(value.trim()));
}
