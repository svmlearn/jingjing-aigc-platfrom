import { randomUUID } from "node:crypto";

import {
  type MerchantMediaAssetRecord,
  validateMerchantMediaReadyAsset,
} from "./merchant-media-library-contract.ts";
import type { MerchantMediaRepository } from "./merchant-media-repository-contract.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

export type MerchantMediaManifestRequest = {
  draftId?: string | null;
  asset: {
    id?: string;
    mediaType: "image" | "video";
    source?: MerchantMediaAssetRecord["source"];
    bucketName?: string | null;
    sourceCosKey: string;
    mimeType?: string | null;
    idempotencyKey?: string | null;
  };
  clips: Array<{
    id?: string;
    clipIndex: number;
    mediaType?: "image" | "video";
    clipType: PrivateMediaClipRecord["clipType"];
    startTimeSeconds?: number | null;
    endTimeSeconds?: number | null;
    durationSeconds?: number | null;
    bucketName?: string | null;
    cosKey: string;
    thumbCosKey?: string | null;
    mimeType?: string | null;
    width: number;
    height: number;
    orientation?: "portrait" | "landscape";
    description: string;
    tags: string[];
    industryTags?: string[];
    sceneTags?: string[];
    shotTags?: string[];
    peopleTags?: string[];
    qualityTags?: string[];
    tagConfidence?: number | null;
    tagSource?: PrivateMediaClipRecord["tagSource"];
  }>;
};

export type MerchantMediaManifestResult = {
  asset: {
    id: string;
    merchantId: string;
    mediaType: "image" | "video";
    status: "ready";
    sourceCosKey: string;
  };
  clips: Array<{
    id: string;
    assetId?: string;
    clipIndex?: number;
    clipType?: PrivateMediaClipRecord["clipType"];
    mediaType: "image" | "video";
    cosKey: string;
    tags: string[];
    sceneTags?: string[];
    shotTags?: string[];
  }>;
  draftId?: string | null;
};

export class MerchantMediaManifestContractError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function receiveMerchantMediaManifest(input: {
  userId: string;
  merchantId: string;
  request: MerchantMediaManifestRequest;
  repository: MerchantMediaRepository;
  defaultBucketName?: string | null;
  now?: string;
}): Promise<MerchantMediaManifestResult> {
  const now = input.now ?? new Date().toISOString();
  const bucketName = resolveBucketName(input.request.asset.bucketName, input.defaultBucketName);
  const assetId = input.request.asset.id ?? randomUUID();
  const sourceCosKey = input.request.asset.sourceCosKey.trim();

  assertMerchantMediaSourceKey({
    merchantId: input.merchantId,
    assetId,
    sourceCosKey,
  });

  const asset = {
    id: assetId,
    merchantId: input.merchantId,
    uploadedByUserId: input.userId,
    mediaType: input.request.asset.mediaType,
    source: input.request.asset.source ?? "merchant_upload",
    sourceCosKey,
    status: "ready" as const,
    createdAt: now,
  };
  const clips = input.request.clips.map((clip) =>
    normalizeManifestClip({
      merchantId: input.merchantId,
      assetId,
      assetMediaType: asset.mediaType,
      bucketName: resolveBucketName(clip.bucketName ?? bucketName, input.defaultBucketName),
      now,
      clip,
    }),
  );
  const validation = validateMerchantMediaReadyAsset({ asset, clips });

  if (!validation.ok) {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_MANIFEST_INVALID",
      "Merchant media manifest did not pass ready-asset validation.",
      { errors: validation.errors },
    );
  }

  const upsertedAsset = await input.repository.upsertAsset({
    asset,
    idempotencyKey:
      input.request.asset.idempotencyKey?.trim() ||
      `${input.merchantId}:${assetId}:${sourceCosKey}`,
  });
  const upsertedClips: PrivateMediaClipRecord[] = [];

  for (const clip of validation.readyClips) {
    upsertedClips.push(
      await input.repository.upsertReadyClip({
        merchantId: input.merchantId,
        assetId: upsertedAsset.id,
        clip,
      }),
    );
  }

  return {
    asset: {
      id: upsertedAsset.id,
      merchantId: upsertedAsset.merchantId,
      mediaType: upsertedAsset.mediaType,
      status: "ready",
      sourceCosKey: upsertedAsset.sourceCosKey,
    },
    clips: upsertedClips.map((clip) => ({
      id: clip.id,
      assetId: clip.assetId,
      clipIndex: clip.clipIndex,
      clipType: clip.clipType,
      mediaType: clip.mediaType,
      cosKey: clip.cosKey,
      tags: clip.tags,
      sceneTags: clip.sceneTags,
      shotTags: clip.shotTags,
    })),
    draftId: input.request.draftId ?? null,
  };
}

function normalizeManifestClip(input: {
  merchantId: string;
  assetId: string;
  assetMediaType: "image" | "video";
  bucketName: string;
  now: string;
  clip: MerchantMediaManifestRequest["clips"][number];
}): PrivateMediaClipRecord {
  const clipMediaType = input.clip.mediaType ?? input.assetMediaType;

  if (clipMediaType !== input.assetMediaType) {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_CLIP_TYPE_MISMATCH",
      "Manifest clip mediaType must match asset mediaType.",
    );
  }

  assertMerchantMediaClipKey({
    merchantId: input.merchantId,
    assetId: input.assetId,
    mediaType: clipMediaType,
    clipType: input.clip.clipType,
    cosKey: input.clip.cosKey,
    thumbCosKey: input.clip.thumbCosKey ?? null,
  });

  const durationSeconds = normalizeClipDuration(input.clip);

  return {
    id: input.clip.id ?? randomUUID(),
    assetId: input.assetId,
    merchantId: input.merchantId,
    mediaType: clipMediaType,
    status: "ready",
    clipIndex: input.clip.clipIndex,
    clipType: input.clip.clipType,
    startTimeSeconds:
      clipMediaType === "video" ? input.clip.startTimeSeconds ?? 0 : null,
    endTimeSeconds:
      clipMediaType === "video"
        ? input.clip.endTimeSeconds ?? durationSeconds
        : null,
    width: input.clip.width,
    height: input.clip.height,
    durationSeconds,
    orientation:
      input.clip.orientation ??
      (input.clip.height >= input.clip.width ? "portrait" : "landscape"),
    description: input.clip.description.trim(),
    tags: uniqueTrimmedStrings(input.clip.tags),
    industryTags: uniqueTrimmedStrings(input.clip.industryTags ?? []),
    sceneTags: uniqueTrimmedStrings(input.clip.sceneTags ?? []),
    shotTags: uniqueTrimmedStrings(input.clip.shotTags ?? []),
    peopleTags: uniqueTrimmedStrings(input.clip.peopleTags ?? []),
    qualityTags: uniqueTrimmedStrings(input.clip.qualityTags ?? []),
    tagConfidence: input.clip.tagConfidence ?? null,
    tagSource: input.clip.tagSource ?? "manual",
    bucketName: input.bucketName,
    cosKey: input.clip.cosKey.trim(),
    thumbCosKey: input.clip.thumbCosKey?.trim() ?? null,
    mimeType: input.clip.mimeType ?? (clipMediaType === "image" ? "image/jpeg" : "video/mp4"),
    createdAt: input.now,
  };
}

function assertMerchantMediaSourceKey(input: {
  merchantId: string;
  assetId: string;
  sourceCosKey: string;
}) {
  const expectedPrefix = `merchant-media/${input.merchantId}/originals/${input.assetId}/`;

  if (!input.sourceCosKey.startsWith(expectedPrefix)) {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_SOURCE_KEY_INVALID",
      "sourceCosKey must stay under merchant-media/{merchantId}/originals/{assetId}/.",
      { expectedPrefix },
    );
  }
}

function assertMerchantMediaClipKey(input: {
  merchantId: string;
  assetId: string;
  mediaType: "image" | "video";
  clipType: PrivateMediaClipRecord["clipType"];
  cosKey: string;
  thumbCosKey?: string | null;
}) {
  const trimmedCosKey = input.cosKey.trim();
  const sourcePrefix = `merchant-media/${input.merchantId}/originals/${input.assetId}/`;
  const clipPrefix = `merchant-media/${input.merchantId}/clips/${input.assetId}/`;
  const usesSourceObject =
    (input.clipType === "full_video" || input.clipType === "image") &&
    trimmedCosKey.startsWith(sourcePrefix);

  if (!usesSourceObject && !trimmedCosKey.startsWith(clipPrefix)) {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_CLIP_KEY_INVALID",
      "clip cosKey must stay under merchant-media/{merchantId}/clips/{assetId}/ or use the original object for full_video/image.",
      { expectedPrefixes: [clipPrefix, sourcePrefix] },
    );
  }

  if (input.mediaType === "video" && input.clipType !== "full_video" && input.clipType !== "segment") {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_CLIP_TYPE_INVALID",
      "Video manifest clips must use full_video or segment.",
    );
  }

  if (input.mediaType === "image" && input.clipType !== "image") {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_CLIP_TYPE_INVALID",
      "Image manifest clips must use image.",
    );
  }

  const thumbPrefix = `merchant-media/${input.merchantId}/thumbs/${input.assetId}/`;
  if (!input.thumbCosKey?.trim().startsWith(thumbPrefix)) {
    throw new MerchantMediaManifestContractError(
      400,
      "MERCHANT_MEDIA_THUMB_KEY_INVALID",
      "thumbCosKey must stay under merchant-media/{merchantId}/thumbs/{assetId}/.",
      { expectedPrefix: thumbPrefix },
    );
  }
}

function normalizeClipDuration(clip: MerchantMediaManifestRequest["clips"][number]) {
  if (clip.clipType === "image") {
    return null;
  }

  if (clip.durationSeconds != null) {
    return clip.durationSeconds;
  }

  if (clip.startTimeSeconds != null && clip.endTimeSeconds != null) {
    return Number((clip.endTimeSeconds - clip.startTimeSeconds).toFixed(3));
  }

  throw new MerchantMediaManifestContractError(
    400,
    "MERCHANT_MEDIA_CLIP_DURATION_REQUIRED",
    "Video manifest clips require durationSeconds or start/end time.",
  );
}

function resolveBucketName(bucketName?: string | null, defaultBucketName?: string | null) {
  if (bucketName?.trim()) {
    return bucketName.trim();
  }

  if (defaultBucketName?.trim()) {
    return defaultBucketName.trim();
  }

  throw new MerchantMediaManifestContractError(
    400,
    "MERCHANT_MEDIA_BUCKET_REQUIRED",
    "Merchant media manifest requires bucketName or server COS bucket config.",
  );
}

function uniqueTrimmedStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
