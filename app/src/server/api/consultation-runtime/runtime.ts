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
import type {
  ConsultationAgentLoopState,
  ConsultationAgentToolCall,
  ConsultationAgentToolResult,
} from "@/server/api/consultation-runtime/types";
import { uniqueStrings } from "@/server/api/consultation-runtime/utils";

export type ConsultationRuntimeAssistantReply = {
  content: string;
  mode: "llm" | "fallback_no_key" | "fallback_error";
  model?: string;
  error?: string;
};

export type ConsultationRuntimeSnapshotRecord = {
  agentId: string | null;
  promptVersionId: string | null;
  candidateSkillIds: string[];
  actualSkillIds: string[];
  knowledgeSetIds: string[];
  knowledgeMatchIds: string[];
  memoryMatchIds: string[];
  toolCallSummary: Record<string, unknown>;
  model: string | null;
};

export async function runConsultationRuntime(input: {
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
}) {
  const toolResults: ConsultationAgentToolResult[] = [];

  await input.emitEvent({
    eventType: "agent.loop.started",
    payload: buildAgentLoopStartedPayload({
      state: input.state,
      maxConversationRounds: input.maxConversationRounds,
      toolBudget: input.toolBudget,
    }),
  });

  while (toolResults.length < input.toolBudget) {
    const plannerDecision = await planNextConsultationToolCall({
      state: input.state,
      completedToolNames: getPlannerCompletedToolNames(toolResults),
      toolResults,
    });

    input.state.plannerTrace.push(plannerDecision.trace);

    if (!plannerDecision.call) {
      break;
    }

    const toolCall = repairConsultationToolCall(plannerDecision.call, input.state);
    const result = await input.dispatchTool(input.state, toolCall);

    input.applyToolResultToState(input.state, result);
    toolResults.push(result);

    await input.emitEvent({
      eventType: "agent.tool.completed",
      payload: buildToolCompletedPayload({
        toolCall,
        result,
        planner: plannerDecision.trace,
      }),
    });

    if (result.toolName === "retrieve_knowledge_base") {
      await input.emitEvent({
        eventType: "knowledge.retrieved",
        payload: buildKnowledgeRetrievedPayload(result),
      });
    }

    if (shouldStopAfterToolResult(result)) {
      break;
    }
  }

  const assistantReply = await input.buildAssistantReply({
    state: input.state,
    toolResults,
  });

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
    },
  });

  await input.emitEvent({
    eventType: "agent.loop.completed",
    payload: buildLoopCompletedPayload({
      state: input.state,
      toolResults,
    }),
  });

  return {
    toolResults,
    assistantReply,
    runtimeSnapshot: buildConsultationRuntimeSnapshotRecord({
      state: input.state,
      toolResults,
      assistantReply,
    }),
  };
}

export function getPlannerCompletedToolNames(
  toolResults: ConsultationAgentToolResult[],
): ConsultationAgentToolCall["toolName"][] {
  return toolResults
    .filter((result) => result.toolName !== "update_strategy_snapshot" || result.status === "completed")
    .map((result) => result.toolName);
}

function shouldStopAfterToolResult(result: ConsultationAgentToolResult) {
  return result.toolName === "update_strategy_snapshot" && result.status !== "completed";
}

export function buildConsultationRuntimeSnapshotRecord(input: {
  state: ConsultationAgentLoopState;
  toolResults: ConsultationAgentToolResult[];
  assistantReply: ConsultationRuntimeAssistantReply;
}): ConsultationRuntimeSnapshotRecord {
  const { state, toolResults, assistantReply } = input;
  const agentContainer = state.consultationAgent.container;
  const memoryMatches = state.knowledgeMatches.filter(isMerchantMemoryMatch);

  return {
    agentId: agentContainer?.agent.id ?? null,
    promptVersionId: agentContainer?.activePromptVersion?.id ?? null,
    candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
    actualSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
    knowledgeSetIds: agentContainer?.knowledgeSetIds ?? [],
    knowledgeMatchIds: uniqueStrings(state.knowledgeMatches.map((match) => match.chunkId)),
    memoryMatchIds: uniqueStrings(memoryMatches.map((match) => match.chunkId)),
    model: assistantReply.model ?? state.consultationAgent.model ?? null,
    toolCallSummary: {
      runtimeDesign: "bounded_business_tool_loop_v1",
      mentionRouting: state.mentionRouting,
      assistantMode: assistantReply.mode,
      assistantError: assistantReply.error ?? null,
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
      memoryMatches: memoryMatches.map((match) => ({
        chunkId: match.chunkId,
        documentId: match.documentId,
        documentTitle: match.documentTitle,
      })),
      contextBudget: state.contextBudget ?? null,
      toolResults: toolResults.map((result) => ({
        toolName: result.toolName,
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
    },
  };
}

function isMerchantMemoryMatch(match: { metadata: Record<string, unknown> }) {
  return match.metadata.contentKind === "merchant_memory";
}
