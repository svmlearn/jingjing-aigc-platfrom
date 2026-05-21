export type ConsultationSessionStatus = "active" | "completed" | "archived";

export type ConsultationMessageRole = "assistant" | "user" | "system";

export type ConsultationMode = "standard" | "roundtable";

export type ConsultationToolCardDto = {
  key: string;
  label: string;
  summary: string;
  status: "completed" | "skipped" | "failed";
};

export type ContentCalendarKnowledgeRefDto = {
  id: string;
  source: "merchant_knowledge_base" | "platform_knowledge_base" | "strategy_asset" | "material_library" | string;
  title: string;
  summary: string;
  documentId?: string | null;
  chunkId?: string | null;
  documentTitle?: string | null;
  sourceName?: string | null;
  scope?: "merchant" | "platform" | string | null;
  excerpt?: string | null;
  score?: number | null;
  chunkIndex?: number | null;
};

export type ContentCalendarGuidanceDto = {
  source: "consultation_knowledge_distillation_v1" | string;
  summary?: string | null;
  mustUseFacts: string[];
  sellingPointHints: string[];
  audienceHints: string[];
  contentAngles: string[];
  complianceNotes: string[];
  materialHints: string[];
  shotConstraints?: string[];
  assetCapabilityHints?: string[];
  retrievalTrace?: Array<{
    source?: string | null;
    documentId?: string | null;
    chunkId?: string | null;
    documentTitle?: string | null;
    scope?: string | null;
    score?: number | null;
  }>;
  knowledgeRefs: ContentCalendarKnowledgeRefDto[];
};

export type ContentCalendarItemDto = {
  id: string;
  dayLabel: string;
  contentType: "article" | "video";
  strategyTag: string;
  title: string;
  summary: string;
  guidance?: ContentCalendarGuidanceDto | null;
};

export type ContentCalendarGenerationStatusDto = {
  status: "draft" | "generated" | "modified_after_generation";
  currentRevisionId: string;
  generatedFromRevisionId?: string | null;
  generatedBatchId?: string | null;
  generatedAt?: string | null;
  generatedByUserId?: string | null;
  generatedJobCount?: number | null;
};

export type StrategySnapshotDto = {
  positioning: string;
  coreSellingPoints: string[];
  targetAudiences: string[];
  keyScenes: string[];
  currentSuggestion: string;
  strategyTags: string[];
  contentCalendarDraft: ContentCalendarItemDto[];
  contentCalendarGeneration?: ContentCalendarGenerationStatusDto | null;
  articleBrief?: {
    workingTitle: string;
    angle: string;
    callToAction: string;
  } | null;
  videoBrief?: {
    workingTitle: string;
    hook: string;
    outcome: string;
  } | null;
};

export type MerchantStrategyAssetDto = {
  merchantId: string;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown: string;
  canonicalSnapshot?: Record<string, unknown> | null;
  compiledContext?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

export type RoundtablePhaseKey = "intro" | "asset" | "skill" | "marketing" | "synthesis";

export type RoundtableInterviewPhaseKey = "asset" | "skill" | "marketing";

export type RoundtableAgentRole =
  | "moderator"
  | "asset_manager"
  | "skill_mapper"
  | "marketing_strategist";

export type RoundtableSessionStatus =
  | "intro"
  | "asset_interviewing"
  | "asset_summarizing"
  | "skill_interviewing"
  | "skill_summarizing"
  | "marketing_interviewing"
  | "marketing_summarizing"
  | "synthesis_review"
  | "strategy_saved"
  | "failed"
  | "archived";

export type RoundtableSummaryFieldDto = {
  label: string;
  items: string[];
};

export type RoundtablePhaseOutputDto = {
  phaseKey: RoundtableInterviewPhaseKey;
  agentRole: RoundtableAgentRole;
  title: string;
  fields: RoundtableSummaryFieldDto[];
  handoffSummary: string;
  confidence: "low" | "medium" | "high";
  sourceMessageIds: string[];
  createdAt: string;
};

export type RoundtableHandoffDto = {
  fromPhase: RoundtableInterviewPhaseKey;
  toPhase: RoundtableInterviewPhaseKey | "synthesis";
  handoffSummary: string;
  includedContextKeys: string[];
  excludedContextReason: string;
  createdAt: string;
};

export type RoundtableStateDto = {
  mode: "roundtable";
  status: RoundtableSessionStatus;
  currentPhase: RoundtablePhaseKey;
  currentAgentRole: RoundtableAgentRole;
  startedAt: string;
  updatedAt: string;
  phaseOutputs: Partial<Record<RoundtableInterviewPhaseKey, RoundtablePhaseOutputDto>>;
  handoffTrace: RoundtableHandoffDto[];
  strategyCandidate?: StrategySnapshotDto | null;
  strategySavedAt?: string | null;
};

export type ConsultationMessageDto = {
  id: string;
  sessionId: string;
  role: ConsultationMessageRole;
  content: string;
  stageLabel?: string | null;
  toolCards: ConsultationToolCardDto[];
  visibleSummary: Record<string, unknown>;
  createdAt: string;
};

export type ConsultationEventDto = {
  id: string;
  sessionId: string;
  eventType: string;
  stageLabel?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ConsultationSessionSummaryDto = {
  id: string;
  merchantId: string;
  title?: string | null;
  status: ConsultationSessionStatus;
  currentStage?: string | null;
  strategySnapshot: StrategySnapshotDto;
  strategyAsset?: MerchantStrategyAssetDto | null;
  summaryText?: string | null;
  latestMessagePreview?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ConsultationSessionDetailDto = ConsultationSessionSummaryDto & {
  messages: ConsultationMessageDto[];
  events: ConsultationEventDto[];
  roundtable?: RoundtableStateDto | null;
};

export type ConsultationExpertRosterItemDto = {
  agentId: string;
  agentKey: string;
  displayName: string;
  mentionLabel: string;
  roleDescription?: string | null;
  description?: string | null;
  isDefault: boolean;
};

export type CreateConsultationSessionRequest = {
  title?: string | null;
  mode?: ConsultationMode;
};

export type SendConsultationMessageRequest = {
  content: string;
};

export type RoundtableActionRequest = {
  action:
    | "complete_phase"
    | "confirm_phase_summary"
    | "return_to_phase"
    | "save_strategy_candidate";
};
