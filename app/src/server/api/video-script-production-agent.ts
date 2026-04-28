import type {
  VideoScriptCandidate,
  VideoScriptCandidateType,
} from "./video-growth-context.ts";

export const SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION = "script-production-agent-v1";

export const SCRIPT_PRODUCTION_AGENT_CANDIDATE_TYPES = [
  "safe_conversion",
  "strong_hook",
  "trust_expert",
] as const satisfies readonly VideoScriptCandidateType[];

export const SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT = [
  "你是「脚本制作 Agent」，运行在图文 / 视频工作台内部。",
  "你只负责把咨询台已经确认的信息转化为可确认、可拍摄、可交给制作层执行的视频脚本候选。",
  "咨询台结论快照、商家资料、素材信息、内容日历卡片和用户补充要求是你的事实边界。",
  "你不能重新诊断商家，不能重新定义账号定位、目标用户、商业方向或赛道判断。",
  "如果正式脚本所需信息不足，只能输出 needs_more_info 和补充问题，不能编写正式脚本。",
  "当前接口只生成抖音竖版短视频脚本，不生成图文正文，不替 worker 决定剪辑实现。",
  "你必须避开禁用表达、无依据效果承诺、绝对化表述和编造案例。",
  "你必须只输出 JSON，不输出 Markdown、解释文字或代码块。",
].join("\n");

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
  forbiddenExpressions: string[];
  brandTone: string | null;
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
      candidates: VideoScriptCandidate[];
      riskNotes: string[];
      confirmQuestions: string[];
      productionGoal: string | null;
      evidenceSummary: string[];
    }
  | {
      mode: "needs_more_info";
      candidates: [];
      missingFields: string[];
      questions: string[];
      reason: string | null;
    }
  | {
      mode: "fallback_parse_error";
      candidates: VideoScriptCandidate[];
      error: string;
      rawContent: string;
    };

export function buildScriptProductionAgentMessages(input: {
  brief: ScriptProductionBrief;
  systemPrompt?: string | null;
  revisionContext?: VideoScriptRevisionContext | null;
}): ScriptProductionAgentMessage[] {
  const systemPrompt = input.systemPrompt?.trim() || SCRIPT_PRODUCTION_AGENT_SYSTEM_PROMPT;

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: input.revisionContext
            ? "revise_video_script_candidates"
            : "generate_video_script_candidates",
          promptVersion: SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION,
          expectedCandidateTypes: SCRIPT_PRODUCTION_AGENT_CANDIDATE_TYPES,
          outputSchema: {
            status: "ready | needs_more_info",
            missingFields: "string[] when status is needs_more_info",
            questions: "string[] when status is needs_more_info",
            productionGoal: "string when status is ready",
            evidenceSummary: "string[]",
            candidates: [
              {
                candidateType: "safe_conversion | strong_hook | trust_expert",
                title: "string",
                hook: "string",
                whyThisWorks: "string",
                ctaText: "string",
                scriptText:
                  "string with scenes, timestamps,画面/台词/字幕/CTA; no markdown table",
              },
            ],
            riskNotes: "string[]",
            confirmQuestions: "string[]",
          },
          scriptProductionBrief: input.brief,
          revisionContext: input.revisionContext ?? null,
        },
        null,
        2,
      ),
    },
  ];
}

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
  fallbackCandidates: VideoScriptCandidate[],
  options?: {
    brief?: ScriptProductionBrief | null;
  },
): ScriptProductionAgentParseResult {
  try {
    const payload = parseJsonObject(content);
    const status = stringValue(payload.status);

    if (status === "needs_more_info") {
      return {
        mode: "needs_more_info",
        candidates: [],
        missingFields: stringArray(payload.missingFields),
        questions: stringArray(payload.questions),
        reason: stringValue(payload.reason),
      };
    }

    if (status !== "ready") {
      throw new Error(`Unsupported script production status: ${status ?? "unknown"}.`);
    }

    const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const normalizedCandidates = normalizeCandidates(
      rawCandidates,
      fallbackCandidates,
      options?.brief ?? null,
    );

    if (normalizedCandidates.length === 0) {
      throw new Error(
        options?.brief
          ? "No usable script production candidates matched the brief."
          : "No usable script production candidates returned by LLM.",
      );
    }

    return {
      mode: "llm",
      candidates: completeCandidateSet(normalizedCandidates, fallbackCandidates),
      riskNotes: stringArray(payload.riskNotes),
      confirmQuestions: stringArray(payload.confirmQuestions),
      productionGoal: stringValue(payload.productionGoal),
      evidenceSummary: stringArray(payload.evidenceSummary),
    };
  } catch (error) {
    return {
      mode: "fallback_parse_error",
      candidates: fallbackCandidates,
      error: error instanceof Error ? error.message : "Unknown script production parse error.",
      rawContent: content,
    };
  }
}

function normalizeCandidates(
  rawCandidates: unknown[],
  fallbackCandidates: VideoScriptCandidate[],
  brief: ScriptProductionBrief | null,
): VideoScriptCandidate[] {
  const fallbackByType = new Map(
    fallbackCandidates.map((candidate) => [candidate.candidateType, candidate]),
  );
  const normalized: VideoScriptCandidate[] = [];

  for (const rawCandidate of rawCandidates) {
    const record = toRecord(rawCandidate);
    const candidateType = toCandidateType(record.candidateType);

    if (!candidateType || normalized.some((candidate) => candidate.candidateType === candidateType)) {
      continue;
    }

    const fallback = fallbackByType.get(candidateType) ?? fallbackCandidates[0];
    const title = stringValue(record.title);
    const hook = stringValue(record.hook);
    const whyThisWorks = stringValue(record.whyThisWorks);
    const ctaText = stringValue(record.ctaText);
    const scriptText = stringValue(record.scriptText);

    if (!fallback || !title || !hook || !whyThisWorks || !ctaText || !scriptText) {
      continue;
    }

    if (brief && !candidateMatchesBrief({ title, hook, whyThisWorks, ctaText, scriptText }, brief)) {
      continue;
    }

    normalized.push({
      candidateType,
      title,
      hook,
      whyThisWorks,
      ctaText,
      scriptText,
      strategyTrace: fallback.strategyTrace,
    });
  }

  return normalized;
}

function candidateMatchesBrief(
  candidate: Pick<VideoScriptCandidate, "title" | "hook" | "whyThisWorks" | "ctaText" | "scriptText">,
  brief: ScriptProductionBrief,
) {
  const text = [
    candidate.title,
    candidate.hook,
    candidate.whyThisWorks,
    candidate.ctaText,
    candidate.scriptText,
  ].join("\n");
  const anchors = extractBriefAnchors(brief);

  if (anchors.length === 0) {
    return true;
  }

  return anchors.some((anchor) => text.includes(anchor));
}

function extractBriefAnchors(brief: ScriptProductionBrief) {
  const rawAnchors = [
    ...brief.productOrServiceInfo,
    ...brief.customerAdvantages,
    ...brief.availableScenes,
    ...brief.availableMaterials.flatMap((material) => [
      material.title,
      material.description ?? "",
      material.materialType ?? "",
    ]),
  ];
  const generic = new Set([
    "专业",
    "温柔",
    "可信",
    "可信赖",
    "本地",
    "门店",
    "方案",
    "体验",
    "服务",
    "视频",
    "真实",
  ]);
  const anchors = new Set<string>();

  for (const rawAnchor of rawAnchors) {
    for (const term of splitAnchorTerms(rawAnchor)) {
      if (term.length >= 2 && !generic.has(term)) {
        anchors.add(term);
      }
    }
  }

  return [...anchors].sort((a, b) => b.length - a.length).slice(0, 30);
}

function splitAnchorTerms(value: string) {
  return value
    .split(/[，,、。；;：:\s/|()（）【】「」]+/u)
    .flatMap((part) => {
      const trimmed = part.trim();

      if (!trimmed) {
        return [];
      }

      const terms = [trimmed];
      for (const match of trimmed.match(/\p{Script=Han}{2,8}/gu) ?? []) {
        terms.push(match);
      }

      return terms;
    });
}

function completeCandidateSet(
  candidates: VideoScriptCandidate[],
  fallbackCandidates: VideoScriptCandidate[],
) {
  return SCRIPT_PRODUCTION_AGENT_CANDIDATE_TYPES.map((candidateType) => {
    const candidate = candidates.find((item) => item.candidateType === candidateType);
    const fallback = fallbackCandidates.find((item) => item.candidateType === candidateType);

    return candidate ?? fallback;
  }).filter((candidate): candidate is VideoScriptCandidate => Boolean(candidate));
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);

  return toRecord(parsed);
}

function toCandidateType(value: unknown): VideoScriptCandidateType | null {
  return SCRIPT_PRODUCTION_AGENT_CANDIDATE_TYPES.includes(
    value as VideoScriptCandidateType,
  )
    ? (value as VideoScriptCandidateType)
    : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUsableMaterial(material: ScriptProductionBrief["availableMaterials"][number]) {
  return hasText(material.title) || hasText(material.description);
}

function questionForMissingField(field: string) {
  switch (field) {
    case "platform":
      return "这条内容要发布到哪个平台？";
    case "content_form":
      return "这次要生成的是视频脚本还是图文草稿？";
    case "topic_direction":
      return "这条视频的主题方向是什么？";
    case "target_audiences":
      return "这条视频主要面向哪类用户？";
    case "account_positioning":
      return "账号在用户心中的定位是什么？";
    case "product_or_service_info":
      return "这条视频要承接哪个产品或服务？";
    case "available_material_or_scene":
      return "这条视频有哪些可用素材、可拍摄场景或现场画面？";
    default:
      return `请补充 ${field}。`;
  }
}
