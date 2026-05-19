import type { VideoEditJobStatus } from "../contracts/video.ts";

type VoiceProfileAudioFileLike = {
  name: string;
  type: string;
};

export type MemberVideoResultAssetLike = {
  assetType?: string | null;
  signedPreviewUrl?: string | null;
  signedDownloadUrl?: string | null;
  originUrl?: string | null;
};

export type MemberVideoEditJobLike = {
  status: VideoEditJobStatus;
  progressPct?: number | null;
  failureReason?: string | null;
  resultAssets?: MemberVideoResultAssetLike[] | null;
};

export type MemberVideoEditStage =
  | "awaiting_upload"
  | "ready_to_edit"
  | "queued"
  | "editing"
  | "succeeded"
  | "failed";

export function getMemberVideoResultUrl(job: MemberVideoEditJobLike | null) {
  const resultAsset = job?.resultAssets?.find((asset) => asset.assetType === "video");

  return resultAsset?.signedPreviewUrl ?? resultAsset?.originUrl ?? null;
}

export function getMemberVideoDownloadUrl(job: MemberVideoEditJobLike | null) {
  const resultAsset = job?.resultAssets?.find((asset) => asset.assetType === "video");

  return (
    resultAsset?.signedDownloadUrl ??
    resultAsset?.signedPreviewUrl ??
    resultAsset?.originUrl ??
    null
  );
}

export function summarizeMemberVideoEditState(input: {
  uploadedFileCount: number;
  job: MemberVideoEditJobLike | null;
}) {
  const previewUrl = getMemberVideoResultUrl(input.job);
  const downloadUrl = getMemberVideoDownloadUrl(input.job);
  const stage = getMemberVideoEditStage(input);

  return {
    stage,
    canStartEdit: input.uploadedFileCount > 0 && !input.job,
    canPreviewDownload: stage === "succeeded" && Boolean(previewUrl),
    previewUrl,
    downloadUrl,
  };
}

function getMemberVideoEditStage(input: {
  uploadedFileCount: number;
  job: MemberVideoEditJobLike | null;
}): MemberVideoEditStage {
  if (!input.job) {
    return input.uploadedFileCount > 0 ? "ready_to_edit" : "awaiting_upload";
  }

  if (input.job.status === "succeeded") {
    return "succeeded";
  }

  if (
    input.job.status === "failed_manual" ||
    input.job.status === "failed_retryable" ||
    input.job.status === "cancelled"
  ) {
    return "failed";
  }

  return input.job.status === "running" || input.job.status === "preparing" ? "editing" : "queued";
}

export function normalizeVoiceProfileAudioMimeType(file: VoiceProfileAudioFileLike) {
  const fileName = file.name.toLowerCase();
  const browserType = file.type.trim().toLowerCase();

  if (/\.(m4a|mp4)$/i.test(fileName)) {
    return "audio/mp4";
  }

  if (/\.aac$/i.test(fileName)) {
    return "audio/aac";
  }

  if (/\.mp3$/i.test(fileName)) {
    return "audio/mpeg";
  }

  if (/\.wav$/i.test(fileName)) {
    return "audio/wav";
  }

  if (/\.ogg$/i.test(fileName)) {
    return "audio/ogg";
  }

  if (/\.opus$/i.test(fileName)) {
    return "audio/opus";
  }

  if (/\.webm$/i.test(fileName)) {
    return "audio/webm";
  }

  return browserType.startsWith("audio/") ? browserType : "application/octet-stream";
}
