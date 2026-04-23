import type { MediaAssetDto } from "./media";

export type VideoEditJobStatus =
  | "pending"
  | "queued"
  | "preparing"
  | "running"
  | "succeeded"
  | "failed_retryable"
  | "failed_manual"
  | "cancelled";

export type VideoEditJobDto = {
  id: string;
  merchantId: string;
  draftId: string;
  contentVariantId: string;
  status: VideoEditJobStatus;
  currentStage?: string | null;
  instructionText?: string | null;
  inputPayload: Record<string, unknown>;
  runtimePayload: Record<string, unknown>;
  progressPct: number;
  retryCount: number;
  failureReason?: string | null;
  resultPayload: Record<string, unknown>;
  logPayload: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  resultAssets?: MediaAssetDto[];
};

export type CreateVideoEditJobRequest = {
  contentVariantId: string;
  instructionText?: string | null;
  inputPayload?: Record<string, unknown>;
};
