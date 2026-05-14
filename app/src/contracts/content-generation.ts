export type ContentGenerationProvider = "dify" | "langgraph";

export type ContentGenerationBatchSource =
  | "consultation_calendar"
  | "manual_calendar"
  | "campaign"
  | "daily_task";

export type ContentGenerationBatchStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "canceled";

export type ContentGenerationJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed_retryable"
  | "failed_manual"
  | "canceled";

export type ContentGenerationBatchDto = {
  id: string;
  merchantId: string;
  createdByUserId?: string | null;
  source: ContentGenerationBatchSource;
  calendarSnapshot: Record<string, unknown>;
  memberScopeSnapshot: Record<string, unknown>;
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  runningJobs: number;
  status: ContentGenerationBatchStatus;
  workflowProvider: ContentGenerationProvider;
  workflowVersion: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentGenerationJobDto = {
  id: string;
  batchId: string;
  merchantId: string;
  memberUserId: string;
  dailyTaskId: string;
  taskDate: string;
  calendarItemId?: string | null;
  idempotencyKey: string;
  status: ContentGenerationJobStatus;
  currentStage?: string | null;
  attemptCount: number;
  maxAttempts: number;
  inputSnapshot: Record<string, unknown>;
  outputJson?: Record<string, unknown> | null;
  qualityReview?: Record<string, unknown> | null;
  errorMessage?: string | null;
  workflowProvider: ContentGenerationProvider;
  workflowVersion: string;
  difyWorkflowRunId?: string | null;
  contentDraftId?: string | null;
  articleVariantId?: string | null;
  videoVariantId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentGenerationJobProgressDto = {
  batchId: string;
  jobId: string;
  status: ContentGenerationJobStatus;
  provider: ContentGenerationProvider;
  workflowVersion: string;
  currentStage?: string | null;
  qualityPass?: boolean | null;
  errorMessage?: string | null;
  contentDraftId?: string | null;
  articleVariantId?: string | null;
  videoVariantId?: string | null;
  updatedAt: string;
};
