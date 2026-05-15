import "server-only";

import type { MerchantMediaAssetRecord } from "@/lib/merchant-media-library-contract";
import type { MerchantMediaRepository } from "@/lib/merchant-media-repository-contract";
import { InMemoryMerchantMediaRepository } from "@/lib/merchant-media-repository-contract";
import type { PrivateMediaClipRecord } from "@/lib/private-media-pexels-adapter";
import type { PrivateMediaClipRepository } from "@/lib/private-media-fixture-repository";
import {
  getDefaultPrivateMediaClipRepository,
} from "@/lib/private-media-fixture-repository";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type SupabaseTable = ReturnType<typeof createSupabaseAdminClient> extends {
  from: (table: infer Table) => unknown;
}
  ? Table
  : string;

const merchantMediaAssetsTable = "merchant_media_assets" as SupabaseTable;
const merchantMediaClipsTable = "merchant_media_clips" as SupabaseTable;

type MerchantMediaAssetRow = {
  id: string;
  merchant_id: string;
  uploaded_by_user_id: string;
  media_type: "image" | "video";
  source: "merchant_upload" | "merchant_confirmed";
  source_cos_key: string;
  status: MerchantMediaAssetRecord["status"];
  created_at: string;
};

type MerchantMediaClipRow = {
  id: string;
  asset_id: string;
  merchant_id: string;
  media_type: "image" | "video";
  status: PrivateMediaClipRecord["status"];
  clip_index: number;
  clip_type: PrivateMediaClipRecord["clipType"];
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  width: number;
  height: number;
  duration_seconds: number | null;
  orientation: "portrait" | "landscape";
  description: string;
  tags: unknown;
  industry_tags: unknown;
  scene_tags: unknown;
  shot_tags: unknown;
  people_tags: unknown;
  quality_tags: unknown;
  tag_confidence: number | null;
  tag_source: string | null;
  bucket_name: string;
  cos_key: string;
  thumb_cos_key: string | null;
  mime_type: string;
  created_at: string;
};

const localRepository = new InMemoryMerchantMediaRepository();

export function getMerchantMediaRepository(): MerchantMediaRepository {
  return isSupabaseAdminConfigured()
    ? new SupabaseMerchantMediaRepository()
    : localRepository;
}

export function getPrivateMediaRepository(): PrivateMediaClipRepository {
  return isSupabaseAdminConfigured()
    ? new SupabaseMerchantMediaPrivateClipRepository()
    : getDefaultPrivateMediaClipRepository();
}

export class SupabaseMerchantMediaRepository implements MerchantMediaRepository {
  async upsertAsset(input: {
    asset: MerchantMediaAssetRecord;
    idempotencyKey: string;
  }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(merchantMediaAssetsTable)
      .upsert(
        {
          id: input.asset.id,
          merchant_id: input.asset.merchantId,
          uploaded_by_user_id: input.asset.uploadedByUserId,
          media_type: input.asset.mediaType,
          source: input.asset.source,
          source_cos_key: input.asset.sourceCosKey,
          status: input.asset.status,
          idempotency_key: input.idempotencyKey,
        },
        { onConflict: "merchant_id,idempotency_key" },
      )
      .select(merchantMediaAssetSelect)
      .single();

    if (error || !data) {
      throw new ApiError(
        500,
        "MERCHANT_MEDIA_ASSET_UPSERT_FAILED",
        error?.message ?? "Failed to upsert merchant media asset.",
      );
    }

    return mapMerchantMediaAsset(data as unknown as MerchantMediaAssetRow);
  }

  async upsertReadyClip(input: {
    merchantId: string;
    assetId: string;
    clip: PrivateMediaClipRecord;
  }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(merchantMediaClipsTable)
      .upsert(
        {
          id: input.clip.id,
          asset_id: input.assetId,
          merchant_id: input.merchantId,
          media_type: input.clip.mediaType,
          status: input.clip.status,
          clip_index: input.clip.clipIndex ?? 0,
          clip_type: input.clip.clipType ?? (input.clip.mediaType === "video" ? "full_video" : "image"),
          start_time_seconds: input.clip.startTimeSeconds ?? null,
          end_time_seconds: input.clip.endTimeSeconds ?? null,
          width: input.clip.width,
          height: input.clip.height,
          duration_seconds: input.clip.durationSeconds ?? null,
          orientation: input.clip.orientation,
          description: input.clip.description,
          tags: input.clip.tags,
          industry_tags: input.clip.industryTags ?? [],
          scene_tags: input.clip.sceneTags ?? [],
          shot_tags: input.clip.shotTags ?? [],
          people_tags: input.clip.peopleTags ?? [],
          quality_tags: input.clip.qualityTags ?? [],
          tag_confidence: input.clip.tagConfidence ?? null,
          tag_source: input.clip.tagSource ?? "manual",
          bucket_name: input.clip.bucketName,
          cos_key: input.clip.cosKey,
          thumb_cos_key: input.clip.thumbCosKey ?? null,
          mime_type: input.clip.mimeType,
        },
        { onConflict: "asset_id,clip_index" },
      )
      .select(merchantMediaClipSelect)
      .single();

    if (error || !data) {
      throw new ApiError(
        500,
        "MERCHANT_MEDIA_CLIP_UPSERT_FAILED",
        error?.message ?? "Failed to upsert merchant media clip.",
      );
    }

    return mapMerchantMediaClip(data as unknown as MerchantMediaClipRow);
  }

  async listAssetsByMerchant(input: { merchantId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(merchantMediaAssetsTable)
      .select(merchantMediaAssetSelect)
      .eq("merchant_id", input.merchantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ApiError(500, "MERCHANT_MEDIA_ASSET_LIST_FAILED", error.message);
    }

    return ((data ?? []) as unknown as MerchantMediaAssetRow[]).map(mapMerchantMediaAsset);
  }

  async listReadyClipsByMerchant(input: { merchantId: string }) {
    const repository = new SupabaseMerchantMediaPrivateClipRepository();
    return repository.listClipsByMerchant(input);
  }

  async getReadyClipByMerchant(input: {
    merchantId: string;
    clipId: string;
  }) {
    const repository = new SupabaseMerchantMediaPrivateClipRepository();
    const clip = await repository.getClipById({ clipId: input.clipId });

    return clip?.merchantId === input.merchantId && clip.status === "ready" ? clip : null;
  }
}

export class SupabaseMerchantMediaPrivateClipRepository implements PrivateMediaClipRepository {
  async listClipsByMerchant(input: { merchantId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(merchantMediaClipsTable)
      .select(merchantMediaClipSelect)
      .eq("merchant_id", input.merchantId)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    if (error) {
      throw new ApiError(500, "MERCHANT_MEDIA_CLIP_LIST_FAILED", error.message);
    }

    return ((data ?? []) as unknown as MerchantMediaClipRow[]).map(mapMerchantMediaClip);
  }

  async getClipById(input: { clipId: string }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(merchantMediaClipsTable)
      .select(merchantMediaClipSelect)
      .eq("id", input.clipId)
      .maybeSingle();

    if (error) {
      throw new ApiError(500, "MERCHANT_MEDIA_CLIP_LOOKUP_FAILED", error.message);
    }

    return data ? mapMerchantMediaClip(data as unknown as MerchantMediaClipRow) : null;
  }
}

function mapMerchantMediaAsset(row: MerchantMediaAssetRow): MerchantMediaAssetRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    uploadedByUserId: row.uploaded_by_user_id,
    mediaType: row.media_type,
    source: row.source,
    sourceCosKey: row.source_cos_key,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapMerchantMediaClip(row: MerchantMediaClipRow): PrivateMediaClipRecord {
  return {
    id: row.id,
    assetId: row.asset_id,
    merchantId: row.merchant_id,
    mediaType: row.media_type,
    status: row.status,
    clipIndex: row.clip_index,
    clipType: row.clip_type,
    startTimeSeconds: row.start_time_seconds,
    endTimeSeconds: row.end_time_seconds,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    orientation: row.orientation,
    description: row.description,
    tags: toStringArray(row.tags),
    industryTags: toStringArray(row.industry_tags),
    sceneTags: toStringArray(row.scene_tags),
    shotTags: toStringArray(row.shot_tags),
    peopleTags: toStringArray(row.people_tags),
    qualityTags: toStringArray(row.quality_tags),
    tagConfidence: row.tag_confidence,
    tagSource: row.tag_source,
    bucketName: row.bucket_name,
    cosKey: row.cos_key,
    thumbCosKey: row.thumb_cos_key,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

const merchantMediaAssetSelect = [
  "id",
  "merchant_id",
  "uploaded_by_user_id",
  "media_type",
  "source",
  "source_cos_key",
  "status",
  "created_at",
].join(", ");

const merchantMediaClipSelect = [
  "id",
  "asset_id",
  "merchant_id",
  "media_type",
  "status",
  "clip_index",
  "clip_type",
  "start_time_seconds",
  "end_time_seconds",
  "width",
  "height",
  "duration_seconds",
  "orientation",
  "description",
  "tags",
  "industry_tags",
  "scene_tags",
  "shot_tags",
  "people_tags",
  "quality_tags",
  "tag_confidence",
  "tag_source",
  "bucket_name",
  "cos_key",
  "thumb_cos_key",
  "mime_type",
  "created_at",
].join(", ");
