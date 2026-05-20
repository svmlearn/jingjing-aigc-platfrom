import {
  AiRuntimeError,
  createChatCompletion,
  getAiRuntimeApiKey,
  type ChatMessage,
} from "@/server/api/ai-runtime";
import {
  buildAgentLoopStartedPayload,
  buildKnowledgeRetrievedPayload,
  buildLoopCompletedPayload,
  buildToolCompletedPayload,
  type ConsultationRuntimeEventEmitter,
} from "@/server/api/consultation-runtime/events";
import {
  planNextConsultationToolCall,
  repairConsultationToolCall,
} from "@/server/api/consultation-runtime/planner";
import { buildSkillDependencyWarnings } from "@/server/api/consultation-runtime/skills";
import {
  buildContextBoundarySnapshot,
  buildLatestExpertTurnNote,
} from "@/server/api/consultation-runtime/context";
import {
  buildConsultationAiRuntimeTools,
  isConsultationAgentToolKey,
  isRepeatableConsultationReadTool,
  parseNativeConsultationToolCall,
} from "@/server/api/consultation-runtime/tools";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentToolCall,
  ConsultationAgentToolKey,
  ConsultationAgentToolResult,
  ConsultationPlannerMode,
  ConsultationPlannerTraceItem,
  ExpertTurnNote,
} from "@/server/api/consultation-runtime/types";
import {
  clipText,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";

export type ConsultationRuntimeAssistantReply = {
  content: string;
  mode: "llm" | "fallback_no_key" | "fallback_error";
  model?: string;
  error?: string;
};

export type ConsultationRuntimeSnapshotRecord = {
  agentId: string | null;
  promptVersionId: string | null;
  soulVersionId: string | null;
  candidateSkillIds: string[];
  actualSkillIds: string[];
  knowledgeSetIds: string[];
  knowledgeMatchIds: string[];
  memoryMatchIds: string[];
  toolCallSummary: Record<string, unknown>;
  model: string | null;
};

type ConsultationRuntimeDesign =
  | "bounded_business_tool_loop_v1"
  | "native_tool_calling_loop_v1";

type ConsultationRuntimeTerminalReason =
  | "assistant_final"
  | "max_tool_turns"
  | "fallback_deterministic"
  | "fallback_error";

type RunConsultationRuntimeInput = {
  state: ConsultationAgentLoopState;
  maxConversationRounds: number;
  toolBudget: number;
  emitEvent: ConsultationRuntimeEventEmitter;
  dispatchTool: (
    state: ConsultationAgentLoopState,
    toolCall: ConsultationAgentToolCall,
  ) => Promise<ConsultationAgentToolResult>;
  applyToolResultToState: (
    state: ConsultationAgentLoopState,
    result: ConsultationAgentToolResult,
  ) => void;
  buildAssistantReply: (input: {
    state: ConsultationAgentLoopState;
    toolResults: ConsultationAgentToolResult[];
  }) => Promise<ConsultationRuntimeAssistantReply>;
  buildNativeToolCallingMessages?: (input: {
    state: ConsultationAgentLoopState;
    toolResults: ConsultationAgentToolResult[];
  }) => ChatMessage[];
};

type NativeToolCallingResult = {
  assistantReply: ConsultationRuntimeAssistantReply | null;
  fallbackReason: string | null;
  terminalReason: ConsultationRuntimeTerminalReason;
};

const nativeMaxToolTurns = 8;
const nativeMaxToolCallsPerTurn = 2;

export async function runConsultationRuntime(input: RunConsultationRuntimeInput) {
  const toolResults: ConsultationAgentToolResult[] = [];
  const requestedPlannerMode = input.state.consultationAgent.plannerMode;
  const runtimeDesign = resolveRuntimeDesign(requestedPlannerMode);
  let effectiveRuntimeDesign = runtimeDesign;
  let terminalReason: ConsultationRuntimeTerminalReason = "assistant_final";
  let fallbackReason: string | null = null;
  let assistantReply: ConsultationRuntimeAssistantReply | null = null;

  await input.emitEvent({
    eventType: "agent.loop.started",
    payload: buildAgentLoopStartedPayload({
      state: input.state,
      maxConversationRounds: input.maxConversationRounds,
      toolBudget: input.toolBudget,
    }),
  });

  if (requestedPlannerMode === "native_tool_calling") {
    const nativeResult = await runNativeToolCallingLoop({
      input,
      toolResults,
    });

    assistantReply = nativeResult.assistantReply;
    fallbackReason = nativeResult.fallbackReason;
    terminalReason = nativeResult.terminalReason;

    if (!assistantReply) {
      input.state.plannerTrace.push({
        turn: toolResults.length + 1,
        mode: "native_tool_calling_fallback",
        status: "fallback",
        toolName: null,
        reason: "原生 tool calling 未产出最终回复，切回确定性 planner。",
        error: fallbackReason,
      });
      terminalReason = "fallback_deterministic";
      effectiveRuntimeDesign = "native_tool_calling_loop_v1";
    }
  }

  if (!assistantReply) {
    await runBoundedBusinessToolLoop({
      input,
      toolResults,
      plannerMode:
        requestedPlannerMode === "deterministic" || fallbackReason
          ? "deterministic"
          : "model_json_planner",
    });

    assistantReply = await input.buildAssistantReply({
      state: input.state,
      toolResults,
    });
  }

  const contextBoundary = buildContextBoundarySnapshot({
    state: input.state,
    toolResults,
  });
  input.state.contextBoundary = contextBoundary;
  input.state.contextBudget = contextBoundary.budget;

  await input.emitEvent({
    eventType:
      assistantReply.mode === "llm"
        ? "llm.response.completed"
        : "llm.response.fallback",
    payload: {
      mode: assistantReply.mode,
      model: assistantReply.model ?? null,
      error: assistantReply.error ?? null,
      mentionRouting: input.state.mentionRouting,
      runtimeDesign: effectiveRuntimeDesign,
      plannerMode: requestedPlannerMode,
      fallbackReason,
    },
  });

  const latestExpertTurnNote = buildLatestExpertTurnNote({
    sessionId: input.state.session.id,
    round: input.state.nextRound,
    consultationAgent: input.state.consultationAgent,
    userContent: input.state.userContent,
    strategySnapshot: input.state.strategySnapshot,
    toolResults,
    assistantContent: assistantReply.content,
  });
  input.state.latestExpertTurnNote = latestExpertTurnNote;

  await input.emitEvent({
    eventType: "agent.loop.completed",
    payload: buildLoopCompletedPayload({
      state: input.state,
      toolResults,
      runtimeDesign: effectiveRuntimeDesign,
      plannerMode: requestedPlannerMode,
      terminalReason,
      fallbackReason,
    }),
  });

  return {
    toolResults,
    assistantReply,
    latestExpertTurnNote,
    runtimeDesign: effectiveRuntimeDesign,
    plannerMode: requestedPlannerMode,
    terminalReason,
    fallbackReason,
    runtimeSnapshot: buildConsultationRuntimeSnapshotRecord({
      state: input.state,
      toolResults,
      assistantReply,
      latestExpertTurnNote,
      runtimeDesign: effectiveRuntimeDesign,
      plannerMode: requestedPlannerMode,
      terminalReason,
      fallbackReason,
    }),
  };
}

async function runBoundedBusinessToolLoop(input: {
  input: RunConsultationRuntimeInput;
  toolResults: ConsultationAgentToolResult[];
  plannerMode: Exclude<ConsultationPlannerMode, "native_tool_calling">;
}) {
  while (input.toolResults.length < input.input.toolBudget) {
    const plannerDecision = await planNextConsultationToolCall({
      state: input.input.state,
      completedToolNames: getPlannerCompletedToolNames(input.toolResults),
      toolResults: input.toolResults,
      plannerMode: input.plannerMode,
    });

    input.input.state.plannerTrace.push(plannerDecision.trace);

    if (!plannerDecision.call) {
      break;
    }

    const toolCall = repairConsultationToolCall(plannerDecision.call, input.input.state);
    const result = await dispatchToolWithRuntimeSafety({
      input: input.input,
      toolCall,
    });

    input.input.applyToolResultToState(input.input.state, result);
    input.toolResults.push(result);

    await emitCompletedToolEvents({
      input: input.input,
      toolCall,
      result,
      planner: plannerDecision.trace,
    });

    if (shouldStopAfterToolResult(result)) {
      break;
    }
  }
}

async function runNativeToolCallingLoop(input: {
  input: RunConsultationRuntimeInput;
  toolResults: ConsultationAgentToolResult[];
}): Promise<NativeToolCallingResult> {
  if (!input.input.buildNativeToolCallingMessages) {
    return buildNativeFallbackResult("native_tool_message_builder_missing");
  }

  if (!getAiRuntimeApiKey()) {
    return buildNativeFallbackResult("AI runtime API key 未配置。");
  }

  const messages = input.input.buildNativeToolCallingMessages({
    state: input.input.state,
    toolResults: input.toolResults,
  });
  let consecutiveSkippedToolTurns = 0;

  for (let turn = 1; turn <= nativeMaxToolTurns; turn += 1) {
    const tools = buildConsultationAiRuntimeTools({
      state: input.input.state,
      unavailableToolNames: getNativeUnavailableToolNames(input.toolResults),
    });

    if (tools.length === 0) {
      break;
    }

    let response: Awaited<ReturnType<typeof createChatCompletion>>;

    try {
      response = await createChatCompletion({
        runtime: input.input.state.llmRuntime,
        model: input.input.state.consultationAgent.model,
        messages,
        tools,
      });
    } catch (error) {
      return buildNativeFallbackResult(formatAiRuntimeError(error));
    }

    if (response.toolCalls.length === 0) {
      const content = response.content.trim();

      if (!content) {
        return buildNativeFallbackResult("原生 tool calling 返回了空正文且无 tool_calls。");
      }

      return {
        assistantReply: {
          content,
          mode: "llm",
          model: response.model,
        },
        fallbackReason: null,
        terminalReason: "assistant_final",
      };
    }

    const selectedToolCalls = response.toolCalls.slice(0, nativeMaxToolCallsPerTurn);
    messages.push({
      role: "assistant",
      content: response.content || null,
      toolCalls: selectedToolCalls,
    });

    const turnResultStartIndex = input.toolResults.length;

    for (const rawToolCall of selectedToolCalls) {
      await input.input.emitEvent({
        eventType: "agent.tool.requested",
        payload: {
          source: "model_tool_calls",
          runtimeDesign: "native_tool_calling_loop_v1",
          toolCallId: rawToolCall.id,
          toolName: rawToolCall.function.name,
          rawArgumentsPreview: clipText(rawToolCall.function.arguments, 600),
        },
      });

      const parsed = parseNativeConsultationToolCall(rawToolCall, input.input.state);

      if (!parsed.ok) {
        const planner: ConsultationPlannerTraceItem = {
          turn,
          mode: "native_tool_calling",
          status: "rejected",
          toolName: isConsultationAgentToolKey(parsed.rawToolName) ? parsed.rawToolName : null,
          reason: parsed.error,
          error: parsed.rawToolName,
        };
        input.input.state.plannerTrace.push(planner);
        const failedResult = buildNativeRejectedToolResult(parsed);
        input.toolResults.push(failedResult);

        await emitRejectedNativeToolEvent({
          input: input.input,
          result: failedResult,
          planner,
        });

        messages.push({
          role: "tool",
          toolCallId: parsed.toolCallId,
          content: buildNativeToolResultContent(failedResult),
        });
        continue;
      }

      const planner: ConsultationPlannerTraceItem = {
        turn,
        mode: "native_tool_calling",
        status: "planned",
        toolName: parsed.call.toolName,
        reason: "主模型通过原生 tool_calls 请求执行受控业务工具。",
      };
      input.input.state.plannerTrace.push(planner);

      const result = await dispatchToolWithRuntimeSafety({
        input: input.input,
        toolCall: parsed.call,
      });
      input.input.applyToolResultToState(input.input.state, result);
      input.toolResults.push(result);

      await emitCompletedToolEvents({
        input: input.input,
        toolCall: parsed.call,
        result,
        planner,
      });

      messages.push({
        role: "tool",
        toolCallId: parsed.call.id,
        content: buildNativeToolResultContent(result),
      });
    }

    const turnResults = input.toolResults.slice(turnResultStartIndex);

    if (turnResults.length > 0 && turnResults.every((result) => result.status !== "completed")) {
      consecutiveSkippedToolTurns += 1;
    } else {
      consecutiveSkippedToolTurns = 0;
    }

    if (consecutiveSkippedToolTurns >= 2) {
      break;
    }
  }

  try {
    const finalResponse = await createChatCompletion({
      runtime: input.input.state.llmRuntime,
      model: input.input.state.consultationAgent.model,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "请停止调用工具，基于已经返回的工具结果给用户一个中文自然语言回复。不要声称未完成的工具已经执行，不要输出内部工具名。",
        },
      ],
    });
    const content = finalResponse.content.trim();

    if (!content) {
      return buildNativeFallbackResult("原生 tool calling 强制最终回复为空。");
    }

    return {
      assistantReply: {
        content,
        mode: "llm",
        model: finalResponse.model,
      },
      fallbackReason: null,
      terminalReason:
        input.toolResults.length >= nativeMaxToolTurns ? "max_tool_turns" : "assistant_final",
    };
  } catch (error) {
    return buildNativeFallbackResult(formatAiRuntimeError(error));
  }
}

export function getPlannerCompletedToolNames(
  toolResults: ConsultationAgentToolResult[],
): ConsultationAgentToolCall["toolName"][] {
  return toolResults
    .filter(isKnownConsultationToolResult)
    .filter((result) => result.status !== "failed")
    .filter((result) => result.toolName !== "update_strategy_snapshot" || result.status === "completed")
    .map((result) => result.toolName);
}

function getNativeUnavailableToolNames(
  toolResults: ConsultationAgentToolResult[],
): ConsultationAgentToolKey[] {
  return Array.from(
    new Set<ConsultationAgentToolKey>(
      toolResults
        .filter(isKnownConsultationToolResult)
        .filter((result) => !isRepeatableConsultationReadTool(result.toolName))
        .map((result) => result.toolName),
    ),
  );
}

function shouldStopAfterToolResult(result: ConsultationAgentToolResult) {
  return (
    result.status === "failed" ||
    (result.toolName === "update_strategy_snapshot" && result.status !== "completed")
  );
}

async function emitCompletedToolEvents(input: {
  input: RunConsultationRuntimeInput;
  toolCall: ConsultationAgentToolCall;
  result: ConsultationAgentToolResult;
  planner: ConsultationPlannerTraceItem;
}) {
  await input.input.emitEvent({
    eventType: "agent.tool.completed",
    payload: buildToolCompletedPayload({
      toolCall: input.toolCall,
      result: input.result,
      planner: input.planner,
    }),
  });

  if (input.result.toolName === "retrieve_knowledge_base") {
    await input.input.emitEvent({
      eventType: "knowledge.retrieved",
      payload: buildKnowledgeRetrievedPayload(input.result),
    });
  }
}

async function dispatchToolWithRuntimeSafety(input: {
  input: RunConsultationRuntimeInput;
  toolCall: ConsultationAgentToolCall;
}): Promise<ConsultationAgentToolResult> {
  try {
    return await input.input.dispatchTool(input.input.state, input.toolCall);
  } catch (error) {
    return buildToolRuntimeErrorResult({
      toolCall: input.toolCall,
      error,
    });
  }
}

function buildToolRuntimeErrorResult(input: {
  toolCall: ConsultationAgentToolCall;
  error: unknown;
}): ConsultationAgentToolResult {
  const errorMessage = formatToolRuntimeError(input.error);
  const errorType = classifyToolRuntimeError(input.error);

  return {
    callId: input.toolCall.id,
    toolName: input.toolCall.toolName,
    status: "failed",
    summary: `工具执行失败：${clipText(errorMessage, 180)}`,
    payload: {
      errorType,
      error: errorMessage,
      retryable: errorType === "provider_error" || errorType === "runtime_error",
      toolArgsPreview: clipText(JSON.stringify(input.toolCall.args), 600),
    },
  };
}

function buildNativeRejectedToolResult(input: {
  toolCallId: string;
  rawToolName: string;
  error: string;
}): ConsultationAgentToolResult {
  return {
    callId: input.toolCallId,
    toolName: isConsultationAgentToolKey(input.rawToolName)
      ? input.rawToolName
      : "unknown_tool",
    rawToolName: input.rawToolName,
    status: "failed",
    summary: `工具调用未通过运行时校验：${input.error}`,
    payload: {
      errorType: "native_tool_call_rejected",
      error: input.error,
      rawToolName: input.rawToolName,
      retryInstruction:
        "请只从当前 tools 列表中选择工具，并按 JSON Schema 重新提供 arguments；如果不需要工具，请直接自然语言回复。",
    },
  };
}

async function emitRejectedNativeToolEvent(input: {
  input: RunConsultationRuntimeInput;
  result: ConsultationAgentToolResult;
  planner: ConsultationPlannerTraceItem;
}) {
  await input.input.emitEvent({
    eventType: "agent.tool.completed",
    payload: {
      callId: input.result.callId,
      toolName: input.result.rawToolName ?? input.result.toolName,
      repaired: false,
      planner: input.planner,
      status: input.result.status,
      summary: input.result.summary,
      payload: input.result.payload,
    },
  });
}

function isKnownConsultationToolResult(
  result: ConsultationAgentToolResult,
): result is ConsultationAgentToolResult & { toolName: ConsultationAgentToolKey } {
  return isConsultationAgentToolKey(result.toolName);
}

function classifyToolRuntimeError(
  error: unknown,
): "provider_error" | "validation_failed" | "runtime_error" {
  if (error instanceof AiRuntimeError) {
    return "provider_error";
  }

  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);

  return /validation|schema|zod|invalid/i.test(message)
    ? "validation_failed"
    : "runtime_error";
}

export function buildConsultationRuntimeSnapshotRecord(input: {
  state: ConsultationAgentLoopState;
  toolResults: ConsultationAgentToolResult[];
  assistantReply: ConsultationRuntimeAssistantReply;
  latestExpertTurnNote?: ExpertTurnNote | null;
  runtimeDesign?: ConsultationRuntimeDesign;
  plannerMode?: ConsultationPlannerMode;
  terminalReason?: ConsultationRuntimeTerminalReason;
  fallbackReason?: string | null;
}): ConsultationRuntimeSnapshotRecord {
  const { state, toolResults, assistantReply } = input;
  const agentContainer = state.consultationAgent.container;
  const memoryMatches = state.knowledgeMatches.filter(isMerchantMemoryMatch);
  const latestExpertTurnNote =
    input.latestExpertTurnNote ?? state.latestExpertTurnNote ?? null;
  const runtimeDesign = input.runtimeDesign ?? resolveRuntimeDesign(state.consultationAgent.plannerMode);

  return {
    agentId: agentContainer?.agent.id ?? null,
    promptVersionId: agentContainer?.activePromptVersion?.id ?? null,
    soulVersionId: agentContainer?.activeSoulVersion?.id ?? null,
    candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
    actualSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
    knowledgeSetIds: agentContainer?.knowledgeSetIds ?? [],
    knowledgeMatchIds: uniqueStrings(state.knowledgeMatches.map((match) => match.chunkId)),
    memoryMatchIds: uniqueStrings(memoryMatches.map((match) => match.chunkId)),
    model: assistantReply.model ?? state.consultationAgent.model ?? null,
    toolCallSummary: {
      runtimeDesign,
      plannerMode: input.plannerMode ?? state.consultationAgent.plannerMode,
      toolCallingProvider:
        runtimeDesign === "native_tool_calling_loop_v1"
          ? state.llmRuntime.providerLabel
          : null,
      terminalReason: input.terminalReason ?? "assistant_final",
      fallbackReason: input.fallbackReason ?? null,
      mentionRouting: state.mentionRouting,
      assistantMode: assistantReply.mode,
      assistantError: assistantReply.error ?? null,
      agentAssetVersions: {
        agentMdVersionId: agentContainer?.activePromptVersion?.id ?? null,
        agentMdVersionNo: agentContainer?.activePromptVersion?.versionNo ?? null,
        soulMdVersionId: agentContainer?.activeSoulVersion?.id ?? null,
        soulMdVersionNo: agentContainer?.activeSoulVersion?.versionNo ?? null,
        memoryMdPolicy: "placeholder_not_injected",
      },
      plannerTrace: state.plannerTrace,
      skillDisclosure: {
        candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
        activeSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
        activeSkillTriggers: state.consultationAgent.activeSkills.map((skill) => ({
          skillId: skill.id,
          score: skill.score ?? 0,
          triggerReasons: skill.triggerReasons ?? [],
        })),
      },
      skillDependencyWarnings: buildSkillDependencyWarnings(state.consultationAgent),
      expertTraffic: {
        policy: "short_term_expert_traffic_v1",
        sharedConsultationState: state.sharedConsultationState,
        expertTurnNotes: state.expertTurnNotes,
        latestExpertTurnNote,
      },
      sharedConsultationState: state.sharedConsultationState,
      expertTurnNotes: state.expertTurnNotes,
      latestExpertTurnNote,
      memoryMatches: memoryMatches.map((match) => ({
        chunkId: match.chunkId,
        documentId: match.documentId,
        documentTitle: match.documentTitle,
      })),
      contextBudget: state.contextBudget ?? null,
      contextBoundary: state.contextBoundary ?? null,
      toolResults: toolResults.map((result) => ({
        toolName: result.toolName,
        rawToolName: result.rawToolName ?? null,
        status: result.status,
        summary: result.summary,
        guardrail: result.payload.guardrail ?? null,
      })),
      completedTools: toolResults
        .filter((result) => result.status === "completed")
        .map((result) => result.toolName),
      skippedTools: toolResults
        .filter((result) => result.status === "skipped")
        .map((result) => result.toolName),
      failedTools: toolResults
        .filter((result) => result.status === "failed")
        .map((result) => result.rawToolName ?? result.toolName),
      strategyWriteCount: toolResults.filter(
        (result) => result.toolName === "update_strategy_snapshot" && result.status === "completed",
      ).length,
      knowledgeMatchIds: uniqueStrings(state.knowledgeMatches.map((match) => match.chunkId)),
      activeSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
    },
  };
}

function resolveRuntimeDesign(
  plannerMode: ConsultationPlannerMode,
): ConsultationRuntimeDesign {
  return plannerMode === "native_tool_calling"
    ? "native_tool_calling_loop_v1"
    : "bounded_business_tool_loop_v1";
}

function buildNativeFallbackResult(reason: string): NativeToolCallingResult {
  return {
    assistantReply: null,
    fallbackReason: reason,
    terminalReason: "fallback_deterministic",
  };
}

function buildNativeToolResultContent(result: ConsultationAgentToolResult) {
  return JSON.stringify({
    ok: result.status === "completed",
    toolName: result.toolName,
    rawToolName: result.rawToolName ?? null,
    status: result.status,
    summary: result.summary,
    payload: result.payload,
    knowledgeMatches: (result.knowledgeMatches ?? []).map((match) => ({
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      chunkId: match.chunkId,
      scope: match.scope,
      score: match.score,
      content: clipText(match.content, 1200),
    })),
  });
}

function formatAiRuntimeError(error: unknown) {
  return error instanceof AiRuntimeError
    ? `${error.message}${error.status ? ` (${error.status})` : ""}`
    : error instanceof Error
      ? error.message
      : "Unknown native tool calling error.";
}

function formatToolRuntimeError(error: unknown) {
  if (error instanceof AiRuntimeError) {
    return `${error.message}${error.status ? ` (${error.status})` : ""}`;
  }

  return error instanceof Error
    ? error.message
    : "Unknown consultation tool runtime error.";
}

function isMerchantMemoryMatch(match: { metadata: Record<string, unknown> }) {
  return match.metadata.contentKind === "merchant_memory";
}
