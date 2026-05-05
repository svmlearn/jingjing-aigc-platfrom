type StrategySnapshot = {
  positioning: string;
  coreSellingPoints: string[];
  targetAudiences: string[];
  keyScenes: string[];
  currentSuggestion: string;
  strategyTags: string[];
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
  const audience = first(snapshot.targetAudiences, "首次咨询前还在比较的用户");
  const scene = first(snapshot.keyScenes, "到店前决策");
  const sellingPoint = first(snapshot.coreSellingPoints, input.merchant.name);
  const cta = first(input.merchant.defaultCta, snapshot.videoBrief?.outcome || "私信预约体验");
  const hasConcreteInputs = snapshot.targetAudiences.length > 0 && snapshot.coreSellingPoints.length > 0;
  const strategy = {
    acquisitionGoal: cta.includes("预约") ? ("appointment" as const) : ("consultation" as const),
    audienceStage: cta.includes("到店") ? ("decision" as const) : ("consideration" as const),
    targetAudience: audience,
    platformStrategy: {
      platform: "douyin" as const,
      format: "vertical_short_video" as const,
      primaryMechanic: "3 秒钩子 + 场景证明 + 明确 CTA",
    },
    contentHypothesis: `如果先呈现${scene}中的${sellingPoint}，${audience}会更愿意${cta}。`,
    messageAngle: cta.includes("体验") ? ("offer_conversion" as const) : ("trust_building" as const),
    ctaStrategy: cta,
    lockedClaims: uniqueStrings([sellingPoint, ...snapshot.coreSellingPoints]),
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
    missingInputs: hasConcreteInputs ? [] : ["targetAudiences", "coreSellingPoints"],
    rewriteSuggestions: [
      "开头用具体到店前决策场景，不用泛泛痛点。",
      "CTA 与用户阶段匹配，优先引导私信或预约体验。",
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
        input.selectedCalendarItem?.strategyTag ??
        input.strategyTag ??
        first(snapshot.strategyTags, null),
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
    scriptCandidates: buildCandidateSummaries({
      merchantName: input.merchant.name,
      hook: snapshot.videoBrief?.hook || "第一次到店前，先看这 3 个细节",
      cta,
      strategy,
    }),
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
  const snapshot = input.session.strategySnapshot;
  const audience = input.scriptContext.strategy.targetAudience;
  const scene = first(snapshot.keyScenes, "到店前决策");
  const sellingPoint = first(snapshot.coreSellingPoints, input.merchantName);
  const cta = input.scriptContext.strategy.ctaStrategy;
  const materialLine = input.material
    ? `参考素材「${input.material.title}」的结构，把可信细节讲得更具体。`
    : "使用真实门店、人物动作和细节特写承接信任。";

  return [
    {
      candidateType: "safe_conversion",
      title: `${audience}最关心的，不是价格`,
      hook: `如果你也在比较门店，先别急着看价格。`,
      whyThisWorks: "先降低决策压力，再用服务细节承接咨询，适合稳妥转化。",
      strategyTrace: strategyTrace(input.scriptContext),
      ctaText: cta,
      scenes: buildFallbackScenes({
        scene,
        sellingPoint,
        cta,
        materialLine,
        hook: `如果你也在比较门店，先别急着看价格，先看这几个细节。`,
        candidateType: "safe_conversion",
      }),
      scriptText: [
        "Scene 1 | 00:00-00:05",
        `画面：${scene} 的真实门店镜头，字幕直接点出用户正在比较。`,
        `台词：如果你也在比较门店，先别急着看价格，先看这几个细节。`,
        "",
        "Scene 2 | 00:05-00:18",
        `画面：服务流程、环境、老师动作细节。`,
        `台词：真正影响体验的，是${sellingPoint}这些能不能稳定交付。`,
        "",
        "Scene 3 | 00:18-00:35",
        `画面：用一组近景说明服务标准。${materialLine}`,
        `台词：我们更希望你先知道怎么判断，再决定要不要来体验。`,
        "",
        "Scene 4 | 00:35-00:45",
        `画面：回到咨询动作。`,
        `台词：${cta}。${input.extraRequirement ? `补充要求：${input.extraRequirement}` : ""}`,
      ].join("\n"),
    },
    {
      candidateType: "strong_hook",
      title: `别被门店宣传词骗了，先看这 3 个细节`,
      hook: `一家店靠不靠谱，别只听宣传词。`,
      whyThisWorks: "开头冲突更强，适合提高停留，但仍保留专业边界。",
      strategyTrace: strategyTrace(input.scriptContext),
      ctaText: cta,
      scenes: buildFallbackScenes({
        scene,
        sellingPoint,
        cta,
        materialLine,
        hook: `一家店靠不靠谱，别只听宣传词，先看这 3 个细节。`,
        candidateType: "strong_hook",
      }),
      scriptText: [
        "Scene 1 | 00:00-00:04",
        `画面：快速切 3 个门店细节特写。`,
        `台词：一家店靠不靠谱，别只听宣传词，先看这 3 个细节。`,
        "",
        "Scene 2 | 00:04-00:16",
        `画面：真实环境和服务动作对比空泛承诺。`,
        `台词：第一个，看环境是否真实；第二个，看流程是否清楚；第三个，看老师是否能讲明你的问题。`,
        "",
        "Scene 3 | 00:16-00:35",
        `画面：聚焦${sellingPoint}，给出具体例子。${materialLine}`,
        `台词：这些细节，比一句“很专业”更能说明体验。`,
        "",
        "Scene 4 | 00:35-00:45",
        `画面：展示预约/私信入口。`,
        `台词：${cta}。`,
      ].join("\n"),
    },
    {
      candidateType: "trust_expert",
      title: snapshot.videoBrief?.workingTitle || "第一次到店前，先看这 3 个细节",
      hook: snapshot.videoBrief?.hook || "如果你不知道怎么判断一家店靠不靠谱，先看这 3 个细节。",
      whyThisWorks: "用专家式拆解回应信任顾虑，适合提高咨询质量。",
      strategyTrace: strategyTrace(input.scriptContext),
      ctaText: cta,
      scenes: buildFallbackScenes({
        scene,
        sellingPoint,
        cta,
        materialLine,
        hook:
          snapshot.videoBrief?.hook ||
          "如果你不知道怎么判断一家店靠不靠谱，先看这 3 个细节。",
        candidateType: "trust_expert",
      }),
      scriptText: [
        "Scene 1 | 00:00-00:05",
        `画面：门店空间推进，出现${scene}相关字幕。`,
        `台词：${snapshot.videoBrief?.hook || "如果你不知道怎么判断一家店靠不靠谱，先看这 3 个细节。"}`,
        "",
        "Scene 2 | 00:05-00:18",
        `画面：老师讲解或服务前评估。`,
        `台词：对${audience}来说，重点不是被立刻成交，而是先判断这家店是否真的理解你的问题。`,
        "",
        "Scene 3 | 00:18-00:36",
        `画面：用${sellingPoint}做专业证明。${materialLine}`,
        `台词：我们会先把问题讲清楚，再给你适合的体验建议。`,
        "",
        "Scene 4 | 00:36-00:45",
        `画面：回到私信或预约动作。`,
        `台词：${cta}。`,
      ].join("\n"),
    },
  ];
}

function buildCandidateSummaries(input: {
  merchantName: string;
  hook: string;
  cta: string;
  strategy: VideoGrowthContext["strategy"];
}): VideoGrowthContext["scriptCandidates"] {
  return [
    {
      candidateType: "safe_conversion",
      title: `${input.merchantName} 的保守成交版`,
      hook: "如果你也在比较门店，先别急着看价格。",
      whyThisWorks: "降低决策压力，稳妥承接咨询。",
      strategyTrace: {
        acquisitionGoal: input.strategy.acquisitionGoal,
        audienceStage: input.strategy.audienceStage,
        contentHypothesis: input.strategy.contentHypothesis,
      },
    },
    {
      candidateType: "strong_hook",
      title: "强钩子停留版",
      hook: "一家店靠不靠谱，别只听宣传词。",
      whyThisWorks: "用更强冲突提高前三秒停留。",
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
      whyThisWorks: `用专家式拆解承接「${input.cta}」。`,
      strategyTrace: {
        acquisitionGoal: input.strategy.acquisitionGoal,
        audienceStage: input.strategy.audienceStage,
        contentHypothesis: input.strategy.contentHypothesis,
      },
    },
  ];
}

function strategyTrace(scriptContext: VideoScriptContext) {
  return {
    acquisitionGoal: scriptContext.strategy.acquisitionGoal,
    audienceStage: scriptContext.strategy.audienceStage,
    contentHypothesis: scriptContext.strategy.contentHypothesis,
  };
}

function buildFallbackScenes(input: {
  scene: string;
  sellingPoint: string;
  cta: string;
  materialLine: string;
  hook: string;
  candidateType: VideoScriptCandidateType;
}): VideoScriptScene[] {
  const openingMovement =
    input.candidateType === "strong_hook" ? "快速切入细节特写" : "稳定推进到门店场景";

  return [
    {
      sceneNo: 1,
      timeRange: "00:00-00:05",
      shotRequirement: "开头必须建立观看理由，直接让用户知道这条视频要解决什么判断问题。",
      visual: `${input.scene} 的真实门店画面，优先使用门头、环境、人物动作或服务前准备镜头。`,
      voiceover: input.hook,
      subtitle: input.hook,
      materials: ["门店环境", "人物动作", "服务准备细节"],
      cameraMovement: openingMovement,
      purpose: "建立钩子和场景可信度。",
      fallbackShot: "如果没有人物出镜，用门店环境特写加字幕完成开头。",
    },
    {
      sceneNo: 2,
      timeRange: "00:05-00:18",
      shotRequirement: "用具体动作证明服务标准，不要只说抽象形容词。",
      visual: `展示${input.sellingPoint}相关的服务动作、环境细节或老师讲解过程。`,
      voiceover: `真正影响体验的，是${input.sellingPoint}这些细节能不能稳定交付。`,
      subtitle: `先看细节，再判断是否适合自己。`,
      materials: ["服务动作", "环境细节", "老师讲解"],
      cameraMovement: "中景到近景切换",
      purpose: "承接用户顾虑，给出可信证据。",
      fallbackShot: "如果没有完整服务流程，用手部动作、器械、环境细节组合替代。",
    },
    {
      sceneNo: 3,
      timeRange: "00:18-00:35",
      shotRequirement: "把参考素材转成客户可拍的证明镜头，避免照搬对标内容。",
      visual: input.materialLine,
      voiceover: "我们更希望你先知道怎么判断，再决定要不要来体验。",
      subtitle: "先判断，再体验。",
      materials: ["参考素材", "门店细节", "可拍证明镜头"],
      cameraMovement: "固定机位加细节切换",
      purpose: "把卖点落到可见证据。",
      fallbackShot: "如果参考素材不足，用门店真实细节和字幕说明替代。",
    },
    {
      sceneNo: 4,
      timeRange: "00:35-00:45",
      shotRequirement: "结尾必须给出明确动作，不能只停在品牌露出。",
      visual: "回到咨询、预约或私信动作，画面保持简洁。",
      voiceover: input.cta,
      subtitle: input.cta,
      materials: ["预约入口", "私信提示", "门店收尾镜头"],
      cameraMovement: "固定机位或轻微推进",
      purpose: "完成转化引导。",
      fallbackShot: "如果不能展示界面，用口播加字幕明确 CTA。",
    },
  ];
}

function first<T>(values: T[], fallback: T): T {
  return values.find((value) => Boolean(value)) ?? fallback;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
