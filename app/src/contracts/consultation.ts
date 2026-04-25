export type ConsultationSessionStatus = "active" | "completed" | "archived";

export type ConsultationMessageRole = "assistant" | "user" | "system";

export type ConsultationToolCardDto = {
  key: string;
  label: string;
  summary: string;
  status: "completed" | "skipped";
};

export type ContentCalendarItemDto = {
  id: string;
  dayLabel: string;
  contentType: "article" | "video";
  strategyTag: string;
  title: string;
  summary: string;
};

export type StrategySnapshotDto = {
  positioning: string;
  coreSellingPoints: string[];
  targetAudiences: string[];
  keyScenes: string[];
  currentSuggestion: string;
  strategyTags: string[];
  contentCalendarDraft: ContentCalendarItemDto[];
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
  summaryText?: string | null;
  latestMessagePreview?: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ConsultationSessionDetailDto = ConsultationSessionSummaryDto & {
  messages: ConsultationMessageDto[];
  events: ConsultationEventDto[];
};

export type CreateConsultationSessionRequest = {
  title?: string | null;
};

export type SendConsultationMessageRequest = {
  content: string;
};
