import "server-only";

import type {
  MaterialLibraryItemDto,
  MaterialPlatform,
  MaterialRetrievalTarget,
  MaterialType,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import {
  createMaterialLibraryItem,
  createMaterialWorkbenchReference,
  listCachedMaterialProviderItems,
  listMaterialLibraryItems,
  upsertMaterialLibraryItemsFromProvider,
} from "@/lib/db/material-library-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";
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
  return listMaterialLibraryItems({
    merchantId: merchant.id,
    limit: input.limit,
    retrievalTarget: input.retrievalTarget,
    query: input.query,
  });
}

export async function createUploadedMaterialForUser(input: {
  userId: string;
  platform: MaterialPlatform;
  url: string;
}): Promise<MaterialLibraryItemDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const materialType = inferMaterialType(input.platform, input.url);
  const compactedUrl = compactUrl(input.url);
  const platformLabel = platformLabels[input.platform];

  return createMaterialLibraryItem({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    platform: input.platform,
    materialType,
    sourceKind: "uploaded",
    usageType: "viral_reference",
    title: `${platformLabel} 上传素材 · ${compactedUrl}`,
    description: [
      `已保存素材链接：${input.url}`,
      "",
      "当前已完成入库与基础识别。后续素材解析 worker 接入后，会补全标题、正文、脚本、评论洞察、封面结构和可复用拆解。",
    ].join("\n"),
    originalUrl: input.url,
    engagementLabel: "待分析",
    analysisPayload: {
      parser: "pending_provider_integration",
      originalUrl: input.url,
      inferredMaterialType: materialType,
      materialUsageType: "viral_reference",
      retrievalTargets: ["copy_context", "script_context"],
      merchantName: merchant.name,
    },
  });
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
  findMethod: "keyword" | "profile";
  keyword?: string;
  profileUrl?: string;
  count?: number;
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
    count: input.count,
  });
}

export async function createBenchmarkMaterialsForMerchant(input: {
  merchantId: string;
  createdByUserId: string;
  merchantName?: string | null;
  platform: MaterialPlatform;
  findMethod: "keyword" | "profile";
  keyword?: string;
  profileUrl?: string;
  count?: number;
}): Promise<MaterialLibraryItemDto[]> {
  const platformLabel = platformLabels[input.platform];
  const count = Math.min(Math.max(input.count ?? 5, 1), 20);
  const searchTarget =
    input.findMethod === "keyword" ? input.keyword?.trim() ?? "" : input.profileUrl?.trim() ?? "";

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
    return upsertMaterialLibraryItemsFromProvider({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      items: cachedItems.slice(0, count),
    });
  }

  if (isTikHubConfigured()) {
    const result = await fetchTikHubBenchmarkMaterials({
      platform: input.platform,
      findMethod: input.findMethod,
      target: searchTarget,
      count,
    });

    if (result.items.length === 0) {
      throw new ApiError(
        502,
        "TIKHUB_EMPTY_MATERIAL_RESULT",
        `${platformLabel} 对标检索没有返回可用素材，请换一个关键词或主页链接。`,
      );
    }

    return upsertMaterialLibraryItemsFromProvider({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      items: result.items.map((item) => ({
        ...item,
        tracePayload: {
          ...item.tracePayload,
          tikhubProviderResponses: result.providerResponses.map((response) => ({
            endpoint: response.endpoint,
            method: response.method,
            requestPayload: response.requestPayload,
          })),
        },
      })),
    });
  }

  const createdItems: MaterialLibraryItemDto[] = [];

  for (let index = 0; index < count; index += 1) {
    const materialType: MaterialType = input.platform === "douyin" || index % 2 === 1 ? "video" : "article";
    const rank = index + 1;
    const title =
      input.findMethod === "keyword"
        ? `${searchTarget} · ${platformLabel} 高互动对标 ${rank}`
        : `${platformLabel} 博主主页高赞素材 ${rank}`;

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
            : `TikHub API key 尚未配置，暂未真实解析该博主主页。配置 TIKHUB_API_KEY 后，会优先保存近期互动表现更好的内容。`,
        originalUrl: input.findMethod === "profile" ? input.profileUrl ?? null : null,
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

  return createdItems;
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

function inferMaterialType(platform: MaterialPlatform, url: string): MaterialType {
  const normalizedUrl = url.toLowerCase();

  if (platform === "douyin" || normalizedUrl.includes("video") || normalizedUrl.includes("douyin")) {
    return "video";
  }

  return "article";
}

function compactUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").slice(0, 44);
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
