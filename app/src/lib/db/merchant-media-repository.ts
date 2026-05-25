import "server-only";

import type { MerchantMediaAssetRecord } from "@/lib/merchant-media-library-contract";
import {
  assertMerchantMediaRepositoryAsset,
  assertMerchantMediaRepositoryReadyClip,
  type MerchantMediaRepository,
} from "@/lib/merchant-media-repository-contract";
import type { PrivateMediaClipRecord } from "@/lib/private-media-pexels-adapter";
import type { PrivateMediaClipRepository } from "@/lib/private-media-fixture-repository";
import {
  type DatabaseClient,
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

type MerchantMediaAssetRow = {
  id: string;
  merchant_id: string;
  uploaded_by_user_id: string;
  media_type: "image" | "video";
  source: "merchant_upload" | "merchant_confirmed";
  source_storage_key: string;
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
  storage_key: string;
  thumb_storage_key: string | null;
  mime_type: string;
  created_at: string;
};

export function getMerchantMediaRepository(): MerchantMediaRepository {
  return new PostgresMerchantMediaRepository();
}

export function getPrivateMediaRepository(): PrivateMediaClipRepository {
  return new PostgresMerchantMediaPrivateClipRepository();
}

export class PostgresMerchantMediaRepository implements MerchantMediaRepository {
  async upsertAsset(input: {
    asset: MerchantMediaAssetRecord;
    idempotencyKey: string;
  }) {
    const asset = input.asset;
    assertMerchantMediaRepositoryAsset(asset);

    try {
      const result = await queryAppDb<MerchantMediaAssetRow>(
        `
        insert into public.merchant_media_assets (
          id,
          merchant_id,
          uploaded_by_user_id,
          media_type,
          source,
          source_storage_key,
          status,
          idempotency_key
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (merchant_id, idempotency_key)
        do update set uploaded_by_user_id = excluded.uploaded_by_user_id,
                      media_type = excluded.media_type,
                      source = excluded.source,
                      source_storage_key = excluded.source_storage_key,
                      status = excluded.status
        returning ${merchantMediaAssetSelect}
        `,
        [
          asset.id,
          asset.merchantId,
          asset.uploadedByUserId,
          asset.mediaType,
          asset.source,
          asset.sourceStorageKey,
          asset.status,
          input.idempotencyKey,
        ],
      );

      return mapMerchantMediaAsset(result.rows[0]);
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_ASSET_UPSERT_FAILED");
    }
  }

  async upsertReadyClip(input: {
    merchantId: string;
    assetId: string;
    clip: PrivateMediaClipRecord;
  }) {
    const clip = input.clip;
    const normalizedInput = {
      ...input,
      clip,
    };

    assertMerchantMediaRepositoryReadyClip(normalizedInput);

    try {
      return await withAppDbTransaction(async (client) => {
        await assertMerchantMediaAssetExists(client, {
          merchantId: normalizedInput.merchantId,
          assetId: normalizedInput.assetId,
        });

        const result = await client.query<MerchantMediaClipRow>(
          `
          insert into public.merchant_media_clips (
            id,
            asset_id,
            merchant_id,
            media_type,
            status,
            clip_index,
            clip_type,
            start_time_seconds,
            end_time_seconds,
            width,
            height,
            duration_seconds,
            orientation,
            description,
            tags,
            industry_tags,
            scene_tags,
            shot_tags,
            people_tags,
            quality_tags,
            tag_confidence,
            tag_source,
            bucket_name,
            storage_key,
            thumb_storage_key,
            mime_type
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21, $22, $23, $24, $25, $26)
          on conflict (asset_id, clip_index)
          do update set media_type = excluded.media_type,
                        status = excluded.status,
                        clip_type = excluded.clip_type,
                        start_time_seconds = excluded.start_time_seconds,
                        end_time_seconds = excluded.end_time_seconds,
                        width = excluded.width,
                        height = excluded.height,
                        duration_seconds = excluded.duration_seconds,
                        orientation = excluded.orientation,
                        description = excluded.description,
                        tags = excluded.tags,
                        industry_tags = excluded.industry_tags,
                        scene_tags = excluded.scene_tags,
                        shot_tags = excluded.shot_tags,
                        people_tags = excluded.people_tags,
                        quality_tags = excluded.quality_tags,
                        tag_confidence = excluded.tag_confidence,
                        tag_source = excluded.tag_source,
                        bucket_name = excluded.bucket_name,
                        storage_key = excluded.storage_key,
                        thumb_storage_key = excluded.thumb_storage_key,
                        mime_type = excluded.mime_type
          returning ${merchantMediaClipSelect}
          `,
          [
            clip.id,
            normalizedInput.assetId,
            normalizedInput.merchantId,
            clip.mediaType,
            clip.status,
            clip.clipIndex ?? 0,
            clip.clipType ?? (clip.mediaType === "video" ? "full_video" : "image"),
            clip.startTimeSeconds ?? null,
            clip.endTimeSeconds ?? null,
            clip.width,
            clip.height,
            clip.durationSeconds ?? null,
            clip.orientation,
            clip.description,
            JSON.stringify(clip.tags),
            JSON.stringify(clip.industryTags ?? []),
            JSON.stringify(clip.sceneTags ?? []),
            JSON.stringify(clip.shotTags ?? []),
            JSON.stringify(clip.peopleTags ?? []),
            JSON.stringify(clip.qualityTags ?? []),
            clip.tagConfidence ?? null,
            clip.tagSource ?? "manual",
            clip.bucketName,
            clip.storageKey,
            clip.thumbStorageKey ?? null,
            clip.mimeType,
          ],
        );

        return mapMerchantMediaClip(result.rows[0]);
      });
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_CLIP_UPSERT_FAILED");
    }
  }

  async listAssetsByMerchant(input: { merchantId: string }) {
    try {
      const result = await queryAppDb<MerchantMediaAssetRow>(
        `
        select ${merchantMediaAssetSelect}
        from public.merchant_media_assets
        where merchant_id = $1
        order by created_at desc
        `,
        [input.merchantId],
      );

      return result.rows.map(mapMerchantMediaAsset);
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_ASSET_LIST_FAILED");
    }
  }

  async listReadyClipsByMerchant(input: { merchantId: string }) {
    const repository = new PostgresMerchantMediaPrivateClipRepository();
    return repository.listClipsByMerchant(input);
  }

  async getReadyClipByMerchant(input: {
    merchantId: string;
    clipId: string;
  }) {
    try {
      const result = await queryAppDb<MerchantMediaClipRow>(
        `
        select ${merchantMediaClipSelect}
        from public.merchant_media_clips
        where id = $1
          and merchant_id = $2
          and status = 'ready'
        limit 1
        `,
        [input.clipId, input.merchantId],
      );

      return result.rows[0] ? mapMerchantMediaClip(result.rows[0]) : null;
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_CLIP_LOOKUP_FAILED");
    }
  }
}

export class PostgresMerchantMediaPrivateClipRepository implements PrivateMediaClipRepository {
  async listClipsByMerchant(input: { merchantId: string }) {
    try {
      const result = await queryAppDb<MerchantMediaClipRow>(
        `
        select ${merchantMediaClipSelect}
        from public.merchant_media_clips
        where merchant_id = $1
          and status = 'ready'
        order by created_at desc
        `,
        [input.merchantId],
      );

      return result.rows.map(mapMerchantMediaClip);
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_CLIP_LIST_FAILED");
    }
  }

  async getClipById(input: { clipId: string }) {
    try {
      const result = await queryAppDb<MerchantMediaClipRow>(
        `
        select ${merchantMediaClipSelect}
        from public.merchant_media_clips
        where id = $1
        limit 1
        `,
        [input.clipId],
      );

      return result.rows[0] ? mapMerchantMediaClip(result.rows[0]) : null;
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_CLIP_LOOKUP_FAILED");
    }
  }
}

async function assertMerchantMediaAssetExists(
  client: DatabaseClient,
  input: {
    merchantId: string;
    assetId: string;
  },
) {
  const result = await client.query<{ id: string }>(
    `
    select id
    from public.merchant_media_assets
    where id = $1
      and merchant_id = $2
    limit 1
    `,
    [input.assetId, input.merchantId],
  );

  if (!result.rows[0]) {
    throw new ApiError(
      404,
      "MERCHANT_MEDIA_ASSET_NOT_FOUND",
      "Ready clip asset must exist in the same merchant.",
    );
  }
}

function mapMerchantMediaAsset(row: MerchantMediaAssetRow): MerchantMediaAssetRecord {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    uploadedByUserId: row.uploaded_by_user_id,
    mediaType: row.media_type,
    source: row.source,
    sourceStorageKey: row.source_storage_key,
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
    startTimeSeconds: toNullableNumber(row.start_time_seconds),
    endTimeSeconds: toNullableNumber(row.end_time_seconds),
    width: row.width,
    height: row.height,
    durationSeconds: toNullableNumber(row.duration_seconds),
    orientation: row.orientation,
    description: row.description,
    tags: toStringArray(row.tags),
    industryTags: toStringArray(row.industry_tags),
    sceneTags: toStringArray(row.scene_tags),
    shotTags: toStringArray(row.shot_tags),
    peopleTags: toStringArray(row.people_tags),
    qualityTags: toStringArray(row.quality_tags),
    tagConfidence: toNullableNumber(row.tag_confidence),
    tagSource: row.tag_source,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    thumbStorageKey: row.thumb_storage_key,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
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
  "source_storage_key",
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
  "storage_key",
  "thumb_storage_key",
  "mime_type",
  "created_at",
].join(", ");
