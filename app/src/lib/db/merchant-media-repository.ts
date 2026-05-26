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
  created_at: string | Date;
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
  created_at: string | Date;
};

type LegacyMaterialClipRow = {
  id: string;
  merchant_id: string;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  structure_summary: unknown;
  engagement_snapshot: unknown;
  trace_payload: unknown;
  created_at: string | Date;
  asset_object_id: string;
  asset_type: "image" | "video" | "cover" | "subtitle";
  storage_provider: string | null;
  bucket_name: string | null;
  storage_key: string;
  mime_type: string | null;
  file_size_bytes?: number | null;
  sort_order?: number | null;
  asset_created_at: string | Date;
};

const legacyMaterialClipIdPrefix = "source-item-asset-";

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

      const readyClips = result.rows.map(mapMerchantMediaClip);
      const legacyClips = await listLegacyMaterialClipsByMerchantFromPostgres(input);
      return dedupePrivateMediaClips([...legacyClips, ...readyClips]);
    } catch (error) {
      throw mapPostgresError(error, "MERCHANT_MEDIA_CLIP_LIST_FAILED");
    }
  }

  async getClipById(input: { clipId: string }) {
    try {
      const legacyAssetObjectId = legacyMaterialAssetObjectIdFromClipId(input.clipId);
      if (legacyAssetObjectId) {
        const legacyRows = await listLegacyMaterialClipsByAssetObjectIdFromPostgres({
          assetObjectId: legacyAssetObjectId,
        });
        return legacyRows[0] ?? null;
      }

      const result = await queryAppDb<MerchantMediaClipRow>(
        `
        select ${merchantMediaClipSelect}
        from public.merchant_media_clips
        where id = $1
        limit 1
        `,
        [input.clipId],
      );

      const readyClip = result.rows[0] ? mapMerchantMediaClip(result.rows[0]) : null;
      if (readyClip) {
        return readyClip;
      }

      const legacyRows = await listLegacyMaterialClipsByAssetObjectIdFromPostgres({
        assetObjectId: input.clipId,
      });
      return legacyRows[0] ?? null;
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
    createdAt: toIsoString(row.created_at),
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
    createdAt: toIsoString(row.created_at),
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

async function listLegacyMaterialClipsByMerchantFromPostgres(input: {
  merchantId: string;
}) {
  const result = await queryAppDb<LegacyMaterialClipRow>(
    `
    select
      si.id,
      si.merchant_id,
      si.title,
      si.body_text,
      si.script_text,
      si.structure_summary,
      si.engagement_snapshot,
      si.trace_payload,
      si.created_at,
      ao.id as asset_object_id,
      ao.asset_type,
      ao.storage_provider,
      ao.bucket_name,
      ao.storage_key,
      ao.mime_type,
      ao.file_size_bytes,
      ao.sort_order,
      ao.created_at as asset_created_at
    from public.source_items si
    join public.asset_objects ao
      on ao.owner_type = 'source_item'
     and ao.owner_id = si.id
     and ao.asset_type = 'video'
    where si.merchant_id = $1
      and si.trace_payload @> '{"materialLibrary": true}'::jsonb
      and si.trace_payload #>> '{materialAnalysis,materialCategory}' = 'project_media_asset'
      and si.trace_payload #>> '{materialAnalysis,assetType}' = 'video'
      and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
      and ao.storage_provider = 'aliyun_oss'
      and ao.bucket_name is not null
      and ao.storage_key is not null
    order by si.created_at desc, ao.sort_order asc, ao.created_at asc
    limit 160
    `,
    [input.merchantId],
  );

  return result.rows
    .map(mapLegacyMaterialClip)
    .filter((clip): clip is PrivateMediaClipRecord => Boolean(clip));
}

async function listLegacyMaterialClipsByAssetObjectIdFromPostgres(input: {
  assetObjectId: string;
}) {
  const result = await queryAppDb<LegacyMaterialClipRow>(
    `
    select
      si.id,
      si.merchant_id,
      si.title,
      si.body_text,
      si.script_text,
      si.structure_summary,
      si.engagement_snapshot,
      si.trace_payload,
      si.created_at,
      ao.id as asset_object_id,
      ao.asset_type,
      ao.storage_provider,
      ao.bucket_name,
      ao.storage_key,
      ao.mime_type,
      ao.file_size_bytes,
      ao.sort_order,
      ao.created_at as asset_created_at
    from public.asset_objects ao
    join public.source_items si
      on ao.owner_type = 'source_item'
     and ao.owner_id = si.id
    where ao.id = $1
      and ao.asset_type = 'video'
      and si.trace_payload @> '{"materialLibrary": true}'::jsonb
      and si.trace_payload #>> '{materialAnalysis,materialCategory}' = 'project_media_asset'
      and si.trace_payload #>> '{materialAnalysis,assetType}' = 'video'
      and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
      and ao.storage_provider = 'aliyun_oss'
      and ao.bucket_name is not null
      and ao.storage_key is not null
    limit 1
    `,
    [input.assetObjectId],
  );

  return result.rows
    .map(mapLegacyMaterialClip)
    .filter((clip): clip is PrivateMediaClipRecord => Boolean(clip));
}

function mapLegacyMaterialClip(row: LegacyMaterialClipRow): PrivateMediaClipRecord | null {
  const bucketName = stringValue(row.bucket_name);
  const storageKey = stringValue(row.storage_key);
  if (!bucketName || !storageKey || row.asset_type !== "video") {
    return null;
  }

  const structureSummary = toRecord(row.structure_summary);
  const engagementSnapshot = toRecord(row.engagement_snapshot);
  const tracePayload = toRecord(row.trace_payload);
  const traceMaterialAnalysis = toRecord(tracePayload.materialAnalysis);
  const materialAnalysis =
    Object.keys(traceMaterialAnalysis).length > 0
      ? traceMaterialAnalysis
      : toRecord(structureSummary.materialAnalysis);
  const width = firstPositiveNumber(
    materialAnalysis.width,
    structureSummary.width,
    tracePayload.width,
  );
  const height = firstPositiveNumber(
    materialAnalysis.height,
    structureSummary.height,
    tracePayload.height,
  );
  const orientation = inferOrientation({
    width,
    height,
    raw: firstString(
      materialAnalysis.orientation,
      structureSummary.orientation,
      tracePayload.orientation,
    ),
  });
  const dimensions = dimensionsForOrientation({ width, height, orientation });
  const durationSeconds =
    firstPositiveNumber(
      materialAnalysis.durationSeconds,
      materialAnalysis.duration_seconds,
      structureSummary.durationSeconds,
      structureSummary.duration_seconds,
      tracePayload.durationSeconds,
      tracePayload.duration_seconds,
    ) ?? 8;
  const tags = uniqueStrings([
    ...toStringArray(materialAnalysis.tags),
    ...toStringArray(materialAnalysis.sceneTags),
    ...toStringArray(materialAnalysis.industryTags),
    ...toStringArray(materialAnalysis.shotTags),
    ...toStringArray(structureSummary.tags),
    ...toStringArray(tracePayload.tags),
  ]);

  return {
    id: legacyMaterialClipId(row.asset_object_id),
    assetId: row.asset_object_id,
    merchantId: row.merchant_id,
    mediaType: "video",
    status: "ready",
    clipIndex: Number(row.sort_order ?? 0),
    clipType: "full_video",
    startTimeSeconds: null,
    endTimeSeconds: null,
    width: dimensions.width,
    height: dimensions.height,
    durationSeconds,
    orientation,
    description: uniqueStrings([
      firstString(row.title),
      firstString(row.script_text),
      firstString(row.body_text),
      JSON.stringify(structureSummary),
      JSON.stringify(engagementSnapshot),
      JSON.stringify(tracePayload),
    ]).join(" "),
    tags,
    industryTags: toStringArray(materialAnalysis.industryTags),
    sceneTags: toStringArray(materialAnalysis.sceneTags),
    shotTags: toStringArray(materialAnalysis.shotTags),
    peopleTags: toStringArray(materialAnalysis.peopleTags),
    qualityTags: toStringArray(materialAnalysis.qualityTags),
    tagConfidence:
      firstPositiveNumber(materialAnalysis.tagConfidence, materialAnalysis.tag_confidence) ?? null,
    tagSource: firstString(materialAnalysis.tagSource, materialAnalysis.tag_source) ?? "source_items",
    bucketName,
    storageKey,
    thumbStorageKey: null,
    mimeType: firstString(row.mime_type) ?? "video/mp4",
    createdAt: toIsoString(row.asset_created_at),
  };
}

function legacyMaterialClipId(assetObjectId: string) {
  return `${legacyMaterialClipIdPrefix}${assetObjectId}`;
}

function legacyMaterialAssetObjectIdFromClipId(clipId: string) {
  const value = String(clipId || "").trim();
  return value.startsWith(legacyMaterialClipIdPrefix)
    ? value.slice(legacyMaterialClipIdPrefix.length)
    : null;
}

function dedupePrivateMediaClips(clips: PrivateMediaClipRecord[]) {
  const seen = new Set<string>();
  const result: PrivateMediaClipRecord[] = [];
  for (const clip of clips) {
    const key = [clip.bucketName, clip.storageKey, clip.mediaType].join("\n");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(clip);
  }
  return result;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function inferOrientation(input: {
  width: number | null;
  height: number | null;
  raw?: string | null;
}): PrivateMediaClipRecord["orientation"] {
  const raw = input.raw?.toLowerCase();
  if (raw === "landscape" || raw === "portrait") {
    return raw;
  }
  if (input.width && input.height && input.width > input.height) {
    return "landscape";
  }
  return "portrait";
}

function dimensionsForOrientation(input: {
  width: number | null;
  height: number | null;
  orientation: PrivateMediaClipRecord["orientation"];
}) {
  if (input.width && input.height) {
    return {
      width: Math.round(input.width),
      height: Math.round(input.height),
    };
  }
  return input.orientation === "landscape"
    ? { width: 1920, height: 1080 }
    : { width: 1080, height: 1920 };
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  );
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
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
