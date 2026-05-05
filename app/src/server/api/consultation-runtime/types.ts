import type {
  AgentConfigDto,
  AgentPromptVersionDto,
  AgentSkillDto,
} from "@/contracts/agent-console";
import type {
  ConsultationSessionDetailDto,
  ConsultationToolCardDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type {
  ConsultationAgentSettingsDto,
  KnowledgeRuntimeSettingsDto,
  KnowledgeSearchMatchDto,
} from "@/contracts/knowledge";
import type { getPlatformSettings } from "@/lib/db/platform-admin-repository";

export type ConsultationAgentToolKey = ConsultationAgentSettingsDto["enabledTools"][number];

export type ConsultationRuntimeSkill = Pick<
  AgentSkillDto,
  "id" | "skillKey" | "name" | "description" | "whenToUse" | "body" | "dependencies"
> & {
  score?: number;
  triggerReasons?: string[];
};

export type ConsultationSkillDependencyWarning = {
  skillId: string;
  skillName: string;
  dependency: string;
  message: string;
};

export type ConsultationMentionRouting = {
  mode: "default_agent" | "mentioned_agent" | "mention_unresolved";
  rawMention: string | null;
  cleanedContent: string;
  targetAgentId: string | null;
  targetAgentKey: string | null;
  targetDisplayName: string | null;
  availableMentions: string[];
};

export type ConsultationAgentContainerSnapshot = {
  agent: AgentConfigDto;
  activePromptVersion: AgentPromptVersionDto | null;
  candidateSkills: ConsultationRuntimeSkill[];
  knowledgeSetIds: string[];
  knowledgeDocumentIds: string[];
};

export type ConsultationSkillDisclosure = {
  mode: "progressive_disclosure";
  candidateSkills: Array<Pick<ConsultationRuntimeSkill, "id" | "skillKey" | "name" | "whenToUse">>;
  activeSkills: Array<
    Pick<ConsultationRuntimeSkill, "id" | "skillKey" | "name" | "whenToUse" | "score" | "triggerReasons">
  >;
};

export type ConsultationAgentRuntimeSettings = ConsultationAgentSettingsDto & {
  container: ConsultationAgentContainerSnapshot | null;
  skillCatalog: ConsultationRuntimeSkill[];
  activeSkills: ConsultationRuntimeSkill[];
};

export type ConsultationAgentToolCall = {
  id: string;
  toolName: ConsultationAgentToolKey;
  args: Record<string, unknown>;
  repaired?: boolean;
};

export type ConsultationAgentToolResult = {
  callId: string;
  toolName: ConsultationAgentToolKey;
  status: ConsultationToolCardDto["status"];
  summary: string;
  payload: Record<string, unknown>;
  knowledgeMatches?: KnowledgeSearchMatchDto[];
};

export type ConsultationPlannerTraceItem = {
  turn: number;
  mode: "deterministic" | "model_tool_json" | "model_tool_json_fallback";
  status: "planned" | "fallback" | "stopped";
  toolName: ConsultationAgentToolKey | null;
  reason: string;
  error?: string | null;
};

export type ConsultationConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ExpertTurnNote = {
  agentId: string | null;
  agentKey: string | null;
  displayName: string | null;
  turnId: string;
  whatIUnderstood: string;
  whatIChanged: string;
  openQuestionsForUser: string[];
  handoffForNextExpert: string;
  confidence: "low" | "medium" | "high";
  createdAt?: string | null;
};

export type SharedConsultationState = {
  merchantProfileSummary: string;
  currentGoal: string | null;
  knownFacts: string[];
  openQuestions: string[];
  strategySnapshotSummary: string;
  expertTurnNotes: ExpertTurnNote[];
  unresolvedConflicts: string[];
  latestUserIntent: string;
};

export type ConsultationAgentLoopState = {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  userContent: string;
  userMessages: string[];
  conversationMessages: ConsultationConversationMessage[];
  mentionRouting: ConsultationMentionRouting;
  nextRound: number;
  nextStage: string;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  knowledgeMatches: KnowledgeSearchMatchDto[];
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown: string;
  plannerTrace: ConsultationPlannerTraceItem[];
  sharedConsultationState: SharedConsultationState;
  expertTurnNotes: ExpertTurnNote[];
  latestExpertTurnNote?: ExpertTurnNote | null;
  contextBudget?: Record<string, unknown>;
};
