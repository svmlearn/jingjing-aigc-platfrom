import "server-only";

export const ARTICLE_PROMPT_VERSION = "article-workbench-v20260430";

export type ArticlePromptMode = "create" | "rewrite" | "revise";

export type ArticlePromptTraceMode =
  | "llm"
  | "fallback_no_key"
  | "fallback_error"
  | "fallback_parse_error";

export type ArticlePromptContext = {
  selectedCalendarItem: unknown;
  strategySnapshot: unknown;
  merchantProfile: unknown;
  materialContext: unknown;
  contentGoal: string | null;
  extraRequirement: string | null;
  toneStyle: string | null;
  platform: "xiaohongshu";
};

export type ArticleGeneratedVariant = {
  styleLabel: string;
  title: string;
  bodyText: string;
  hashtags: string[];
  ctaText: string;
  rationale: string;
};

export class ArticlePromptParseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const ARTICLE_SYSTEM_PROMPT = [
  "你是本地生活商家的小红书图文创作编辑。",
  "你只能使用输入中的咨询策略、商家资料、日历卡片、参考素材和用户补充要求。",
  "禁止编造价格、疗效、收益、资质、真实案例、库存、活动承诺、地址细节或其他未经确认事实。",
  "不要生成夸大承诺、医疗疗效、金融收益、绝对化用语。",
  "参考素材只能借鉴结构、开头钩子、内容节奏、情绪推进和 CTA 方式，不能照搬原句，也不能把参考素材中的商家事实写成本商家的事实。",
  "标题要像小红书笔记，不要像新闻标题或企业公告。",
  "正文要有清晰开头、场景展开、差异点解释和行动引导。",
  "只输出 JSON，不输出思考过程，不包裹 Markdown 代码块。",
].join("\n");

export function buildArticleGenerationMessages(input: {
  mode: ArticlePromptMode;
  context: ArticlePromptContext;
  currentVariant?: {
    title?: string | null;
    bodyText?: string | null;
    hashtags?: string[];
    ctaText?: string | null;
  };
  revisionInstruction?: string | null;
}): ChatMessage[] {
  const task =
    input.mode === "rewrite"
      ? buildRewriteTask()
      : input.mode === "revise"
        ? buildReviseTask(input.revisionInstruction)
        : buildCreateTask();

  return [
    {
      role: "system",
      content: ARTICLE_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        task,
        "",
        "输入上下文 JSON：",
        JSON.stringify(input.context, null, 2),
        input.currentVariant
          ? ["", "当前待修订版本 JSON：", JSON.stringify(input.currentVariant, null, 2)].join("\n")
          : "",
        "",
        "输出 JSON Schema：",
        JSON.stringify(
          {
            variants: [
              {
                styleLabel: "专业干货版",
                title: "小红书标题",
                bodyText: "正文内容",
                hashtags: ["#本地生活", "#小红书探店"],
                ctaText: "行动引导",
                rationale: "为什么这样写",
              },
            ],
            riskNotes: [],
          },
          null,
          2,
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

export function parseArticleGenerationResponse(input: {
  content: string;
  expectedVariantCount: "single" | "multiple";
}): {
  variants: ArticleGeneratedVariant[];
  riskNotes: string[];
} {
  const raw = extractJsonObject(input.content);
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ArticlePromptParseError(
      error instanceof Error ? error.message : "Article response JSON parse failed.",
    );
  }
  const root = toRecord(parsed);
  const variantsRaw = Array.isArray(root.variants) ? root.variants : [];
  const maxCount = input.expectedVariantCount === "single" ? 1 : 3;
  const variants = variantsRaw
    .map(normalizeArticleVariant)
    .filter((variant): variant is ArticleGeneratedVariant => Boolean(variant))
    .slice(0, maxCount);

  if (variants.length === 0) {
    throw new ArticlePromptParseError("No usable article variants returned.");
  }

  return {
    variants,
    riskNotes: toStringArray(root.riskNotes).slice(0, 8),
  };
}

function buildCreateTask() {
  return [
    "任务：从 0 到 1 生成小红书图文笔记。",
    "请围绕 selectedCalendarItem 和 contentGoal 生成 2 到 3 个版本。",
    "每个版本应有不同表达角度，但都必须服务同一个日历卡片。",
  ].join("\n");
}

function buildRewriteTask() {
  return [
    "任务：基于参考素材改写小红书图文笔记。",
    "请生成 2 到 3 个版本。",
    "参考素材只用于借鉴结构、钩子、节奏、情绪推进和 CTA 方式。",
    "不得照搬素材原句，不得复用素材里的价格、地址、案例、数据、资质或其他商家事实。",
    "如果素材和本商家资料冲突，以 merchantProfile 和 strategySnapshot 为准。",
  ].join("\n");
}

function buildReviseTask(revisionInstruction?: string | null) {
  return [
    "任务：基于当前版本和自然语言修改意见，生成 1 个新版本。",
    `修改意见：${revisionInstruction?.trim() || "按当前上下文做小幅优化"}`,
    "默认只按修改意见调整，不新增未经确认事实。",
    "如果用户要求换方向，可以重构标题和正文结构，但仍必须围绕原上下文。",
    "如果用户要求违反风险约束，请拒绝该部分，并给出安全替代表达。",
  ].join("\n");
}

function extractJsonObject(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
    return withoutFence;
  }

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new ArticlePromptParseError("Response does not contain a JSON object.");
  }

  return withoutFence.slice(start, end + 1);
}

function normalizeArticleVariant(value: unknown): ArticleGeneratedVariant | null {
  const record = toRecord(value);
  const title = firstString(record.title);
  const bodyText = firstString(record.bodyText, record.body, record.content);

  if (!title || !bodyText) {
    return null;
  }

  return {
    styleLabel: firstString(record.styleLabel, record.label) ?? "图文版本",
    title: title.slice(0, 120),
    bodyText,
    hashtags: normalizeHashtags(record.hashtags),
    ctaText: firstString(record.ctaText, record.cta) ?? "私信我了解更多到店建议",
    rationale: firstString(record.rationale, record.reason) ?? "",
  };
}

function normalizeHashtags(value: unknown) {
  return toStringArray(value)
    .map((item) => {
      const trimmed = item.trim();
      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    })
    .filter((item) => item.length > 1)
    .slice(0, 8);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
