import "server-only";

import type {
  MaterialLibraryItemDto,
  MaterialPlatform,
  MaterialRetrievalTarget,
  MaterialType,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import type { MediaAssetDto } from "@/contracts/media";
import { listAssetObjectsByOwner } from "@/lib/db/media-repository";
import {
  createMaterialLibraryItem,
  createMaterialWorkbenchReference,
  listCachedMaterialProviderItems,
  listMaterialLibraryItems,
  upsertMaterialLibraryItemsFromProvider,
} from "@/lib/db/material-library-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";
import { persistMaterialProviderMediaAssets } from "@/server/api/material-provider-media-assets";
import { isTikHubConfigured } from "@/server/import-providers/tikhub/client";
import { fetchTikHubBenchmarkMaterials } from "@/server/import-providers/tikhub/materials";
import { buildTikHubBenchmarkCacheKey } from "@/server/import-providers/tikhub/normalizers";

const platformLabels: Record<MaterialPlatform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
};

export async function listMaterialLibraryForUser(input: {
  userId: string;
  limit?: number;
  retrievalTarget?: MaterialRetrievalTarget;
  query?: string | null;
}): Promise<MaterialLibraryItemDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const materials = await listMaterialLibraryItems({
    merchantId: merchant.id,
    limit: input.limit,
    retrievalTarget: input.retrievalTarget,
    query: input.query,
  });

  return attachMaterialMediaAssets(materials);
}

export async function createUploadedMaterialForUser(input: {
  userId: string;
  platform: MaterialPlatform;
  url: string;
}): Promise<MaterialLibraryItemDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const [material] = await createBenchmarkMaterialsForMerchant({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    merchantName: merchant.name,
    platform: input.platform,
    findMethod: "detail",
    detailUrl: input.url,
    count: 1,
  });

  if (!material) {
    throw new ApiError(502, "TIKHUB_EMPTY_MATERIAL_RESULT", "单条链接没有解析出可用内容。");
  }

  return material;
}

export async function createProjectMediaMaterialForUser(input: {
  userId: string;
  title: string;
  note?: string | null;
  assetType: "image" | "video";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<MaterialLibraryItemDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const materialType: MaterialType = input.assetType === "video" ? "video" : "article";
  const platform: MaterialPlatform = input.assetType === "video" ? "douyin" : "xiaohongshu";
  const assetLabel = input.assetType === "video" ? "项目视频素材" : "项目图片素材";
  const usageType = input.assetType === "video" ? "video_asset" : "image_asset";
  const retrievalTargets =
    input.assetType === "video" ? ["video_edit_asset"] : ["article_image_asset"];
  const note = input.note?.trim();

  return createMaterialLibraryItem({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    platform,
    materialType,
    sourceKind: "uploaded",
    usageType,
    status: input.assetType === "video" ? "parsing" : "ready",
    title: input.title,
    description: compactStrings([
      assetLabel,
      `原始文件：${input.fileName}`,
      `文件类型：${input.mimeType}`,
      `文件大小：${formatFileSize(input.sizeBytes)}`,
      note ? `素材说明：${note}` : null,
    ]).join("\n"),
    engagementLabel: assetLabel,
    analysisPayload: {
      materialCategory: "project_media_asset",
      materialUsageType: usageType,
      retrievalTargets,
      assetType: input.assetType,
      mediaProcessingStatus: input.assetType === "video" ? "pending_multimodal_index" : "indexed",
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      userNote: note ?? null,
      merchantName: merchant.name,
    },
  });
}

export async function createBenchmarkMaterialsForUser(input: {
  userId: string;
  platform: MaterialPlatform;
  findMethod: "keyword" | "profile" | "detail";
  keyword?: string;
  profileUrl?: string;
  detailUrl?: string;
  count?: number;
  fetchAll?: boolean;
}): Promise<MaterialLibraryItemDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  return createBenchmarkMaterialsForMerchant({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    merchantName: merchant.name,
    platform: input.platform,
    findMethod: input.findMethod,
    keyword: input.keyword,
    profileUrl: input.profileUrl,
    detailUrl: input.detailUrl,
    count: input.count,
    fetchAll: input.fetchAll,
  });
}

export async function createBenchmarkMaterialsForMerchant(input: {
  merchantId: string;
  createdByUserId: string;
  merchantName?: string | null;
  platform: MaterialPlatform;
  findMethod: "keyword" | "profile" | "detail";
  keyword?: string;
  profileUrl?: string;
  detailUrl?: string;
  count?: number;
  fetchAll?: boolean;
}): Promise<MaterialLibraryItemDto[]> {
  const platformLabel = platformLabels[input.platform];
  const count = getBenchmarkMaterialRequestCount({
    findMethod: input.findMethod,
    count: input.count,
    fetchAll: input.fetchAll,
  });
  const searchTarget =
    input.findMethod === "keyword"
      ? input.keyword?.trim() ?? ""
      : input.findMethod === "profile"
        ? input.profileUrl?.trim() ?? ""
        : input.detailUrl?.trim() ?? "";

  if (!searchTarget) {
    throw new ApiError(400, "MATERIAL_BENCHMARK_TARGET_REQUIRED", "Search target is required.");
  }

  const cacheKey = buildTikHubBenchmarkCacheKey({
    platform: input.platform,
    findMethod: input.findMethod,
    target: searchTarget,
  });
  const cachedItems = await listCachedMaterialProviderItems({
    platform: input.platform,
    provider: "tikhub",
    cacheKey,
    maxAgeMs: getTikHubMaterialCacheTtlMs(),
    limit: count,
  });

  if (cachedItems.length >= count) {
    const providerItems = cachedItems.slice(0, count);
    const materials = await upsertMaterialLibraryItemsFromProvider({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      items: providerItems,
    });

    await persistMaterialProviderMediaAssets({
      merchantId: input.merchantId,
      materials,
      providerItems,
    });

    return attachMaterialMediaAssets(materials);
  }

  if (isTikHubConfigured()) {
    const result = await fetchTikHubBenchmarkMaterials({
      platform: input.platform,
      findMethod: input.findMethod,
      target: searchTarget,
      count,
      fetchAll: input.fetchAll,
    });

    if (result.items.length === 0) {
      throw new ApiError(
        502,
        "TIKHUB_EMPTY_MATERIAL_RESULT",
        `${platformLabel} 对标检索没有返回可用素材，请换一个关键词或主页链接。`,
      );
    }

    const providerItems = result.items.map((item) => ({
      ...item,
      tracePayload: {
        ...item.tracePayload,
        tikhubProviderResponses: result.providerResponses.map((response) => ({
          endpoint: response.endpoint,
          method: response.method,
          requestPayload: response.requestPayload,
          responsePayload: response.responsePayload,
        })),
      },
    }));
    const materials = await upsertMaterialLibraryItemsFromProvider({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      items: providerItems,
    });

    await persistMaterialProviderMediaAssets({
      merchantId: input.merchantId,
      materials,
      providerItems,
    });

    return attachMaterialMediaAssets(materials);
  }

  const createdItems: MaterialLibraryItemDto[] = [];

  for (let index = 0; index < count; index += 1) {
    const materialType: MaterialType = input.platform === "douyin" || index % 2 === 1 ? "video" : "article";
    const rank = index + 1;
    const title =
      input.findMethod === "keyword"
        ? `${searchTarget} · ${platformLabel} 高互动对标 ${rank}`
        : input.findMethod === "profile"
          ? `${platformLabel} 博主主页高赞素材 ${rank}`
          : `${platformLabel} 单条链接待解析素材`;

    createdItems.push(
      await createMaterialLibraryItem({
        merchantId: input.merchantId,
        createdByUserId: input.createdByUserId,
        platform: input.platform,
        materialType,
        sourceKind: "benchmark",
        usageType: "viral_reference",
        title,
        description:
          input.findMethod === "keyword"
            ? `TikHub API key 尚未配置，暂未真实检索「${searchTarget}」。配置 TIKHUB_API_KEY 后，这里会保存平台返回的标题、链接、互动数据和拆解结果。`
            : input.findMethod === "profile"
              ? `TikHub API key 尚未配置，暂未真实解析该博主主页。配置 TIKHUB_API_KEY 后，会优先保存近期互动表现更好的内容。`
              : `TikHub API key 尚未配置，暂未真实解析该单条链接。配置 TIKHUB_API_KEY 后，会保存正文、互动数据和评论。`,
        originalUrl:
          input.findMethod === "profile"
            ? input.profileUrl ?? null
            : input.findMethod === "detail"
              ? input.detailUrl ?? null
              : null,
        creatorName: input.findMethod === "profile" ? "待解析博主" : null,
        engagementLabel: "TikHub 未配置",
        status: "failed",
        analysisPayload: {
          provider: "tikhub",
          providerStatus: "not_configured",
          materialUsageType: "viral_reference",
          retrievalTargets: ["copy_context", "script_context"],
          findMethod: input.findMethod,
          searchTarget,
          rank,
          merchantName: input.merchantName,
          cacheKey,
        },
      }),
    );
  }

  return attachMaterialMediaAssets(createdItems);
}

export async function sendMaterialToWorkbenchForUser(input: {
  userId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return createMaterialWorkbenchReference({
    merchantId: merchant.id,
    materialItemId: input.materialItemId,
    targetWorkbench: input.targetWorkbench,
    createdByUserId: input.userId,
  });
}

async function attachMaterialMediaAssets(
  materials: MaterialLibraryItemDto[],
): Promise<MaterialLibraryItemDto[]> {
  const sourceItemIds = Array.from(
    new Set(materials.map((material) => material.sourceItemId).filter(isNonEmptyString)),
  );

  if (sourceItemIds.length === 0) {
    return materials;
  }

  const assetEntries = await mapWithConcurrency(sourceItemIds, 8, async (sourceItemId) => {
    try {
      const assets = await listAssetObjectsByOwner({
        ownerType: "source_item",
        ownerId: sourceItemId,
      });

      return [sourceItemId, assets.map(withMaterialMediaPreviewUrls)] as const;
    } catch (error) {
      console.warn("Material media assets attach failed", {
        sourceItemId,
        error: error instanceof Error ? error.message : error,
      });
      return [sourceItemId, [] as MediaAssetDto[]] as const;
    }
  });
  const assetsBySourceItemId = new Map(assetEntries);

  return materials.map((material) => ({
    ...material,
    mediaAssets: material.sourceItemId
      ? assetsBySourceItemId.get(material.sourceItemId) ?? []
      : [],
  }));
}

function withMaterialMediaPreviewUrls(asset: MediaAssetDto): MediaAssetDto {
  const previewUrl = buildMaterialAssetPreviewUrl(asset);

  return {
    ...asset,
    signedPreviewUrl: previewUrl,
    signedDownloadUrl: previewUrl,
  };
}

function buildMaterialAssetPreviewUrl(asset: MediaAssetDto) {
  if (asset.storageProvider === "aliyun_oss" && asset.storageKey) {
    const storagePath = asset.bucketName
      ? `oss://${asset.bucketName}/${asset.storageKey}`
      : asset.storageKey;

    return `/api/media/object-preview?path=${encodeURIComponent(storagePath)}`;
  }

  return asset.signedPreviewUrl ?? asset.originUrl ?? null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!);
      }
    }),
  );

  return results;
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getTikHubMaterialCacheTtlMs() {
  const hours = Number(process.env.TIKHUB_MATERIAL_CACHE_TTL_HOURS ?? 72);
  const boundedHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 1), 24 * 30) : 72;

  return boundedHours * 60 * 60 * 1000;
}

function getBenchmarkMaterialRequestCount(input: {
  findMethod: "keyword" | "profile" | "detail";
  count?: number;
  fetchAll?: boolean;
}) {
  if (input.findMethod === "profile" && input.fetchAll) {
    return getProfileFetchAllLimit();
  }

  const max = input.findMethod === "detail" ? 1 : 50;
  return Math.min(Math.max(Math.trunc(input.count ?? 5), 1), max);
}

function getProfileFetchAllLimit() {
  const count = Number(process.env.TIKHUB_PROFILE_IMPORT_ALL_MAX_ITEMS ?? 200);
  return Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 50), 500) : 200;
}
