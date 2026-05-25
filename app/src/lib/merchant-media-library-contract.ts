import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

export type MerchantMediaAssetSource =
  | "merchant_upload"
  | "merchant_confirmed"
  | "member_task_temp"
  | "content_draft_temp"
  | "voice_profile"
  | "worker_output";

export type MerchantMediaAssetRecord = {
  id: string;
  merchantId: string;
  uploadedByUserId: string;
  mediaType: "image" | "video";
  source: MerchantMediaAssetSource;
  sourceStorageKey: string;
  status:
    | "uploaded"
    | "validating"
    | "processing"
    | "tagging"
    | "ready"
    | "validation_failed"
    | "processing_failed"
    | "tagging_failed"
    | "needs_reclip"
    | "needs_retag"
    | "quarantined"
    | "archived";
  createdAt: string;
};

export type MerchantMediaLibraryValidationResult =
  | { ok: true; readyClips: PrivateMediaClipRecord[] }
  | { ok: false; errors: string[] };

const allowedTeamLibrarySources = new Set<MerchantMediaAssetSource>([
  "merchant_upload",
  "merchant_confirmed",
]);

export function assertMerchantMediaAssetCanEnterTeamLibrary(asset: MerchantMediaAssetRecord) {
  if (!asset.merchantId.trim()) {
    throw new MerchantMediaLibraryContractError("merchant_id is required.");
  }
  if (!asset.uploadedByUserId.trim()) {
    throw new MerchantMediaLibraryContractError("uploaded_by_user_id is required.");
  }
  if (!allowedTeamLibrarySources.has(asset.source)) {
    throw new MerchantMediaLibraryContractError(`source ${asset.source} cannot enter merchant_media_*.`);
  }
  if (!getMerchantMediaAssetStorageKey(asset).startsWith(`merchant-media/${asset.merchantId}/originals/${asset.id}/`)) {
    throw new MerchantMediaLibraryContractError("source storage key must stay under merchant-media/{merchant_id}/originals/{asset_id}/.");
  }
}

export function validateMerchantMediaReadyAsset(input: {
  asset: MerchantMediaAssetRecord;
  clips: PrivateMediaClipRecord[];
}): MerchantMediaLibraryValidationResult {
  const errors: string[] = [];

  try {
    assertMerchantMediaAssetCanEnterTeamLibrary(input.asset);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "asset failed team library gate.");
  }

  if (input.asset.status === "ready") {
    const readyClips = input.clips.filter(
      (clip) =>
        clip.merchantId === input.asset.merchantId &&
        clip.status === "ready" &&
        clip.mediaType === input.asset.mediaType,
    );

    if (readyClips.length === 0) {
      errors.push("ready asset must have at least one ready clip.");
    }

    for (const clip of readyClips) {
      validateReadyClip({ asset: input.asset, clip, errors });
    }

    if (errors.length === 0) {
      return { ok: true, readyClips };
    }
  }

  return errors.length === 0 ? { ok: true, readyClips: [] } : { ok: false, errors };
}

export function listMerchantReadyClips(input: {
  merchantId: string;
  clips: PrivateMediaClipRecord[];
}) {
  return input.clips.filter((clip) => clip.merchantId === input.merchantId && clip.status === "ready");
}

function validateReadyClip(input: {
  asset: MerchantMediaAssetRecord;
  clip: PrivateMediaClipRecord;
  errors: string[];
}) {
  const clipUsesOriginalObject =
    (input.clip.clipType === "full_video" || input.clip.clipType === "image") &&
    input.clip.clipIndex === 0 &&
    getPrivateMediaClipStorageKey(input.clip) === getMerchantMediaAssetStorageKey(input.asset);
  const clipUsesDerivedObject = getPrivateMediaClipStorageKey(input.clip).startsWith(`merchant-media/${input.asset.merchantId}/clips/${input.asset.id}/`);
  if (!clipUsesOriginalObject && !clipUsesDerivedObject) {
    input.errors.push("ready clip storage key must reference the original object or stay under merchant-media/{merchant_id}/clips/{asset_id}/.");
  }
  if (input.clip.clipIndex != null && (!Number.isInteger(input.clip.clipIndex) || input.clip.clipIndex < 0)) {
    input.errors.push("ready clip_index must be a non-negative integer.");
  }
  if (input.clip.clipType && input.clip.clipType !== "full_video" && input.clip.clipType !== "segment" && input.clip.clipType !== "image") {
    input.errors.push("ready clip_type must be full_video, segment, or image.");
  }
  if (input.asset.mediaType === "video") {
    if (input.clip.clipType !== "full_video" && input.clip.clipType !== "segment") {
      input.errors.push("video assets must produce full_video or segment clips.");
    }
    if (input.clip.clipType === "full_video") {
      if (input.clip.startTimeSeconds != null && input.clip.startTimeSeconds !== 0) {
        input.errors.push("full_video clip must start at 0 seconds.");
      }
      if (
        input.clip.endTimeSeconds != null &&
        input.clip.durationSeconds != null &&
        input.clip.endTimeSeconds !== input.clip.durationSeconds
      ) {
        input.errors.push("full_video clip must end at duration_seconds.");
      }
    }
    if (input.clip.clipType === "segment") {
      if (!Number.isFinite(input.clip.startTimeSeconds ?? NaN) || (input.clip.startTimeSeconds ?? -1) < 0) {
        input.errors.push("segment clip start_time_seconds is required.");
      }
      if (
        !Number.isFinite(input.clip.endTimeSeconds ?? NaN) ||
        (input.clip.endTimeSeconds ?? 0) <= (input.clip.startTimeSeconds ?? 0)
      ) {
        input.errors.push("segment clip end_time_seconds must be greater than start_time_seconds.");
      }
    }
  }
  if (input.asset.mediaType === "image") {
    if (input.clip.clipType && input.clip.clipType !== "image") {
      input.errors.push("image assets must produce an image clip.");
    }
    if (input.clip.durationSeconds != null) {
      input.errors.push("image clip must not write video duration_seconds.");
    }
  }
  if (!getPrivateMediaClipThumbStorageKey(input.clip)?.startsWith(`merchant-media/${input.asset.merchantId}/thumbs/${input.asset.id}/`)) {
    input.errors.push("ready clip thumb storage key is required under merchant-media/{merchant_id}/thumbs/{asset_id}/.");
  }
  if (!input.clip.description.trim()) {
    input.errors.push("ready clip description is required.");
  }
  if (input.clip.tags.length < 3) {
    input.errors.push("ready clip needs at least three tags.");
  }
  if (input.clip.orientation !== "portrait" && input.clip.orientation !== "landscape") {
    input.errors.push("ready clip orientation must be portrait or landscape.");
  }
  if (!Number.isFinite(input.clip.width) || input.clip.width <= 0) {
    input.errors.push("ready clip width is required.");
  }
  if (!Number.isFinite(input.clip.height) || input.clip.height <= 0) {
    input.errors.push("ready clip height is required.");
  }
  if (
    input.asset.mediaType === "video" &&
    (!Number.isFinite(input.clip.durationSeconds ?? NaN) || (input.clip.durationSeconds ?? 0) <= 0)
  ) {
    input.errors.push("ready video clip duration_seconds is required.");
  }
}

export class MerchantMediaLibraryContractError extends Error {}

export function getMerchantMediaAssetStorageKey(asset: MerchantMediaAssetRecord) {
  return asset.sourceStorageKey;
}

export function getPrivateMediaClipStorageKey(clip: PrivateMediaClipRecord) {
  return clip.storageKey;
}

export function getPrivateMediaClipThumbStorageKey(clip: PrivateMediaClipRecord) {
  return clip.thumbStorageKey ?? null;
}
