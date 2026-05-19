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

export const VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES = [
  "pending",
  "queued",
  "preparing",
  "running",
] as const satisfies readonly VideoEditJobStatus[];

export function isVideoEditJobInFlightStatus(
  status: VideoEditJobStatus | string | null | undefined,
): status is (typeof VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES)[number] {
  return VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES.includes(
    status as (typeof VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES)[number],
  );
}

export type VideoEditProgressModuleStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type VideoEditProgressModuleDto = {
  key: string;
  label: string;
  status: VideoEditProgressModuleStatus;
  progressPct: number;
  detail?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type VideoEditJobDto = {
  id: string;
  merchantId: string;
  createdByUserId?: string | null;
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
  progressModules: VideoEditProgressModuleDto[];
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  resultAssets?: MediaAssetDto[];
};

export type PublicVideoEditJobDto = Pick<
  VideoEditJobDto,
  | "id"
  | "draftId"
  | "contentVariantId"
  | "status"
  | "currentStage"
  | "triggerSource"
  | "instructionText"
  | "progressPct"
  | "retryCount"
  | "failureReason"
  | "progressModules"
  | "startedAt"
  | "finishedAt"
  | "createdAt"
  | "updatedAt"
> & {
  resultAssets: MediaAssetDto[];
};

export type VoiceoverProvider = "bytedance_bigtts" | "minimax" | "302";
export type VoiceoverMode = "system" | "voice_profile";

export type BgmFilterKey = "mood" | "scene" | "genre" | "lang" | "id";
export type BgmFilter = Partial<Record<BgmFilterKey, Array<string | number>>>;

export type ProductionConfig = {
  voiceover?: {
    enabled?: boolean;
    mode?: VoiceoverMode;
    provider?: VoiceoverProvider;
    speaker?: string | null;
    voiceStyle?: string | null;
    voiceProfileId?: string;
    refAudioAssetId?: string;
    speed?: number | null;
    volume?: number | null;
    includeOriginalAudio?: boolean;
  };
  bgm?: {
    enabled?: boolean;
    userRequest?: string | null;
    include?: BgmFilter;
    exclude?: BgmFilter;
    volume?: number | null;
  };
  subtitles?: {
    enabled?: boolean;
    style?: "platform_default" | "bold_caption";
    talkingHeadSource?: "script" | "asr_original_audio";
  };
  render?: {
    aspectRatio?: "9:16";
    maxDurationSeconds?: number | null;
    includeOriginalAudio?: boolean;
    preserveTalkingHeadOriginalAudio?: boolean;
  };
};

export type CreateVideoEditJobRequest = {
  contentVariantId: string;
  instructionText?: string | null;
  productionConfig?: ProductionConfig | null;
  sourceJobId?: string | null;
};
