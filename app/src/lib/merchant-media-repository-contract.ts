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
    assertMerchantMediaRepositoryAsset(input.asset);
    const existingId = this.assetsByIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.assetsById.get(existingId);
      if (existing) {
        return existing;
      }
    }

    this.assetsById.set(input.asset.id, input.asset);
    this.assetsByIdempotencyKey.set(input.idempotencyKey, input.asset.id);

    return input.asset;
  }

  async upsertReadyClip(input: {
    merchantId: string;
    assetId: string;
    clip: PrivateMediaClipRecord;
  }) {
    if (input.clip.merchantId !== input.merchantId) {
      throw new MerchantMediaRepositoryContractError(
        "MERCHANT_MEDIA_CLIP_TENANT_MISMATCH",
        "Ready clip merchant_id must match repository merchant_id.",
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
      ...input.clip,
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
