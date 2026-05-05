import type { VideoScriptScene } from "./video-growth-context.ts";

export type ScriptProductionBrief = {
  platform: "douyin";
  contentForm: "video";
  topicDirection: string;
  targetAudiences: string[];
  accountPositioning: string;
  businessScope: string | null;
  contentScope: string | null;
  productOrServiceInfo: string[];
  customerAdvantages: string[];
  ctaOptions: string[];
  forbiddenExpressions: string[];
  brandTone: string | null;
  strategyAssetMarkdown?: string | null;
  availableMaterials: Array<{
    title: string;
    description?: string | null;
    platform?: string | null;
    materialType?: string | null;
    sourceKind?: string | null;
    engagementLabel?: string | null;
  }>;
  availableScenes: string[];
  customerRequirement: string | null;
  consultationConclusion: {
    summaryText: string | null;
    currentSuggestion: string | null;
    videoHook: string | null;
    videoOutcome: string | null;
    contentCalendarTag: string | null;
  };
  evidenceReferences?: Array<{
    title: string;
    content: string;
    source: "knowledge_base" | "material" | "consultation" | "manual";
    score?: number | null;
  }>;
};

export type ScriptProductionAgentMessage = {
  role: "system" | "user";
  content: string;
};

export type ScriptProductionVersion = {
  baseVersionId: string | null;
  versionNo: number | null;
  changeSummary: string | null;
  title: string;
  hook: string;
  whyThisWorks: string;
  ctaText: string;
  scriptText: string;
  scenes: VideoScriptScene[];
};

export type VideoScriptRevisionIntent = "semantic" | "production";

export type VideoScriptRevisionContext = {
  currentVariantId: string;
  currentScriptText: string;
  revisionInstruction: string;
  revisionIntent: VideoScriptRevisionIntent;
};

export type ScriptProductionBriefValidation =
  | {
      ready: true;
      missingFields: [];
      questions: [];
    }
  | {
      ready: false;
      missingFields: string[];
      questions: string[];
    };

export type ScriptProductionAgentParseResult =
  | {
      mode: "llm";
      version: ScriptProductionVersion;
      riskNotes: string[];
      confirmQuestions: string[];
      productionGoal: string | null;
      evidenceSummary: string[];
    }
  | {
      mode: "needs_more_info";
      version: null;
      missingFields: string[];
      questions: string[];
      reason: string | null;
    }
  | {
      mode: "parse_error";
      version: null;
      error: string;
      rawContent: string;
    };

export function classifyVideoScriptRevisionIntent(
  instruction: string | null | undefined,
): VideoScriptRevisionIntent {
  const text = instruction?.trim() ?? "";

  if (!text) {
    return "semantic";
  }

  const productionPatterns = [
    /字幕/,
    /音乐|bgm|BGM/i,
    /剪辑|转场|运镜|镜头顺序/,
    /封面/,
    /画幅|比例|尺寸/,
    /音量|配音|音效/,
    /节奏.*快|节奏.*慢/,
    /素材顺序|素材位置|画面顺序/,
  ];

  return productionPatterns.some((pattern) => pattern.test(text)) ? "production" : "semantic";
}

export function validateScriptProductionBrief(
  brief: ScriptProductionBrief,
): ScriptProductionBriefValidation {
  const missingFields: string[] = [];

  if (brief.platform !== "douyin") {
    missingFields.push("platform");
  }

  if (brief.contentForm !== "video") {
    missingFields.push("content_form");
  }

  if (!hasText(brief.topicDirection)) {
    missingFields.push("topic_direction");
  }

  if (!brief.targetAudiences.some(hasText)) {
    missingFields.push("target_audiences");
  }

  if (!hasText(brief.accountPositioning)) {
    missingFields.push("account_positioning");
  }

  if (!brief.productOrServiceInfo.some(hasText)) {
    missingFields.push("product_or_service_info");
  }

  if (!brief.ctaOptions.some(hasText) && !hasCtaInText(brief.customerRequirement)) {
    missingFields.push("cta");
  }

  if (!brief.availableMaterials.some(hasUsableMaterial) && !brief.availableScenes.some(hasText)) {
    missingFields.push("available_material_or_scene");
  }

  if (missingFields.length === 0) {
    return {
      ready: true,
      missingFields: [],
      questions: [],
    };
  }

  return {
    ready: false,
    missingFields,
    questions: missingFields.map(questionForMissingField),
  };
}

export function parseScriptProductionAgentResponse(
  content: string,
  options?: {
    brief?: ScriptProductionBrief | null;
  },
): ScriptProductionAgentParseResult {
  void options;

  try {
    const payload = parseJsonObject(content);
    const status = stringValue(payload.status);

    if (status === "needs_more_info") {
      return {
        mode: "needs_more_info",
        version: null,
        missingFields: stringArray(payload.missingFields),
        questions: stringArray(payload.questions),
        reason: stringValue(payload.reason),
      };
    }

    if (status !== "ready") {
      throw new Error(`Unsupported script production status: ${status ?? "unknown"}.`);
    }

    const version = normalizeScriptVersion(payload.version);

    return {
      mode: "llm",
      version,
      riskNotes: stringArray(payload.riskNotes),
      confirmQuestions: stringArray(payload.confirmQuestions),
      productionGoal: stringValue(payload.productionGoal),
      evidenceSummary: stringArray(payload.evidenceSummary),
    };
  } catch (error) {
    return {
      mode: "parse_error",
      version: null,
      error: error instanceof Error ? error.message : "Unknown script production parse error.",
      rawContent: content,
    };
  }
}

function normalizeScriptVersion(rawVersion: unknown): ScriptProductionVersion {
  const versionRecord = toRecord(rawVersion);
  const nestedScriptRecord = toRecord(versionRecord.script);
  const scriptRecord = Object.keys(nestedScriptRecord).length > 0 ? nestedScriptRecord : versionRecord;
  const title = firstStringValue(scriptRecord.title, versionRecord.title);
  const hook = firstStringValue(scriptRecord.hook, versionRecord.hook);
  const whyThisWorks = firstStringValue(
    scriptRecord.whyThisWorks,
    scriptRecord.reason,
    scriptRecord.rationale,
    versionRecord.whyThisWorks,
  );
  const ctaText = firstStringValue(
    scriptRecord.ctaText,
    scriptRecord.cta,
    scriptRecord.callToAction,
    versionRecord.ctaText,
  );
  const scenes = normalizeScenes(scriptRecord.scenes);
  const scriptText =
    firstStringValue(
      scriptRecord.scriptText,
      scriptRecord.fullScript,
      scriptRecord.scriptContent,
      scriptRecord.content,
    ) ?? formatScriptTextFromScenes(scenes);

  if (!title || !hook || !whyThisWorks || !ctaText || !scriptText || scenes.length === 0) {
    throw new Error("No usable script production version returned by LLM.");
  }

  return {
    baseVersionId: stringValue(versionRecord.baseVersionId),
    versionNo: numberValue(versionRecord.versionNo),
    changeSummary: stringValue(versionRecord.changeSummary),
    title,
    hook,
    whyThisWorks,
    ctaText,
    scriptText,
    scenes,
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);

  return toRecord(parsed);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function normalizeScenes(value: unknown): VideoScriptScene[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = toRecord(item);
      const sceneNo = numberValue(record.sceneNo) ?? index + 1;
      const timeRange = stringValue(record.timeRange);
      const shotRequirement =
        stringValue(record.shotRequirement) ??
        stringValue(record.scenePlan) ??
        stringValue(record.shot) ??
        stringValue(record.visualRequirement) ??
        stringValue(record.pictureRequirement);
      const visual =
        stringValue(record.visual) ??
        stringValue(record.picture) ??
        stringValue(record.image) ??
        shotRequirement;
      const voiceover =
        stringValue(record.voiceover) ??
        stringValue(record.voiceOver) ??
        stringValue(record.dialogue) ??
        stringValue(record.dialog) ??
        stringValue(record.line);
      const subtitle =
        stringValue(record.subtitle) ??
        stringValue(record.caption) ??
        voiceover ??
        "";
      const materialValues = stringArray(record.materials);
      const requiredMaterialValues = stringArray(record.requiredMaterials);
      const materials =
        materialValues.length > 0
          ? materialValues
          : requiredMaterialValues.length > 0
            ? requiredMaterialValues
            : stringArray(record.assets);
      const cameraMovement = stringValue(record.cameraMovement) ?? "固定机位或轻微推进";
      const purpose =
        stringValue(record.purpose) ??
        stringValue(record.shotPurpose) ??
        "服务本镜头的信息表达";
      const fallbackShot =
        stringValue(record.fallbackShot) ??
        stringValue(record.fallback) ??
        "素材不足时使用同场景近景替代";

      if (!timeRange || !shotRequirement || !visual || !voiceover) {
        return null;
      }

      return {
        sceneNo,
        timeRange,
        shotRequirement,
        visual,
        voiceover,
        subtitle,
        materials,
        cameraMovement,
        purpose,
        fallbackShot,
      };
    })
    .filter((scene): scene is VideoScriptScene => Boolean(scene));
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatScriptTextFromScenes(scenes: VideoScriptScene[]) {
  if (scenes.length === 0) {
    return null;
  }

  return scenes
    .map((scene) =>
      [
        `Scene ${scene.sceneNo} | ${scene.timeRange}`,
        `镜头要求：${scene.shotRequirement}`,
        `画面：${scene.visual}`,
        `台词：${scene.voiceover}`,
        `字幕：${scene.subtitle}`,
        `素材：${scene.materials.join("、") || "按现场素材确认"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasCtaInText(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 && /CTA|call\s*to\s*action|行动|预约|私信|领取|咨询/i.test(text);
}

function hasUsableMaterial(material: ScriptProductionBrief["availableMaterials"][number]) {
  return hasText(material.title) || hasText(material.description);
}

function questionForMissingField(field: string) {
  switch (field) {
    case "platform":
      return "咨询台或内容日历上下文没有带入发布平台，请检查入口参数是否完整。";
    case "content_form":
      return "当前请求没有带入内容形式，请检查是否从视频工作台发起短视频脚本生成。";
    case "topic_direction":
      return "咨询台或内容日历上下文没有带入本条视频主题方向，请先补齐选题信息。";
    case "target_audiences":
      return "咨询台上下文没有带入目标受众，请先回咨询台补齐并确认。";
    case "account_positioning":
      return "咨询台上下文没有带入账号定位，请先回咨询台补齐定位信息。";
    case "product_or_service_info":
      return "咨询台上下文没有带入主卖点、产品或服务信息，请先补齐业务信息。";
    case "cta":
      return "咨询台上下文没有带入明确 CTA，请先确认希望用户看完后私信、预约、领取方案或到店咨询。";
    case "available_material_or_scene":
      return "视频工作台还缺少可用素材、可拍摄场景或拍摄限制，请补充可拍什么、不能拍什么，或先绑定素材。";
    default:
      return `当前上下文缺少 ${field}，请检查咨询台或视频工作台是否已传入。`;
  }
}
