import type { MediaAssetDto } from "./media";

export type VideoEditJobTriggerSource = "manual" | "regenerate" | "agent_auto";

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
  triggerSource: VideoEditJobTriggerSource;
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

export type VoiceoverProvider = "bytedance_bigtts" | "minimax" | "302";

export type ProductionConfig = {
  voiceover?: {
    enabled?: boolean;
    provider?: VoiceoverProvider;
    voiceStyle?: string | null;
    speed?: number | null;
    volume?: number | null;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: Record<string, Array<string | number>>;
    exclude?: Record<string, Array<string | number>>;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
  };
};

export type CreateVideoEditJobRequest = {
  contentVariantId: string;
  instructionText?: string | null;
  inputPayload?: Record<string, unknown>;
  productionConfig?: ProductionConfig | null;
  sourceJobId?: string | null;
};
