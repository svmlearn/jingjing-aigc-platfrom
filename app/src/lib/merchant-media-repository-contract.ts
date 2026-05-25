import type {
  MerchantMediaAssetRecord,
} from "./merchant-media-library-contract.ts";
import type {
  PrivateMediaClipRecord,
} from "./private-media-pexels-adapter.ts";

export type MerchantMediaRepository = {
  upsertAsset(input: {
    asset: MerchantMediaAssetRecord;
    idempotencyKey: string;
  }): Promise<MerchantMediaAssetRecord>;
  upsertReadyClip(input: {
    merchantId: string;
    assetId: string;
    clip: PrivateMediaClipRecord;
  }): Promise<PrivateMediaClipRecord>;
  listAssetsByMerchant(input: { merchantId: string }): Promise<MerchantMediaAssetRecord[]>;
  listReadyClipsByMerchant(input: { merchantId: string }): Promise<PrivateMediaClipRecord[]>;
  getReadyClipByMerchant(input: {
    merchantId: string;
    clipId: string;
  }): Promise<PrivateMediaClipRecord | null>;
};

export class InMemoryMerchantMediaRepository implements MerchantMediaRepository {
  private readonly assetsById = new Map<string, MerchantMediaAssetRecord>();
  private readonly assetsByIdempotencyKey = new Map<string, string>();
  private readonly clipsById = new Map<string, PrivateMediaClipRecord>();
  private readonly clipIdByAssetIndex = new Map<string, string>();

  async upsertAsset(input: {
    asset: MerchantMediaAssetRecord;
    idempotencyKey: string;
  }) {
    const asset = normalizeMerchantMediaAssetStorageAliases(input.asset);
    assertMerchantMediaRepositoryAsset(asset);
    const existingId = this.assetsByIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.assetsById.get(existingId);
      if (existing) {
        return existing;
      }
    }

    this.assetsById.set(asset.id, asset);
    this.assetsByIdempotencyKey.set(input.idempotencyKey, asset.id);

    return asset;
  }

  async upsertReadyClip(input: {
    merchantId: string;
    assetId: string;
    clip: PrivateMediaClipRecord;
  }) {
    const normalizedClip = normalizePrivateMediaClipStorageAliases(input.clip);
    assertMerchantMediaRepositoryReadyClip({
      ...input,
      clip: normalizedClip,
    });

    const asset = this.assetsById.get(input.assetId);
    if (!asset || asset.merchantId !== input.merchantId) {
      throw new MerchantMediaRepositoryContractError(
        "MERCHANT_MEDIA_ASSET_NOT_FOUND",
        "Ready clip asset must exist in the same merchant.",
      );
    }

    const idempotencyKey = `${input.merchantId}:${input.assetId}:${input.clip.clipIndex}`;
    const existingClipId = this.clipIdByAssetIndex.get(idempotencyKey);
    if (existingClipId) {
      const existing = this.clipsById.get(existingClipId);
      if (existing) {
        return existing;
      }
    }

    const clip = {
      ...normalizedClip,
      assetId: input.assetId,
    };
    this.clipsById.set(clip.id, clip);
    this.clipIdByAssetIndex.set(idempotencyKey, clip.id);

    return clip;
  }

  async listAssetsByMerchant(input: { merchantId: string }) {
    assertMerchantId(input.merchantId);

    return Array.from(this.assetsById.values()).filter((asset) => asset.merchantId === input.merchantId);
  }

  async listReadyClipsByMerchant(input: { merchantId: string }) {
    assertMerchantId(input.merchantId);

    return Array.from(this.clipsById.values()).filter(
      (clip) => clip.merchantId === input.merchantId && clip.status === "ready",
    );
  }

  async getReadyClipByMerchant(input: {
    merchantId: string;
    clipId: string;
  }) {
    assertMerchantId(input.merchantId);
    const clip = this.clipsById.get(input.clipId);

    return clip?.merchantId === input.merchantId && clip.status === "ready" ? clip : null;
  }
}

export function assertMerchantMediaRepositoryAsset(asset: MerchantMediaAssetRecord) {
  assertMerchantId(asset.merchantId);
  normalizeMerchantMediaAssetStorageAliases(asset);
  if (asset.mediaType !== "image" && asset.mediaType !== "video") {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_ASSET_TYPE_INVALID",
      "Merchant media repository only accepts image or video assets.",
    );
  }
  if (asset.source === "voice_profile") {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_VOICE_AUDIO_FORBIDDEN",
      "Voice recordings must stay in the voice_profile asset flow and never enter merchant_media_*.",
    );
  }
  if (asset.source !== "merchant_upload" && asset.source !== "merchant_confirmed") {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_SOURCE_FORBIDDEN",
      "Only merchant-side uploads or explicit merchant confirmations can enter merchant_media_*.",
    );
  }
}

export function assertMerchantMediaRepositoryReadyClip(input: {
  merchantId: string;
  assetId: string;
  clip: PrivateMediaClipRecord;
}) {
  assertMerchantId(input.merchantId);
  normalizePrivateMediaClipStorageAliases(input.clip);
  if (input.clip.merchantId !== input.merchantId) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_TENANT_MISMATCH",
      "Ready clip merchant_id must match repository merchant_id.",
    );
  }
  if (input.clip.assetId && input.clip.assetId !== input.assetId) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_ASSET_MISMATCH",
      "Ready clip asset_id must match repository asset_id.",
    );
  }
  if (input.clip.status !== "ready") {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_NOT_READY",
      "Only ready clips can be inserted into the ready clip repository.",
    );
  }
  if (input.clip.clipIndex == null || !Number.isInteger(input.clip.clipIndex) || input.clip.clipIndex < 0) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_INDEX_INVALID",
      "Ready clips must use a non-negative integer clip_index.",
    );
  }
  if (
    input.clip.mediaType === "video" &&
    input.clip.clipType !== "full_video" &&
    input.clip.clipType !== "segment"
  ) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_TYPE_INVALID",
      "Video clips must use clip_type = full_video or segment.",
    );
  }
  if (input.clip.mediaType === "image" && input.clip.clipType !== "image") {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_CLIP_TYPE_INVALID",
      "V1 image clips must use clip_type = image.",
    );
  }
}

export function normalizeMerchantMediaAssetStorageAliases(
  asset: MerchantMediaAssetRecord,
): MerchantMediaAssetRecord {
  const sourceStorageKey = resolveStorageKeyAlias({
    legacyName: "sourceCosKey",
    aliasName: "sourceStorageKey",
    legacyValue: asset.sourceCosKey,
    aliasValue: asset.sourceStorageKey,
    conflictCode: "MERCHANT_MEDIA_SOURCE_KEY_CONFLICT",
    required: true,
  });

  return {
    ...asset,
    sourceCosKey: sourceStorageKey,
    sourceStorageKey,
  };
}

export function normalizePrivateMediaClipStorageAliases(
  clip: PrivateMediaClipRecord,
): PrivateMediaClipRecord {
  const storageKey = resolveStorageKeyAlias({
    legacyName: "cosKey",
    aliasName: "storageKey",
    legacyValue: clip.cosKey,
    aliasValue: clip.storageKey,
    conflictCode: "MERCHANT_MEDIA_CLIP_KEY_CONFLICT",
    required: true,
  });
  const thumbStorageKey = resolveStorageKeyAlias({
    legacyName: "thumbCosKey",
    aliasName: "thumbStorageKey",
    legacyValue: clip.thumbCosKey,
    aliasValue: clip.thumbStorageKey,
    conflictCode: "MERCHANT_MEDIA_THUMB_KEY_CONFLICT",
    required: false,
  });

  return {
    ...clip,
    cosKey: storageKey,
    storageKey,
    thumbCosKey: thumbStorageKey,
    thumbStorageKey,
  };
}

function resolveStorageKeyAlias(input: {
  legacyName: string;
  aliasName: string;
  legacyValue?: string | null;
  aliasValue?: string | null;
  conflictCode: string;
  required: true;
}): string;
function resolveStorageKeyAlias(input: {
  legacyName: string;
  aliasName: string;
  legacyValue?: string | null;
  aliasValue?: string | null;
  conflictCode: string;
  required: false;
}): string | null;
function resolveStorageKeyAlias(input: {
  legacyName: string;
  aliasName: string;
  legacyValue?: string | null;
  aliasValue?: string | null;
  conflictCode: string;
  required: boolean;
}) {
  const legacyValue = input.legacyValue?.trim() ?? "";
  const aliasValue = input.aliasValue?.trim() ?? "";

  if (legacyValue && aliasValue && legacyValue !== aliasValue) {
    throw new MerchantMediaRepositoryContractError(
      input.conflictCode,
      `${input.aliasName} must match ${input.legacyName} when both are provided.`,
    );
  }

  const value = aliasValue || legacyValue;
  if (!value && input.required !== false) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_STORAGE_KEY_REQUIRED",
      `${input.aliasName} or ${input.legacyName} is required.`,
    );
  }

  return value || null;
}

function assertMerchantId(merchantId: string) {
  if (!merchantId.trim()) {
    throw new MerchantMediaRepositoryContractError(
      "MERCHANT_MEDIA_MERCHANT_ID_REQUIRED",
      "merchant_id is required for every merchant media repository operation.",
    );
  }
}

export class MerchantMediaRepositoryContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
