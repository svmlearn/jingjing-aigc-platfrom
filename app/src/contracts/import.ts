export type Platform = "xiaohongshu" | "douyin";

export type ImportType = "detail" | "creator" | "comments";

export type ImportJobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "partial"
  | "failed";

export type ImportRequest = {
  platform: Platform;
  importType: ImportType;
  url: string;
  options?: {
    includeComments?: boolean;
    maxItems?: number;
    maxComments?: number;
  };
};

export type ImportJobDto = {
  id: string;
  platform: Platform;
  importType: ImportType;
  status: ImportJobStatus;
  inputUrl: string;
  totalItems?: number | null;
  successItems: number;
  errorSummary?: string | null;
  sourceItemIds?: string[];
  commentCount?: number;
  createdAt: string;
  finishedAt?: string | null;
};

export type ImportJobResponse = {
  job: ImportJobDto;
};

export type ImportErrorCode =
  | "INVALID_INPUT"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_MEMORY_LIMIT"
  | "PROVIDER_RUN_FAILED"
  | "EMPTY_DATASET"
  | "LOW_QUALITY_RESULT"
  | "NORMALIZATION_FAILED";
