import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentToolCall,
  ConsultationAgentToolKey,
  ConsultationAgentToolResult,
  ConsultationPlannerTraceItem,
} from "@/server/api/consultation-runtime/types";
import { clipText, toStringArrayValue } from "@/server/api/consultation-runtime/utils";
import {
  AiRuntimeError,
  createChatCompletion,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";

type ConsultationPlannerDecision = {
  call: ConsultationAgentToolCall | null;
  trace: ConsultationPlannerTraceItem;
};

const orderedTools: ConsultationAgentToolKey[] = [
  "read_merchant_profile",
  "retrieve_knowledge_base",
  "read_history",
  "search_benchmark_materials",
  "update_strategy_snapshot",
  "update_content_calendar",
  "generate_article_brief",
  "generate_video_brief",
];

const plannerDecisionSchema = z
  .object({
    action: z.enum(["call_tool", "stop"]),
    toolName: z.string().optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().trim().optional(),
  })
  .strict();

export function planConsultationToolCalls(
  state: ConsultationAgentLoopState,
): ConsultationAgentToolCall[] {
  return getOrderedEnabledToolNames(state)
    .map((toolName) => ({
      id: randomUUID(),
      toolName,
      args: buildToolArgs(toolName, state),
    }));
}

export async function planNextConsultationToolCall(input: {
  state: ConsultationAgentLoopState;
  completedToolNames: ConsultationAgentToolKey[];
  toolResults: ConsultationAgentToolResult[];
}): Promise<ConsultationPlannerDecision> {
  const turn = input.toolResults.length + 1;
  const readyToolNames = getReadyToolNames(input.state, input.completedToolNames);
  const fallbackToolName = readyToolNames[0] ?? null;

  if (!fallbackToolName) {
    return {
      call: null,
      trace: {
        turn,
        mode: "deterministic",
        status: "stopped",
        toolName: null,
        reason: "没有剩余可执行工具。",
      },
    };
  }

  if (!getAiRuntimeApiKey()) {
    return buildFallbackPlannerDecision({
      state: input.state,
      turn,
      toolName: fallbackToolName,
      reason: "AI runtime API key 未配置，使用确定性 planner。",
    });
  }

  try {
    const response = await createChatCompletion({
      runtime: input.state.llmRuntime,
      model: input.state.consultationAgent.model,
      responseFormat: "json_object",
      messages: buildPlannerMessages({
        state: input.state,
        readyToolNames,
        completedToolNames: input.completedToolNames,
        toolResults: input.toolResults,
      }),
    });
    const parsed = parsePlannerDecision(response.content);

    if (!parsed.ok) {
      return buildFallbackPlannerDecision({
        state: input.state,
        turn,
        toolName: fallbackToolName,
        reason: "模型 planner JSON 校验失败，使用确定性 fallback。",
        error: parsed.error,
      });
    }

    if (parsed.value.action === "stop") {
      return buildFallbackPlannerDecision({
        state: input.state,
        turn,
        toolName: fallbackToolName,
        reason: "模型 planner 在确定性工具完成前请求停止，使用确定性 fallback。",
        error: "model_stop_before_deterministic_completion",
      });
    }

    const requestedToolName = parseToolKey(parsed.value.toolName);

    if (!requestedToolName || !readyToolNames.includes(requestedToolName)) {
      return buildFallbackPlannerDecision({
        state: input.state,
        turn,
        toolName: fallbackToolName,
        reason: "模型 planner 选择了不可执行工具，使用确定性 fallback。",
        error: parsed.value.toolName ? `toolName=${parsed.value.toolName}` : "toolName missing",
      });
    }

    return {
      call: {
        id: randomUUID(),
        toolName: requestedToolName,
        args: mergePlannerToolArgs({
          state: input.state,
          toolName: requestedToolName,
          plannerArgs: parsed.value.args ?? {},
        }),
      },
      trace: {
        turn,
        mode: "model_tool_json",
        status: "planned",
        toolName: requestedToolName,
        reason: clipText(parsed.value.reason || "模型 planner 选择下一步工具。", 180),
      },
    };
  } catch (error) {
    return buildFallbackPlannerDecision({
      state: input.state,
      turn,
      toolName: fallbackToolName,
      reason: "模型 planner 调用失败，使用确定性 fallback。",
      error:
        error instanceof AiRuntimeError
          ? `${error.message}${error.status ? ` (${error.status})` : ""}`
          : error instanceof Error
            ? error.message
            : "Unknown planner error.",
    });
  }
}

function buildFallbackPlannerDecision(input: {
  state: ConsultationAgentLoopState;
  turn: number;
  toolName: ConsultationAgentToolKey;
  reason: string;
  error?: string | null;
}): ConsultationPlannerDecision {
  return {
    call: {
      id: randomUUID(),
      toolName: input.toolName,
      args: buildToolArgs(input.toolName, input.state),
    },
    trace: {
      turn: input.turn,
      mode: input.error ? "model_tool_json_fallback" : "deterministic",
      status: input.error ? "fallback" : "planned",
      toolName: input.toolName,
      reason: input.reason,
      error: input.error ?? null,
    },
  };
}

function getOrderedEnabledToolNames(state: ConsultationAgentLoopState) {
  const enabled = new Set<ConsultationAgentToolKey>(state.consultationAgent.enabledTools);

  return orderedTools.filter((toolName) => enabled.has(toolName));
}

function getReadyToolNames(
  state: ConsultationAgentLoopState,
  completedToolNames: ConsultationAgentToolKey[],
) {
  const completed = new Set(completedToolNames);
  const enabled = new Set(getOrderedEnabledToolNames(state));

  return getOrderedEnabledToolNames(state).filter((toolName) => {
    if (completed.has(toolName)) {
      return false;
    }

    return getToolDependencies(toolName)
      .filter((dependency) => enabled.has(dependency))
      .every((dependency) => completed.has(dependency));
  });
}

function getToolDependencies(toolName: ConsultationAgentToolKey): ConsultationAgentToolKey[] {
  if (toolName === "retrieve_knowledge_base" || toolName === "read_history") {
    return ["read_merchant_profile"];
  }

  if (toolName === "update_strategy_snapshot") {
    return ["read_merchant_profile", "retrieve_knowledge_base", "read_history"];
  }

  if (toolName === "search_benchmark_materials") {
    return ["read_merchant_profile"];
  }

  if (
    toolName === "update_content_calendar" ||
    toolName === "generate_article_brief" ||
    toolName === "generate_video_brief"
  ) {
    return ["update_strategy_snapshot"];
  }

  return [];
}

function buildPlannerMessages(input: {
  state: ConsultationAgentLoopState;
  readyToolNames: ConsultationAgentToolKey[];
  completedToolNames: ConsultationAgentToolKey[];
  toolResults: ConsultationAgentToolResult[];
}) {
  const toolCatalog = getConsultationBusinessToolCatalog()
    .filter((tool) => input.readyToolNames.includes(tool.key))
    .map((tool) => ({
      key: tool.key,
      label: tool.label,
      purpose: tool.purpose,
      writes: tool.writes,
    }));

  return [
    {
      role: "system" as const,
      content: [
        "你是咨询 Agent 的工具 planner，只负责选择下一步受控业务工具。",
        "只输出 JSON object，不要输出 Markdown。",
        "JSON schema: {\"action\":\"call_tool\"|\"stop\",\"toolName\":\"工具 key\",\"args\":{},\"reason\":\"一句中文理由\"}",
        "在 readyTools 非空时必须选择其中一个工具；不要发明工具名。",
        "策略资产、内容日历、图文 brief、视频 brief 只能通过受控工具推进。",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        userMessage: input.state.userContent,
        round: input.state.nextRound,
        stage: input.state.nextStage,
        merchant: {
          name: input.state.merchant.name,
          industry: input.state.merchant.industry,
          serviceItems: input.state.merchant.serviceItems,
        },
        currentStrategySnapshot: {
          positioning: input.state.strategySnapshot.positioning,
          targetAudiences: input.state.strategySnapshot.targetAudiences,
          coreSellingPoints: input.state.strategySnapshot.coreSellingPoints,
          keyScenes: input.state.strategySnapshot.keyScenes,
          currentSuggestion: input.state.strategySnapshot.currentSuggestion,
        },
        completedTools: input.completedToolNames,
        observations: input.toolResults.map((result) => ({
          toolName: result.toolName,
          status: result.status,
          summary: result.summary,
        })),
        readyTools: toolCatalog,
        allowedToolNames: input.readyToolNames,
      }),
    },
  ];
}

function parsePlannerDecision(value: string):
  | {
      ok: true;
      value: z.infer<typeof plannerDecisionSchema>;
    }
  | {
      ok: false;
      error: string;
    } {
  try {
    const parsed = JSON.parse(value) as unknown;
    const validated = plannerDecisionSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        ok: false,
        error: validated.error.issues
          .map((issue) => `${issue.path.join(".") || "planner"}: ${issue.message}`)
          .join("；"),
      };
    }

    return {
      ok: true,
      value: validated.data,
    };
  } catch {
    return {
      ok: false,
      error: "planner response is not valid JSON.",
    };
  }
}

function parseToolKey(value: unknown): ConsultationAgentToolKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const toolName = value.trim();

  return orderedTools.includes(toolName as ConsultationAgentToolKey)
    ? (toolName as ConsultationAgentToolKey)
    : null;
}

function mergePlannerToolArgs(input: {
  state: ConsultationAgentLoopState;
  toolName: ConsultationAgentToolKey;
  plannerArgs: Record<string, unknown>;
}) {
  const baseArgs = buildToolArgs(input.toolName, input.state);

  if (input.toolName !== "retrieve_knowledge_base") {
    return baseArgs;
  }

  const query =
    typeof input.plannerArgs.query === "string" && input.plannerArgs.query.trim()
      ? input.plannerArgs.query.trim()
      : baseArgs.query;
  const topK =
    typeof input.plannerArgs.topK === "number" && Number.isFinite(input.plannerArgs.topK)
      ? Math.max(0, Math.min(Math.trunc(input.plannerArgs.topK), input.state.knowledgeRuntime.retrievalTopK))
      : baseArgs.topK;
  const knowledgeDocumentIds = toStringArrayValue(input.plannerArgs.knowledgeDocumentIds);

  return {
    ...baseArgs,
    query,
    topK,
    knowledgeDocumentIds:
      knowledgeDocumentIds.length > 0
        ? knowledgeDocumentIds.filter((documentId) =>
            (input.state.consultationAgent.container?.knowledgeDocumentIds ?? []).includes(documentId),
          )
        : baseArgs.knowledgeDocumentIds,
  };
}

function buildToolArgs(
  toolName: ConsultationAgentToolKey,
  state: ConsultationAgentLoopState,
): Record<string, unknown> {
  if (toolName === "retrieve_knowledge_base") {
    return {
      query: buildKnowledgeQuery({
        merchant: state.merchant,
        userContent: state.userContent,
        previousSnapshot: state.session.strategySnapshot,
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
    const profileUrl = extractBenchmarkProfileUrl(state.userContent);
    const platform = inferBenchmarkPlatform({
      userContent: state.userContent,
      profileUrl,
    });
    const keyword = buildBenchmarkKeyword({
      userContent: state.userContent,
      merchant: state.merchant,
    });

    return {
      platform,
      findMethod: profileUrl ? "profile" : "keyword",
      keyword: profileUrl ? "" : keyword,
      profileUrl: profileUrl ?? "",
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

function extractBenchmarkProfileUrl(content: string) {
  const match = content.match(/https?:\/\/[^\s，。)）]+/i);
  const url = match?.[0]?.trim();

  if (!url) {
    return null;
  }

  return /xiaohongshu|xhslink|douyin|iesdouyin/i.test(url) ? url : null;
}

function inferBenchmarkPlatform(input: {
  userContent: string;
  profileUrl: string | null;
}) {
  const source = `${input.profileUrl ?? ""} ${input.userContent}`.toLowerCase();

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

  return candidate.slice(0, 80) || "本地生活";
}

export function repairConsultationToolCall(
  call: ConsultationAgentToolCall,
  state: ConsultationAgentLoopState,
): ConsultationAgentToolCall {
  if (call.toolName !== "retrieve_knowledge_base") {
    return call;
  }

  if (typeof call.args.query === "string" && call.args.query.trim().length > 0) {
    return call;
  }

  return {
    ...call,
    repaired: true,
    args: {
      ...call.args,
      query: [
        state.userContent,
        state.merchant.industry ?? "",
        state.merchant.serviceItems.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    },
  };
}

function buildKnowledgeQuery(input: {
  merchant: ConsultationAgentLoopState["merchant"];
  userContent: string;
  previousSnapshot: ConsultationAgentLoopState["strategySnapshot"];
}) {
  return [
    input.userContent,
    input.merchant.industry ?? "",
    input.merchant.serviceItems.join(" "),
    input.previousSnapshot.positioning,
    input.previousSnapshot.strategyTags.join(" "),
    input.previousSnapshot.targetAudiences.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}
