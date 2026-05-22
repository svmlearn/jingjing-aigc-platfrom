import { z } from "zod";

import type {
  AiRuntimeTool,
  AiRuntimeToolCall,
} from "@/server/api/ai-runtime";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentToolCall,
  ConsultationAgentToolKey,
} from "@/server/api/consultation-runtime/types";
import { buildSkillReferenceQueryText } from "@/server/api/consultation-runtime/skills";
import {
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";

type ConsultationRuntimeToolDefinition = {
  key: ConsultationAgentToolKey;
  label: string;
  purpose: string;
  writes: string;
  parameters: Record<string, unknown>;
  validate: (
    args: unknown,
    state: ConsultationAgentLoopState,
  ) =>
    | { ok: true; args: Record<string, unknown> }
    | { ok: false; error: string };
};

type NativeToolCallParseResult =
  | {
      ok: true;
      call: ConsultationAgentToolCall;
    }
  | {
      ok: false;
      toolCallId: string;
      rawToolName: string;
      error: string;
    };

const merchantRoundParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchantId: {
      type: "string",
      description: "当前用户资料 ID。可省略，runtime 会以受控上下文补齐。",
    },
    round: {
      type: "number",
      description: "当前咨询轮次。可省略，runtime 会补齐。",
    },
    stage: {
      type: "string",
      description: "当前咨询阶段。可省略，runtime 会补齐。",
    },
  },
};

const merchantRoundArgsSchema = z
  .object({
    merchantId: z.string().optional(),
    round: z.number().optional(),
    stage: z.string().optional(),
  })
  .strict();

const contentCalendarItemParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description: "可选稳定 ID；省略时 runtime 会按顺序补齐。",
    },
    dayLabel: {
      type: "string",
      description: "日历标签，例如 本周一、本周、明天。",
    },
    contentType: {
      type: "string",
      enum: ["article", "video"],
      description: "内容类型：图文或视频。",
    },
    strategyTag: {
      type: "string",
      description: "本条任务对应的策略主题或内容角度。",
    },
    title: {
      type: "string",
      description: "可执行的选题标题。",
    },
    summary: {
      type: "string",
      description: "给成员或生成工作台使用的任务说明。",
    },
  },
  required: ["dayLabel", "contentType", "title", "summary"],
};

const updateContentCalendarParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...merchantRoundParameters.properties,
    calendar: {
      type: "array",
      minItems: 1,
      maxItems: 14,
      items: contentCalendarItemParameters,
      description: "模型判断需要写入营销日历时传入的图文/视频混合任务列表。",
    },
  },
};

const retrieveKnowledgeArgsSchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    knowledgeDocumentIds: z.array(z.string()).optional(),
    topK: z.number().int().min(0).max(12).optional(),
    contextPolicy: z.enum(["controlled_context_chunks_only"]).optional(),
  })
  .strict();

const contentCalendarItemArgsSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    dayLabel: z.string().trim().min(1).max(24),
    contentType: z.enum(["article", "video"]),
    strategyTag: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(360),
  })
  .strict();

const updateContentCalendarArgsSchema = z
  .object({
    merchantId: z.string().optional(),
    round: z.number().optional(),
    stage: z.string().optional(),
    calendar: z.array(contentCalendarItemArgsSchema).min(1).max(14).optional(),
  })
  .strict();

const readHistoryArgsSchema = z
  .object({
    sessionId: z.string().optional(),
    previousMessageCount: z.number().int().min(0).optional(),
    previousSummary: z.string().nullable().optional(),
  })
  .strict();

const benchmarkArgsSchema = z
  .object({
    platform: z.enum(["xiaohongshu", "douyin"]).optional(),
    findMethod: z.enum(["keyword", "profile", "detail"]).optional(),
    keyword: z.string().optional(),
    profileUrl: z.string().optional(),
    detailUrl: z.string().optional(),
    count: z.number().int().min(1).max(10).optional(),
    cachePolicy: z.enum(["provider_cache_first"]).optional(),
  })
  .strict();

export function getConsultationRuntimeToolRegistry(): ConsultationRuntimeToolDefinition[] {
  return [
    {
      key: "read_merchant_profile",
      label: "读取用户信息",
      purpose: "读取用户基础信息、能力项、背景摘要、表达风格和希望引导的下一步。",
      writes: "只读上下文",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          merchantId: {
            type: "string",
            description: "当前用户资料 ID。可省略，runtime 会从受控上下文读取。",
          },
        },
      },
      validate: (args, state) => {
        const parsed = z.object({ merchantId: z.string().optional() }).strict().safeParse(args);

        return parsed.success
          ? {
              ok: true,
              args: {
                ...buildConsultationToolArgs("read_merchant_profile", state),
                ...parsed.data,
              },
            }
          : { ok: false, error: formatSchemaError(parsed.error) };
      },
    },
    {
      key: "retrieve_knowledge_base",
      label: "检索平台方法论与用户知识库",
      purpose: "检索平台方法论、用户资料和可用于咨询的知识片段。",
      writes: "knowledgeMatches / 受控上下文",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "用于检索的明确问题或关键词。省略时 runtime 会基于当前咨询上下文补齐。",
          },
          knowledgeDocumentIds: {
            type: "array",
            items: { type: "string" },
            description: "可选平台知识文档 ID；只能来自当前专家绑定范围。",
          },
          topK: {
            type: "number",
            description: "检索条数上限。",
          },
          contextPolicy: {
            type: "string",
            enum: ["controlled_context_chunks_only"],
            description: "固定为 controlled_context_chunks_only。",
          },
        },
      },
      validate: (args, state) => {
        const parsed = retrieveKnowledgeArgsSchema.safeParse(args);

        if (!parsed.success) {
          return { ok: false, error: formatSchemaError(parsed.error) };
        }

        const fallback = buildConsultationToolArgs("retrieve_knowledge_base", state);
        const requestedDocumentIds = uniqueStrings(parsed.data.knowledgeDocumentIds ?? []);
        const allowedDocumentIds = state.consultationAgent.container?.knowledgeDocumentIds ?? [];

        return {
          ok: true,
          args: {
            ...fallback,
            query: parsed.data.query ?? fallback.query,
            topK:
              typeof parsed.data.topK === "number"
                ? Math.max(
                    0,
                    Math.min(
                      parsed.data.topK,
                      state.consultationAgent.retrievalTopK,
                      state.knowledgeRuntime.retrievalTopK,
                    ),
                  )
                : fallback.topK,
            knowledgeDocumentIds:
              requestedDocumentIds.length > 0
                ? requestedDocumentIds.filter((documentId) =>
                    allowedDocumentIds.includes(documentId),
                  )
                : fallback.knowledgeDocumentIds,
            contextPolicy: parsed.data.contextPolicy ?? fallback.contextPolicy,
          },
        };
      },
    },
    {
      key: "read_history",
      label: "读取历史内容",
      purpose: "读取当前咨询会话历史和摘要，避免丢上下文。",
      writes: "只读上下文",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sessionId: {
            type: "string",
            description: "当前咨询会话 ID。可省略。",
          },
          previousMessageCount: {
            type: "number",
            description: "可选历史消息数。",
          },
          previousSummary: {
            type: "string",
            description: "可选会话摘要。",
          },
        },
      },
      validate: (args, state) => {
        const parsed = readHistoryArgsSchema.safeParse(args);

        return parsed.success
          ? {
              ok: true,
              args: {
                ...buildConsultationToolArgs("read_history", state),
                ...parsed.data,
              },
            }
          : { ok: false, error: formatSchemaError(parsed.error) };
      },
    },
    {
      key: "search_benchmark_materials",
      label: "检索社媒爆款内容",
      purpose: "按关键词、博主主页或单条链接检索小红书/抖音爆款内容，并写入社媒爆款内容库，供咨询和选题分析。",
      writes: "source_items / imported_comments / 社媒爆款内容库",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          platform: {
            type: "string",
            enum: ["xiaohongshu", "douyin"],
            description: "目标平台。",
          },
          findMethod: {
            type: "string",
            enum: ["keyword", "profile", "detail"],
            description: "按关键词、博主主页或单条链接检索。",
          },
          keyword: {
            type: "string",
            description: "关键词检索时使用。",
          },
          profileUrl: {
            type: "string",
            description: "主页链接检索时使用。",
          },
          detailUrl: {
            type: "string",
            description: "单条内容链接解析时使用。",
          },
          count: {
            type: "number",
            description: "希望返回的素材数量，1 到 10。",
          },
          cachePolicy: {
            type: "string",
            enum: ["provider_cache_first"],
            description: "固定为 provider_cache_first。",
          },
        },
      },
      validate: (args, state) => {
        const parsed = benchmarkArgsSchema.safeParse(args);

        if (!parsed.success) {
          return { ok: false, error: formatSchemaError(parsed.error) };
        }

        return {
          ok: true,
          args: {
            ...buildConsultationToolArgs("search_benchmark_materials", state),
            ...parsed.data,
          },
        };
      },
    },
    {
      key: "update_strategy_snapshot",
      label: "编辑策略资产",
      purpose: "把产品定位、核心卖点、目标客群、关键场景和当前建议作为一个整体资产编辑。",
      writes: "右侧策略资产整体文档",
      parameters: merchantRoundParameters,
      validate: validateMerchantRoundArgs("update_strategy_snapshot"),
    },
    {
      key: "update_content_calendar",
      label: "更新内容日历",
      purpose: "在本轮已经取得足够知识库、话术或素材能力依据后，把咨询结论、用户知识库和策略快照转成图文/视频混合营销日历。",
      writes: "strategySnapshot.contentCalendarDraft",
      parameters: updateContentCalendarParameters,
      validate: validateUpdateContentCalendarArgs,
    },
    {
      key: "generate_article_brief",
      label: "生成图文任务草案",
      purpose: "仅在用户明确要求图文工作台 brief 时，把咨询结论转成图文工作台可使用的 brief；团队内容日历直接生成链路不要用它作为前置。",
      writes: "strategySnapshot.articleBrief",
      parameters: merchantRoundParameters,
      validate: validateMerchantRoundArgs("generate_article_brief"),
    },
    {
      key: "generate_video_brief",
      label: "生成视频任务草案",
      purpose: "仅在用户明确要求视频工作台 brief 时，把咨询结论转成视频工作台可使用的 brief；团队内容日历直接生成链路不要用它作为前置。",
      writes: "strategySnapshot.videoBrief",
      parameters: merchantRoundParameters,
      validate: validateMerchantRoundArgs("generate_video_brief"),
    },
  ];
}

export function getConsultationBusinessToolCatalog() {
  return getConsultationRuntimeToolRegistry().map((tool) => ({
    key: tool.key,
    label: tool.label,
    purpose: tool.purpose,
    writes: tool.writes,
  }));
}

const llmHiddenConsultationToolNames = new Set<ConsultationAgentToolKey>([
  "generate_article_brief",
  "generate_video_brief",
]);

export function isLlmVisibleConsultationTool(toolName: ConsultationAgentToolKey) {
  return !llmHiddenConsultationToolNames.has(toolName);
}

export function buildConsultationAiRuntimeTools(input: {
  state: ConsultationAgentLoopState;
  unavailableToolNames?: ConsultationAgentToolKey[];
}): AiRuntimeTool[] {
  const enabled = new Set(input.state.consultationAgent.enabledTools);
  const unavailable = new Set(input.unavailableToolNames ?? []);

  return getConsultationRuntimeToolRegistry()
    .filter((tool) =>
      enabled.has(tool.key) &&
      isLlmVisibleConsultationTool(tool.key) &&
      !unavailable.has(tool.key),
    )
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.key,
        description: buildRuntimeToolDescription(tool, input.state),
        parameters: tool.parameters,
      },
    }));
}

function buildRuntimeToolDescription(
  tool: ConsultationRuntimeToolDefinition,
  state: ConsultationAgentLoopState,
) {
  const base = `${tool.label}：${tool.purpose} 影响范围：${tool.writes}`;

  if (tool.key === "update_strategy_snapshot") {
    return [
      base,
      "arguments 只包含 merchantId、round、stage；策略资产正文由内部 Editor 根据上下文改写。",
    ].join(" ");
  }

  if (tool.key !== "update_content_calendar") {
    return base;
  }

  const generation = state.strategySnapshot.contentCalendarGeneration;

  if (!generation) {
    return [
      base,
      "arguments 只包含 calendar、merchantId、round、stage。",
      "当前日历尚未生成团队内容；如用户要求生成、补充或修改营销日历，仍由你根据依据和用户意图判断是否调用。",
    ].join(" ");
  }

  return [
    base,
    "arguments 只包含 calendar、merchantId、round、stage。",
    `当前日历生成状态：${generation.status}`,
    `当前日历版本：${generation.currentRevisionId}`,
    generation.generatedFromRevisionId
      ? `最近一次团队内容生成基于版本：${generation.generatedFromRevisionId}`
      : null,
    generation.generatedBatchId ? `最近生成批次：${generation.generatedBatchId}` : null,
    generation.generatedAt ? `最近生成时间：${generation.generatedAt}` : null,
    generation.generatedJobCount != null ? `生成任务数：${generation.generatedJobCount}` : null,
    "如果用户要求修改已经生成过团队内容的日历，你应自行判断是否先说明影响并询问确认；代码不会硬拦截，也不会替你自动确认。",
  ]
    .filter(Boolean)
    .join(" ");
}

export function isRepeatableConsultationReadTool(toolName: ConsultationAgentToolKey) {
  return (
    toolName === "read_merchant_profile" ||
    toolName === "retrieve_knowledge_base" ||
    toolName === "read_history"
  );
}

export function parseNativeConsultationToolCall(
  toolCall: AiRuntimeToolCall,
  state: ConsultationAgentLoopState,
): NativeToolCallParseResult {
  const rawToolName = toolCall.function.name;
  const tool = getConsultationRuntimeToolRegistry().find(
    (item) => item.key === rawToolName,
  );

  if (!tool || !isConsultationAgentToolKey(rawToolName)) {
    return {
      ok: false,
      toolCallId: toolCall.id,
      rawToolName,
      error: "模型请求了未注册的咨询业务工具。",
    };
  }

  if (!isLlmVisibleConsultationTool(tool.key)) {
    return {
      ok: false,
      toolCallId: toolCall.id,
      rawToolName,
      error: "该工具不对当前 LLM 工具调用路径开放。",
    };
  }

  if (!state.consultationAgent.enabledTools.includes(tool.key)) {
    return {
      ok: false,
      toolCallId: toolCall.id,
      rawToolName,
      error: "该工具未在当前 Agent tool policy 中启用。",
    };
  }

  const parsedArguments = parseToolArguments(toolCall.function.arguments);

  if (!parsedArguments.ok) {
    return {
      ok: false,
      toolCallId: toolCall.id,
      rawToolName,
      error: parsedArguments.error,
    };
  }

  const validated = tool.validate(parsedArguments.value, state);

  if (!validated.ok) {
    return {
      ok: false,
      toolCallId: toolCall.id,
      rawToolName,
      error: validated.error,
    };
  }

  return {
    ok: true,
    call: {
      id: toolCall.id,
      toolName: tool.key,
      args: validated.args,
    },
  };
}

export function isConsultationAgentToolKey(value: unknown): value is ConsultationAgentToolKey {
  return (
    typeof value === "string" &&
    getConsultationRuntimeToolRegistry().some((tool) => tool.key === value)
  );
}

export function buildConsultationToolArgs(
  toolName: ConsultationAgentToolKey,
  state: ConsultationAgentLoopState,
): Record<string, unknown> {
  if (toolName === "retrieve_knowledge_base") {
    return {
      query: buildKnowledgeQuery({
        merchant: state.merchant,
        userContent: state.userContent,
        previousSnapshot: state.session.strategySnapshot,
        skillReferenceQuery: buildSkillReferenceQueryText(state.consultationAgent.activeSkills),
      }),
      knowledgeDocumentIds: state.consultationAgent.container?.knowledgeDocumentIds ?? [],
      topK: Math.max(
        0,
        Math.min(state.consultationAgent.retrievalTopK, state.knowledgeRuntime.retrievalTopK),
      ),
      contextPolicy: "controlled_context_chunks_only",
    };
  }

  if (toolName === "read_history") {
    return {
      sessionId: state.session.id,
      previousMessageCount: state.session.messages.length,
      previousSummary: state.session.summaryText,
    };
  }

  if (toolName === "search_benchmark_materials") {
    const benchmarkUrl = extractBenchmarkUrl(state.userContent);
    const isProfileUrl = benchmarkUrl ? isBenchmarkProfileUrl(benchmarkUrl) : false;
    const platform = inferBenchmarkPlatform({
      userContent: state.userContent,
      benchmarkUrl,
    });
    const keyword = buildBenchmarkKeyword({
      userContent: state.userContent,
      merchant: state.merchant,
    });

    return {
      platform,
      findMethod: benchmarkUrl ? (isProfileUrl ? "profile" : "detail") : "keyword",
      keyword: benchmarkUrl ? "" : keyword,
      profileUrl: isProfileUrl ? benchmarkUrl : "",
      detailUrl: benchmarkUrl && !isProfileUrl ? benchmarkUrl : "",
      count: 5,
      cachePolicy: "provider_cache_first",
    };
  }

  return {
    merchantId: state.merchant.id,
    round: state.nextRound,
    stage: state.nextStage,
  };
}

export function buildBusinessToolPrompt(enabledTools: ConsultationAgentToolKey[]) {
  const enabled = new Set(enabledTools);
  const rows = getConsultationBusinessToolCatalog()
    .filter((tool) => enabled.has(tool.key) && isLlmVisibleConsultationTool(tool.key))
    .map((tool) => `- ${tool.label}。${tool.purpose} 写入/影响：${tool.writes}。`)
    .join("\n");

  return [
    "【咨询 Agent 受控业务工具】",
    "右侧策略资产不是普通文案，它由以下受控业务工具更新；回答时要尊重这些工具的输出，不要声称执行未启用工具。",
    rows,
  ].join("\n");
}

function validateMerchantRoundArgs(toolName: ConsultationAgentToolKey) {
  return (
    args: unknown,
    state: ConsultationAgentLoopState,
  ):
    | { ok: true; args: Record<string, unknown> }
    | { ok: false; error: string } => {
    const parsed = merchantRoundArgsSchema.safeParse(args);

    return parsed.success
      ? {
          ok: true,
          args: {
            ...buildConsultationToolArgs(toolName, state),
            ...parsed.data,
          },
        }
      : { ok: false, error: formatSchemaError(parsed.error) };
  };
}

function validateUpdateContentCalendarArgs(
  args: unknown,
  state: ConsultationAgentLoopState,
):
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string } {
  const parsed = updateContentCalendarArgsSchema.safeParse(args);

  return parsed.success
    ? {
        ok: true,
        args: {
          ...buildConsultationToolArgs("update_content_calendar", state),
          ...parsed.data,
        },
      }
    : { ok: false, error: formatSchemaError(parsed.error) };
}

function parseToolArguments(value: string):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  if (!value.trim()) {
    return { ok: true, value: {} };
  }

  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false, error: "工具 arguments 不是合法 JSON。" };
  }
}

function formatSchemaError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
    .join("；");
}

function extractBenchmarkUrl(content: string) {
  const match = content.match(/https?:\/\/[^\s，。)）]+/i);
  const url = match?.[0]?.trim();

  if (!url) {
    return null;
  }

  return /xiaohongshu|xhslink|douyin|iesdouyin/i.test(url) ? url : null;
}

function isBenchmarkProfileUrl(url: string) {
  return /\/user\/profile\/|\/user\//i.test(url) && !/\/(?:explore|discovery\/item|video)\//i.test(url);
}

function inferBenchmarkPlatform(input: {
  userContent: string;
  benchmarkUrl: string | null;
}) {
  const source = `${input.benchmarkUrl ?? ""} ${input.userContent}`.toLowerCase();

  return source.includes("douyin") || source.includes("抖音") || source.includes("iesdouyin")
    ? "douyin"
    : "xiaohongshu";
}

function buildBenchmarkKeyword(input: {
  userContent: string;
  merchant: ConsultationAgentLoopState["merchant"];
}) {
  const content = input.userContent
    .replace(/^@[^\s@，,：:]+[\s，,：:]*/, "")
    .replace(/https?:\/\/[^\s，。)）]+/gi, "")
    .replace(/[，。！？、,.!?;；:：()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const service = input.merchant.serviceItems[0] ?? "";
  const industry = input.merchant.industry ?? "";
  const candidate = content || [industry, service].filter(Boolean).join(" ");

  return candidate.slice(0, 80) || "用户提供的方向";
}

function buildKnowledgeQuery(input: {
  merchant: ConsultationAgentLoopState["merchant"];
  userContent: string;
  previousSnapshot: ConsultationAgentLoopState["strategySnapshot"];
  skillReferenceQuery?: string;
}) {
  return [
    input.userContent,
    input.merchant.industry ?? "",
    input.merchant.serviceItems.join(" "),
    input.previousSnapshot.positioning,
    input.previousSnapshot.strategyTags.join(" "),
    input.previousSnapshot.targetAudiences.join(" "),
    input.skillReferenceQuery ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
