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

export type VoiceoverProvider = "aliyun_cosyvoice" | "bytedance_bigtts" | "minimax" | "302";
export type VoiceoverMode = "system" | "voice_profile";
export type TalkingHeadSubtitleSource =
  | "script"
  | "script_audio_alignment"
  | "asr_original_audio";
export type LipSyncProvider = "aliyun_videoretalk";
export type LipSyncScope = "talking_head_segments";
export type LipSyncInputRequirements = {
  audio: {
    allowedExtensions: ["wav", "mp3", "aac"];
    maxFileSizeBytes: number;
    minDurationSecondsExclusive: number;
    maxDurationSecondsExclusive: number;
    requiresCleanSpeech: true;
  };
  video: {
    allowedExtensions: ["mp4", "avi", "mov"];
    maxFileSizeBytes: number;
    minDurationSecondsExclusive: number;
    maxDurationSecondsExclusive: number;
    minFps: number;
    maxFps: number;
    allowedCodecs: ["h264", "h265"];
    minSidePixels: number;
    maxSidePixels: number;
    requiresClearFrontalFace: true;
  };
};

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
    talkingHeadSource?: TalkingHeadSubtitleSource;
  };
  lipSync?: {
    enabled?: boolean;
    provider?: LipSyncProvider;
    scope?: LipSyncScope;
    subtitleSource?: TalkingHeadSubtitleSource;
    requireVoiceProfile?: boolean;
    inputRequirements?: LipSyncInputRequirements;
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
  dailyTaskId?: string | null;
  instructionText?: string | null;
  inputAssetIds?: string[] | null;
  productionConfig?: ProductionConfig | null;
  sourceJobId?: string | null;
};
