import "server-only";

import { randomUUID } from "node:crypto";

import type {
  MediaAssetDto,
  MediaAssetType,
  MediaOwnerType,
  MediaStorageProvider,
} from "@/contracts/media";
import type { ContentVariantDto } from "@/contracts/draft";
import { getLocalDemoMediaOwnerContext } from "@/lib/db/content-draft-repository";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type AssetObjectRow = {
  id: string;
  owner_type: MediaOwnerType;
  owner_id: string;
  asset_type: MediaAssetType;
  storage_provider: MediaStorageProvider;
  bucket_name: string | null;
  storage_key: string;
  origin_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  etag: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

type SourceItemOwnerRow = {
  id: string;
  merchant_id: string;
};

type ContentDraftOwnerRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string | null;
};

type ContentVariantOwnerRow = {
  id: string;
  draft_id: string;
  variant_type: ContentVariantDto["variantType"];
};

export type MediaOwnerContext = {
  ownerType: MediaOwnerType;
  ownerId: string;
  merchantId: string;
  createdByUserId?: string | null;
  draftId?: string;
  variantType?: ContentVariantDto["variantType"];
};

type LocalDemoMediaStore = {
  assetObjects: Map<string, MediaAssetDto>;
};

const globalDemoMediaStore = globalThis as typeof globalThis & {
  __jingjingLocalDemoMediaStore?: LocalDemoMediaStore;
};

const demoMediaStore =
  globalDemoMediaStore.__jingjingLocalDemoMediaStore ??
  (globalDemoMediaStore.__jingjingLocalDemoMediaStore = {
    assetObjects: new Map<string, MediaAssetDto>(),
  });
const demoAssetObjects = demoMediaStore.assetObjects;

export async function assertMediaOwnerAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaOwnerContext> {
  if (!isSupabaseAdminConfigured()) {
    const owner = getLocalDemoMediaOwnerContext(input);

    if (owner) {
      if (input.createdByUserId && owner.createdByUserId !== input.createdByUserId) {
        throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Media owner not found.");
      }
      return owner;
    }

    if (input.ownerType === "source_item") {
      return {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        merchantId: input.merchantId,
      };
    }

    throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Media owner not found.");
  }

  const supabase = createSupabaseAdminClient();

  if (input.ownerType === "source_item") {
    const { data, error } = await supabase
      .from("source_items")
      .select("id, merchant_id")
      .eq("id", input.ownerId)
      .eq("merchant_id", input.merchantId)
      .single();

    if (error || !data) {
      throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Source item not found.");
    }

    const sourceItem = data as unknown as SourceItemOwnerRow;
    return {
      ownerType: input.ownerType,
      ownerId: sourceItem.id,
      merchantId: sourceItem.merchant_id,
    };
  }

  if (input.ownerType === "content_draft") {
    let draftQuery = supabase
      .from("content_drafts")
      .select("id, merchant_id, created_by_user_id")
      .eq("id", input.ownerId)
      .eq("merchant_id", input.merchantId);

    if (input.createdByUserId) {
      draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
    }

    const { data, error } = await draftQuery.single();

    if (error || !data) {
      throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Content draft not found.");
    }

    const draft = data as unknown as ContentDraftOwnerRow;
    return {
      ownerType: input.ownerType,
      ownerId: draft.id,
      merchantId: draft.merchant_id,
      createdByUserId: draft.created_by_user_id ?? null,
      draftId: draft.id,
    };
  }

  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select("id, draft_id, variant_type")
    .eq("id", input.ownerId)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Content variant not found.");
  }

  const variant = variantData as unknown as ContentVariantOwnerRow;
  let draftQuery = supabase
    .from("content_drafts")
    .select("id, merchant_id, created_by_user_id")
    .eq("id", variant.draft_id)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery.single();

  if (draftError || !draftData) {
    throw new ApiError(404, "MEDIA_OWNER_NOT_FOUND", "Content variant is not accessible.");
  }

  const draft = draftData as unknown as ContentDraftOwnerRow;
  return {
    ownerType: input.ownerType,
    ownerId: variant.id,
    merchantId: draft.merchant_id,
    createdByUserId: draft.created_by_user_id ?? null,
    draftId: draft.id,
    variantType: variant.variant_type,
  };
}

export async function createAssetObject(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  originUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder?: number;
}): Promise<MediaAssetDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const sortOrder =
      input.sortOrder ?? getNextLocalAssetSortOrder({ ownerType: input.ownerType, ownerId: input.ownerId });
    const asset: MediaAssetDto = {
      id: randomUUID(),
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      assetType: input.assetType,
      storageProvider: input.storageProvider,
      bucketName: input.bucketName ?? null,
      storageKey: input.storageKey,
      originUrl: input.originUrl ?? null,
      mimeType: input.mimeType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      etag: input.etag ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: null,
    };

    demoAssetObjects.set(asset.id, asset);

    return asset;
  }

  const supabase = createSupabaseAdminClient();
  const sortOrder =
    input.sortOrder ?? (await getNextAssetSortOrder({ ownerType: input.ownerType, ownerId: input.ownerId }));

  const { data, error } = await supabase
    .from("asset_objects")
    .insert({
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      asset_type: input.assetType,
      storage_provider: input.storageProvider,
      bucket_name: input.bucketName ?? null,
      storage_key: input.storageKey,
      origin_url: input.originUrl ?? null,
      mime_type: input.mimeType ?? null,
      file_size_bytes: input.fileSizeBytes ?? null,
      etag: input.etag ?? null,
      sort_order: sortOrder,
    })
    .select(assetObjectSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "ASSET_OBJECT_CREATE_FAILED", error?.message ?? "Create asset failed.");
  }

  return mapAssetObject(data as unknown as AssetObjectRow);
}

export async function listAssetObjectsByOwner(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaAssetDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(demoAssetObjects.values())
      .filter((asset) => asset.ownerType === input.ownerType && asset.ownerId === input.ownerId)
      .sort((a, b) => {
        const sortDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

        if (sortDelta !== 0) {
          return sortDelta;
        }

        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("asset_objects")
    .select(assetObjectSelect)
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "ASSET_OBJECT_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AssetObjectRow[]).map(mapAssetObject);
}

async function getNextAssetSortOrder(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("asset_objects")
    .select("sort_order")
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "ASSET_OBJECT_SORT_FETCH_FAILED", error.message);
  }

  return (((data as { sort_order: number } | null)?.sort_order) ?? -1) + 1;
}

function getNextLocalAssetSortOrder(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}): number {
  const matchingAssets = Array.from(demoAssetObjects.values()).filter(
    (asset) => asset.ownerType === input.ownerType && asset.ownerId === input.ownerId,
  );

  return Math.max(-1, ...matchingAssets.map((asset) => asset.sortOrder ?? -1)) + 1;
}

function mapAssetObject(row: AssetObjectRow): MediaAssetDto {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    assetType: row.asset_type,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    originUrl: row.origin_url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    etag: row.etag,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const assetObjectSelect = [
  "id",
  "owner_type",
  "owner_id",
  "asset_type",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "origin_url",
  "mime_type",
  "file_size_bytes",
  "etag",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");
