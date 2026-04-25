import "server-only";

import type {
  MaterialLibraryItemDto,
  MaterialPlatform,
  MaterialType,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import {
  createMaterialLibraryItem,
  createMaterialWorkbenchReference,
  listMaterialLibraryItems,
} from "@/lib/db/material-library-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

const platformLabels: Record<MaterialPlatform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
};

export async function listMaterialLibraryForUser(input: {
  userId: string;
  limit?: number;
}): Promise<MaterialLibraryItemDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return listMaterialLibraryItems({
    merchantId: merchant.id,
    limit: input.limit,
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
  const platformLabel = platformLabels[input.platform];
  const count = Math.min(Math.max(input.count ?? 5, 1), 20);
  const searchTarget =
    input.findMethod === "keyword" ? input.keyword?.trim() ?? "" : input.profileUrl?.trim() ?? "";

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
        merchantId: merchant.id,
        createdByUserId: input.userId,
        platform: input.platform,
        materialType,
        sourceKind: "benchmark",
        title,
        description:
          input.findMethod === "keyword"
            ? `已按「${searchTarget}」生成对标素材样本。真实对标检索 provider 接入后，这里会替换成平台返回的原始标题、链接、互动数据和拆解结果。`
            : `已按博主主页生成对标素材样本。真实对标检索 provider 接入后，会优先保存近期互动表现更好的内容。`,
        originalUrl: input.findMethod === "profile" ? input.profileUrl ?? null : null,
        creatorName: input.findMethod === "profile" ? "待解析博主" : null,
        engagementLabel: rank === 1 ? "Top 1" : `Top ${rank}`,
        analysisPayload: {
          provider: "pending_benchmark_provider_integration",
          findMethod: input.findMethod,
          searchTarget,
          rank,
          merchantName: merchant.name,
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
