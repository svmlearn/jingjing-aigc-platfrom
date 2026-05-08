type StrategySnapshot = {
  positioning: string;
  coreSellingPoints: string[];
  targetAudiences: string[];
  keyScenes: string[];
  currentSuggestion: string;
  strategyTags: string[];
  contentCalendarDraft?: unknown[];
  articleBrief?: unknown | null;
  videoBrief?: {
    workingTitle: string;
    hook: string;
    outcome: string;
  } | null;
};

type SelectedVideoCalendarItem = {
  id: string;
  dayLabel: string;
  contentType: "video";
  strategyTag: string;
  title: string;
  summary: string;
} | null;

type VideoGrowthSession = {
  id: string;
  summaryText?: string | null;
  strategySnapshot: StrategySnapshot;
};

type VideoGrowthMerchant = {
  name: string;
  industry?: string | null;
  serviceItems: string[];
  defaultCta: string[];
  toneStyle?: string | null;
  forbiddenWords: string[];
};

type VideoGrowthMaterialContext = {
  referenceId?: string | null;
  materialId?: string | null;
  title?: string | null;
  platform?: string | null;
  materialType?: string | null;
  sourceKind?: string | null;
  engagementLabel?: string | null;
  description?: string | null;
} | null;

export type VideoScriptCandidateType = "safe_conversion" | "strong_hook" | "trust_expert";

export type VideoScriptScene = {
  sceneNo: number;
  timeRange: string;
  shotRequirement: string;
  visual: string;
  voiceover: string;
  subtitle: string;
  materials: string[];
  cameraMovement: string;
  purpose: string;
  fallbackShot: string;
};

export type VideoGrowthContext = {
  contextDigest: {
    merchantProfile: {
      name: string;
      industry: string | null;
      serviceItems: string[];
      defaultCta: string[];
      toneStyle: string | null;
      forbiddenWords: string[];
    };
    consultationSummary: {
      positioning: string;
      targetAudiences: string[];
      coreSellingPoints: string[];
      keyScenes: string[];
      summaryText: string | null;
      strategyAssetMarkdown: string | null;
    };
    selectedCalendarItem: {
      id: string | null;
      contentType: "video";
      strategyTag: string | null;
      title: string | null;
      dayLabel: string | null;
      summary: string | null;
    };
    materialContext: VideoGrowthMaterialContext;
    extraRequirement: string | null;
  };
  strategy: {
    acquisitionGoal: "consultation" | "appointment";
    audienceStage: "consideration" | "decision";
    targetAudience: string;
    platformStrategy: {
      platform: "douyin";
      format: "vertical_short_video";
      primaryMechanic: string;
    };
    contentHypothesis: string;
    messageAngle: "trust_building" | "offer_conversion";
    ctaStrategy: string;
    lockedClaims: string[];
  };
  critique: {
    score: number;
    risks: Array<{
      level: "low" | "medium";
      code: string;
      message: string;
    }>;
    missingInputs: string[];
    rewriteSuggestions: string[];
    passForDrafting: boolean;
  };
  scriptCandidates: Array<{
    candidateType: VideoScriptCandidateType;
    title: string;
    hook: string;
    whyThisWorks: string;
    strategyTrace: {
      acquisitionGoal: "consultation" | "appointment";
      audienceStage: "consideration" | "decision";
      contentHypothesis: string;
    };
  }>;
};

export type VideoScriptContext = VideoGrowthContext;

export type VideoScriptCandidate = VideoGrowthContext["scriptCandidates"][number] & {
  scriptText: string;
  ctaText: string;
  scenes: VideoScriptScene[];
};

export function buildVideoGrowthContext(input: {
  merchant: VideoGrowthMerchant;
  session: VideoGrowthSession;
  extraRequirement?: string | null;
  strategyAssetMarkdown?: string | null;
  materialContext: VideoGrowthMaterialContext;
  strategyTag?: string | null;
  selectedCalendarItem?: SelectedVideoCalendarItem;
}): VideoGrowthContext {
  const snapshot = input.session.strategySnapshot;
  const audience = firstString(snapshot.targetAudiences);
  const scene = firstString(snapshot.keyScenes);
  const sellingPoint = firstString(snapshot.coreSellingPoints);
  const cta = firstString(input.merchant.defaultCta) || snapshot.videoBrief?.outcome?.trim() || "";
  const hook =
    snapshot.videoBrief?.hook?.trim() ||
    input.selectedCalendarItem?.title?.trim() ||
    input.selectedCalendarItem?.summary?.trim() ||
    "";
  const missingInputs = compactStrings([
    audience ? "" : "targetAudiences",
    sellingPoint ? "" : "coreSellingPoints",
    scene ? "" : "keyScenes",
    cta ? "" : "cta",
    hook ? "" : "videoHookOrTopic",
  ]);
  const hasConcreteInputs = missingInputs.length === 0;
  const strategy = {
    acquisitionGoal: cta.includes("预约") ? ("appointment" as const) : ("consultation" as const),
    audienceStage: "consideration" as const,
    targetAudience: audience,
    platformStrategy: {
      platform: "douyin" as const,
      format: "vertical_short_video" as const,
      primaryMechanic: "基于已确认事实生成短视频脚本",
    },
    contentHypothesis: hasConcreteInputs
      ? `如果先呈现${scene}中的${sellingPoint}，${audience}会更愿意${cta}。`
      : "",
    messageAngle: "trust_building" as const,
    ctaStrategy: cta,
    lockedClaims: uniqueStrings([...snapshot.coreSellingPoints]),
  };
  const critique = {
    score: hasConcreteInputs ? 82 : 68,
    risks: hasConcreteInputs
      ? []
      : [
          {
            level: "medium" as const,
            code: "consultation_context_too_thin",
            message: "咨询上下文里的用户、卖点或场景还不够具体。",
          },
        ],
    missingInputs,
    rewriteSuggestions: [
      "先回咨询台补齐目标对象、核心卖点、关键场景和明确 CTA。",
      "资料不足时不要生成脚本草稿，先让用户确认缺口。",
    ],
    passForDrafting: hasConcreteInputs,
  };
  const contextDigest = {
    merchantProfile: {
      name: input.merchant.name,
      industry: input.merchant.industry ?? null,
      serviceItems: input.merchant.serviceItems,
      defaultCta: input.merchant.defaultCta,
      toneStyle: input.merchant.toneStyle ?? null,
      forbiddenWords: input.merchant.forbiddenWords,
    },
    consultationSummary: {
      positioning: snapshot.positioning,
      targetAudiences: snapshot.targetAudiences,
      coreSellingPoints: snapshot.coreSellingPoints,
      keyScenes: snapshot.keyScenes,
      summaryText: input.session.summaryText ?? null,
      strategyAssetMarkdown: input.strategyAssetMarkdown ?? null,
    },
    selectedCalendarItem: {
      id: input.selectedCalendarItem?.id ?? null,
      contentType: "video" as const,
      strategyTag:
        (input.selectedCalendarItem?.strategyTag ??
          input.strategyTag ??
          firstString(snapshot.strategyTags)) ||
        null,
      title: input.selectedCalendarItem?.title ?? snapshot.videoBrief?.workingTitle ?? null,
      dayLabel: input.selectedCalendarItem?.dayLabel ?? null,
      summary: input.selectedCalendarItem?.summary ?? null,
    },
    materialContext: input.materialContext,
    extraRequirement: input.extraRequirement ?? null,
  };

  return {
    contextDigest,
    strategy,
    critique,
    scriptCandidates: hasConcreteInputs
      ? buildCandidateSummaries({
          hook,
          cta,
          strategy,
        })
      : [],
  };
}

export function buildVideoScriptContext(
  input: Parameters<typeof buildVideoGrowthContext>[0],
): VideoScriptContext {
  return buildVideoGrowthContext(input);
}

export function buildVideoScriptCandidates(input: {
  merchantName: string;
  session: VideoGrowthSession;
  scriptContext: VideoScriptContext;
  extraRequirement?: string | null;
  material?: {
    title: string;
    description?: string | null;
  } | null;
}): VideoScriptCandidate[] {
  void input;

  return [];
}

function buildCandidateSummaries(input: {
  hook: string;
  cta: string;
  strategy: VideoGrowthContext["strategy"];
}): VideoGrowthContext["scriptCandidates"] {
  return [
    {
      candidateType: "safe_conversion",
      title: "稳妥表达方向",
      hook: input.hook,
      whyThisWorks: "基于已确认事实承接用户行动。",
      strategyTrace: {
        acquisitionGoal: input.strategy.acquisitionGoal,
        audienceStage: input.strategy.audienceStage,
        contentHypothesis: input.strategy.contentHypothesis,
      },
    },
    {
      candidateType: "strong_hook",
      title: "强钩子停留版",
      hook: input.hook,
      whyThisWorks: "在不新增事实的前提下强化开头吸引力。",
      strategyTrace: {
        acquisitionGoal: input.strategy.acquisitionGoal,
        audienceStage: input.strategy.audienceStage,
        contentHypothesis: input.strategy.contentHypothesis,
      },
    },
    {
      candidateType: "trust_expert",
      title: "专业信任版",
      hook: input.hook,
      whyThisWorks: `用已确认的专业判断承接「${input.cta}」。`,
      strategyTrace: {
        acquisitionGoal: input.strategy.acquisitionGoal,
        audienceStage: input.strategy.audienceStage,
        contentHypothesis: input.strategy.contentHypothesis,
      },
    },
  ];
}

function firstString(values: string[]) {
  return values.map((value) => value.trim()).find(Boolean) ?? "";
}

function compactStrings(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
