import type { VideoEditJobStatus } from "../contracts/video.ts";

export type MemberVideoResultAssetLike = {
  assetType?: string | null;
  signedPreviewUrl?: string | null;
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

export function summarizeMemberVideoEditState(input: {
  uploadedFileCount: number;
  job: MemberVideoEditJobLike | null;
}) {
  const previewUrl = getMemberVideoResultUrl(input.job);
  const stage = getMemberVideoEditStage(input);

  return {
    stage,
    canStartEdit: input.uploadedFileCount > 0 && !input.job,
    canPreviewDownload: stage === "succeeded" && Boolean(previewUrl),
    previewUrl,
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
