import "server-only";

import type { MerchantMediaAssetRecord } from "@/lib/merchant-media-library-contract";
import type { MerchantMediaRepository } from "@/lib/merchant-media-repository-contract";
import type { PrivateMediaClipRecord } from "@/lib/private-media-pexels-adapter";
import type { PrivateMediaClipRepository } from "@/lib/private-media-fixture-repository";
import { cloudSupabaseRequiredError } from "@/lib/db/cloud-supabase-required";
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  mapPostgresError,
  queryAppDb,
} from "@/lib/server-db/postgres";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type SupabaseTable = ReturnType<typeof createSupabaseAdminClient> extends {
  from: (table: infer Table) => unknown;
}
  ? Table
  : string;

const merchantMediaAssetsTable = "merchant_media_assets" as SupabaseTable;
const merchantMediaClipsTable = "merchant_media_clips" as SupabaseTable;
const sourceItemsTable = "source_items" as SupabaseTable;
const assetObjectsTable = "asset_objects" as SupabaseTable;
const legacyMaterialClipIdPrefix = "source-item-asset-";

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

type LegacyMaterialSourceItemRow = {
  id: string;
  merchant_id: string;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  structure_summary: unknown;
  engagement_snapshot: unknown;
  trace_payload: unknown;
  created_at: string | Date;
};

type LegacyMaterialAssetObjectRow = {
  id: string;
  owner_id: string;
  asset_type: "image" | "video" | "cover" | "subtitle";
  storage_provider: string | null;
  bucket_name: string | null;
  storage_key: string;
  mime_type: string | null;
  file_size_bytes?: number | null;
  sort_order?: number | null;
  created_at: string | Date;
};

type LegacyMaterialClipRow = LegacyMaterialSourceItemRow & {
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

export function getMerchantMediaRepository(): MerchantMediaRepository {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  return new SupabaseMerchantMediaRepository();
}

export function getPrivateMediaRepository(): PrivateMediaClipRepository {
  if (isAppPostgresPreferred() && isAppPostgresConfigured()) {
    return new SupabaseMerchantMediaPrivateClipRepository();
  }
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  return new SupabaseMerchantMediaPrivateClipRepository();
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
    const legacyClips = await this.listLegacyMaterialClipsByMerchant(input);
    if (isAppPostgresPreferred() && isAppPostgresConfigured()) {
      return dedupePrivateMediaClips(legacyClips);
    }
    const readyClips = await this.listReadyMerchantMediaClipsByMerchant(input);

    return dedupePrivateMediaClips([...legacyClips, ...readyClips]);
  }

  async getClipById(input: { clipId: string }) {
    const legacyAssetObjectId = legacyMaterialAssetObjectIdFromClipId(input.clipId);
    if (legacyAssetObjectId) {
      return this.getLegacyMaterialClipByAssetObjectId({ assetObjectId: legacyAssetObjectId });
    }

    if (isAppPostgresPreferred() && isAppPostgresConfigured()) {
      return this.getLegacyMaterialClipByAssetObjectId({ assetObjectId: input.clipId });
    }

    const clip = await this.getReadyMerchantMediaClipById(input);
    return clip ?? this.getLegacyMaterialClipByAssetObjectId({ assetObjectId: input.clipId });
  }

  private async listReadyMerchantMediaClipsByMerchant(input: { merchantId: string }) {
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

  private async getReadyMerchantMediaClipById(input: { clipId: string }) {
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

  private async listLegacyMaterialClipsByMerchant(input: { merchantId: string }) {
    if (isAppPostgresPreferred() && isAppPostgresConfigured()) {
      return listLegacyMaterialClipsByMerchantFromPostgres(input);
    }

    const supabase = createSupabaseAdminClient();
    const { data: itemData, error: itemError } = await supabase
      .from(sourceItemsTable)
      .select(legacyMaterialSourceItemSelect)
      .eq("merchant_id", input.merchantId)
      .contains("trace_payload", { materialLibrary: true })
      .order("created_at", { ascending: false })
      .limit(160);

    if (itemError) {
      throw new ApiError(500, "PRIVATE_MEDIA_LEGACY_SOURCE_ITEM_LIST_FAILED", itemError.message);
    }

    const itemRows = ((itemData ?? []) as unknown as LegacyMaterialSourceItemRow[])
      .filter(isReadyLegacyMaterialSourceItem);
    const itemById = new Map(itemRows.map((row) => [row.id, row]));
    const itemIds = Array.from(itemById.keys());
    if (itemIds.length === 0) {
      return [];
    }

    const { data: assetData, error: assetError } = await supabase
      .from(assetObjectsTable)
      .select(legacyMaterialAssetObjectSelect)
      .eq("owner_type", "source_item")
      .eq("asset_type", "video")
      .in("owner_id", itemIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (assetError) {
      throw new ApiError(500, "PRIVATE_MEDIA_LEGACY_ASSET_OBJECT_LIST_FAILED", assetError.message);
    }

    return ((assetData ?? []) as unknown as LegacyMaterialAssetObjectRow[])
      .map((assetRow) => {
        const itemRow = itemById.get(assetRow.owner_id);
        return itemRow ? mapLegacyMaterialClip({ ...itemRow, ...assetRow, asset_object_id: assetRow.id, asset_created_at: assetRow.created_at }) : null;
      })
      .filter((clip): clip is PrivateMediaClipRecord => Boolean(clip));
  }

  private async getLegacyMaterialClipByAssetObjectId(input: { assetObjectId: string }) {
    if (isAppPostgresPreferred() && isAppPostgresConfigured()) {
      const rows = await listLegacyMaterialClipsByAssetObjectIdFromPostgres(input);
      return rows[0] ?? null;
    }

    const supabase = createSupabaseAdminClient();
    const { data: assetData, error: assetError } = await supabase
      .from(assetObjectsTable)
      .select(legacyMaterialAssetObjectSelect)
      .eq("id", input.assetObjectId)
      .eq("owner_type", "source_item")
      .eq("asset_type", "video")
      .maybeSingle();

    if (assetError) {
      throw new ApiError(500, "PRIVATE_MEDIA_LEGACY_ASSET_OBJECT_LOOKUP_FAILED", assetError.message);
    }

    const assetRow = assetData as unknown as LegacyMaterialAssetObjectRow | null;
    if (!assetRow) {
      return null;
    }

    const { data: itemData, error: itemError } = await supabase
      .from(sourceItemsTable)
      .select(legacyMaterialSourceItemSelect)
      .eq("id", assetRow.owner_id)
      .contains("trace_payload", { materialLibrary: true })
      .maybeSingle();

    if (itemError) {
      throw new ApiError(500, "PRIVATE_MEDIA_LEGACY_SOURCE_ITEM_LOOKUP_FAILED", itemError.message);
    }

    const itemRow = itemData as unknown as LegacyMaterialSourceItemRow | null;
    if (!itemRow || !isReadyLegacyMaterialSourceItem(itemRow)) {
      return null;
    }

    return mapLegacyMaterialClip({
      ...itemRow,
      ...assetRow,
      asset_object_id: assetRow.id,
      asset_created_at: assetRow.created_at,
    });
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

async function listLegacyMaterialClipsByMerchantFromPostgres(input: {
  merchantId: string;
}) {
  try {
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
        and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
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
  } catch (error) {
    throw mapPostgresError(error, "PRIVATE_MEDIA_LEGACY_MATERIAL_LIST_FAILED");
  }
}

async function listLegacyMaterialClipsByAssetObjectIdFromPostgres(input: {
  assetObjectId: string;
}) {
  try {
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
        and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
        and ao.bucket_name is not null
        and ao.storage_key is not null
      limit 1
      `,
      [input.assetObjectId],
    );

    return result.rows
      .map(mapLegacyMaterialClip)
      .filter((clip): clip is PrivateMediaClipRecord => Boolean(clip));
  } catch (error) {
    throw mapPostgresError(error, "PRIVATE_MEDIA_LEGACY_MATERIAL_LOOKUP_FAILED");
  }
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
  const materialAnalysis = Object.keys(traceMaterialAnalysis).length > 0
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
  const durationSeconds = firstPositiveNumber(
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
    tagConfidence: firstPositiveNumber(materialAnalysis.tagConfidence, materialAnalysis.tag_confidence) ?? null,
    tagSource: firstString(materialAnalysis.tagSource, materialAnalysis.tag_source) ?? "source_items",
    bucketName,
    cosKey: storageKey,
    thumbCosKey: null,
    mimeType: firstString(row.mime_type) ?? "video/mp4",
    createdAt: toIsoString(row.created_at),
  };
}

function isReadyLegacyMaterialSourceItem(row: LegacyMaterialSourceItemRow) {
  const structureSummary = toRecord(row.structure_summary);
  const status = firstString(structureSummary.materialStatus);
  return !status || status === "ready";
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
    const key = [
      clip.bucketName,
      clip.cosKey,
      clip.mediaType,
    ].join("\n");
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
    ? value as Record<string, unknown>
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
  "source_cos_key",
  "status",
  "created_at",
].join(", ");

const legacyMaterialSourceItemSelect = [
  "id",
  "merchant_id",
  "title",
  "body_text",
  "script_text",
  "structure_summary",
  "engagement_snapshot",
  "trace_payload",
  "created_at",
].join(", ");

const legacyMaterialAssetObjectSelect = [
  "id",
  "owner_id",
  "asset_type",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "mime_type",
  "file_size_bytes",
  "sort_order",
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
