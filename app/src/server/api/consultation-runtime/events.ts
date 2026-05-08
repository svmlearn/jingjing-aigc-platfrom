import {
  buildSkillDependencyWarnings,
  buildSkillDisclosure,
} from "@/server/api/consultation-runtime/skills";
import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentToolCall,
  ConsultationAgentToolResult,
  ConsultationPlannerMode,
  ConsultationPlannerTraceItem,
} from "@/server/api/consultation-runtime/types";

type ConsultationRuntimeDesign =
  | "bounded_business_tool_loop_v1"
  | "native_tool_calling_loop_v1";

export type ConsultationRuntimeEventInput = {
  eventType: string;
  payload: Record<string, unknown>;
};

export type ConsultationRuntimeEventEmitter = (
  event: ConsultationRuntimeEventInput,
) => Promise<void>;

export function buildAgentLoopStartedPayload(input: {
  state: ConsultationAgentLoopState;
  maxConversationRounds: number;
  toolBudget: number;
}) {
  const { state } = input;

  return {
    mode: "bounded_tool_loop",
    round: state.nextRound,
    maxConversationRounds: input.maxConversationRounds,
    toolBudget: input.toolBudget,
    enabledTools: state.consultationAgent.enabledTools,
    mentionRouting: state.mentionRouting,
    businessTools: getConsultationBusinessToolCatalog()
      .filter((tool) => state.consultationAgent.enabledTools.includes(tool.key))
      .map((tool) => ({
        key: tool.key,
        label: tool.label,
        purpose: tool.purpose,
        writes: tool.writes,
      })),
    agentContainer: state.consultationAgent.container
      ? {
          agentId: state.consultationAgent.container.agent.id,
          agentKey: state.consultationAgent.container.agent.agentKey,
          displayName: state.consultationAgent.container.agent.displayName,
          activePromptVersion:
            state.consultationAgent.container.activePromptVersion?.versionNo ?? null,
          activeSoulVersion:
            state.consultationAgent.container.activeSoulVersion?.versionNo ?? null,
          candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
          activeSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
          knowledgeSetIds: state.consultationAgent.container.knowledgeSetIds,
          knowledgeDocumentIds: state.consultationAgent.container.knowledgeDocumentIds,
      }
      : null,
    expertTraffic: {
      policy: "short_term_expert_traffic_v1",
      sharedConsultationState: state.sharedConsultationState,
      expertTurnNotes: state.expertTurnNotes,
    },
    skillDisclosure: buildSkillDisclosure(state.consultationAgent),
    skillDependencyWarnings: buildSkillDependencyWarnings(state.consultationAgent),
    plannerMode: state.consultationAgent.plannerMode,
    runtimeDesign: resolveRuntimeDesign(state.consultationAgent.plannerMode),
  };
}

export function buildToolCompletedPayload(input: {
  toolCall: ConsultationAgentToolCall;
  result: ConsultationAgentToolResult;
  planner: ConsultationPlannerTraceItem;
}) {
  return {
    callId: input.toolCall.id,
    toolName: input.toolCall.toolName,
    repaired: input.toolCall.repaired ?? false,
    planner: input.planner,
    status: input.result.status,
    summary: input.result.summary,
    payload: input.result.payload,
  };
}

export function buildKnowledgeRetrievedPayload(result: ConsultationAgentToolResult) {
  return {
    source: "agent_loop",
    status: result.status,
    summary: result.summary,
    ...(result.payload as Record<string, unknown>),
  };
}

export function buildLoopCompletedPayload(input: {
  state: ConsultationAgentLoopState;
  toolResults: ConsultationAgentToolResult[];
  runtimeDesign?: ConsultationRuntimeDesign;
  plannerMode?: ConsultationPlannerMode;
  terminalReason?: string;
  fallbackReason?: string | null;
}) {
  return {
    runtimeDesign: input.runtimeDesign ?? resolveRuntimeDesign(input.state.consultationAgent.plannerMode),
    plannerMode: input.plannerMode ?? input.state.consultationAgent.plannerMode,
    terminalReason: input.terminalReason ?? "assistant_final",
    fallbackReason: input.fallbackReason ?? null,
    toolCount: input.toolResults.length,
    completedTools: input.toolResults
      .filter((result) => result.status === "completed")
      .map((result) => result.toolName),
    skippedTools: input.toolResults
      .filter((result) => result.status === "skipped")
      .map((result) => result.toolName),
    failedTools: input.toolResults
      .filter((result) => result.status === "failed")
      .map((result) => result.rawToolName ?? result.toolName),
    strategyTags: input.state.strategySnapshot.strategyTags,
    mentionRouting: input.state.mentionRouting,
    plannerTrace: input.state.plannerTrace,
    contextBoundary: input.state.contextBoundary ?? null,
    expertTraffic: {
      policy: "short_term_expert_traffic_v1",
      sharedConsultationState: input.state.sharedConsultationState,
      expertTurnNotes: input.state.expertTurnNotes,
      latestExpertTurnNote: input.state.latestExpertTurnNote ?? null,
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
