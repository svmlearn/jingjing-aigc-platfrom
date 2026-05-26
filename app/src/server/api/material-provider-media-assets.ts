import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type { MediaAssetDto, MediaAssetType } from "@/contracts/media";
import type { MaterialLibraryItemDto } from "@/contracts/material";
import {
  createAssetObject,
  listAssetObjectsByOwner,
} from "@/lib/db/media-repository";
import type { MaterialProviderLibraryItemInput } from "@/lib/db/material-library-repository";
import { getConfiguredObjectStorageProvider } from "@/server/storage";

type SocialMaterialMediaAssetType = Extract<MediaAssetType, "image" | "video" | "cover">;

export type SocialMaterialMediaCandidate = {
  assetType: SocialMaterialMediaAssetType;
  url: string;
  sortOrder: number;
};

type PersistedSocialMaterialMediaAsset = {
  materialId: string;
  sourceItemId: string;
  url: string;
  asset?: MediaAssetDto;
  skippedReason?: string;
};

const maxImageAssetsPerMaterial = 18;
const maxVideoAssetsPerMaterial = 1;
const socialViralAssetFolder = "social-viral";

export async function persistMaterialProviderMediaAssets(input: {
  merchantId: string;
  materials: MaterialLibraryItemDto[];
  providerItems: MaterialProviderLibraryItemInput[];
}): Promise<PersistedSocialMaterialMediaAsset[]> {
  let storage: ReturnType<typeof getConfiguredObjectStorageProvider>;
  let bucketName: string;
  let maxBytes: number;

  try {
    storage = getConfiguredObjectStorageProvider();
    const config = storage.getConfig();
    bucketName = config.bucket;
    maxBytes = config.mediaUploadMaxBytes;
  } catch (error) {
    const skippedReason = getErrorMessage(error);
    return input.materials.flatMap((material, index) =>
      buildSocialMaterialMediaCandidates(input.providerItems[index]).map((candidate) => ({
        materialId: material.id,
        sourceItemId: material.sourceItemId ?? material.id,
        url: candidate.url,
        skippedReason,
      })),
    );
  }

  const persisted: PersistedSocialMaterialMediaAsset[] = [];

  for (const [index, material] of input.materials.entries()) {
    const sourceItemId = material.sourceItemId ?? material.id;
    if (!sourceItemId) {
      continue;
    }

    const candidates = buildSocialMaterialMediaCandidates(input.providerItems[index]);
    if (candidates.length === 0) {
      continue;
    }

    const existingAssets = await listAssetObjectsByOwner({
      ownerType: "source_item",
      ownerId: sourceItemId,
    }).catch(() => []);
    const existingOriginUrls = new Set(
      existingAssets.map((asset) => asset.originUrl).filter((url): url is string => Boolean(url)),
    );

    for (const candidate of candidates) {
      if (existingOriginUrls.has(candidate.url)) {
        persisted.push({
          materialId: material.id,
          sourceItemId,
          url: candidate.url,
          skippedReason: "already_persisted",
        });
        continue;
      }

      try {
        const downloaded = await downloadRemoteMedia(candidate.url, maxBytes);
        const storageKey = buildSocialMaterialMediaStorageKey({
          merchantId: input.merchantId,
          sourceItemId,
          candidate,
          contentType: downloaded.contentType,
        });
        const upload = await storage.putObject({
          key: storageKey,
          body: downloaded.body,
          contentType: downloaded.contentType,
        });
        const asset = await createAssetObject({
          ownerType: "source_item",
          ownerId: sourceItemId,
          assetType: candidate.assetType,
          storageProvider: upload.provider,
          bucketName: upload.bucketName ?? bucketName,
          storageKey: upload.storageKey,
          originUrl: candidate.url,
          mimeType: downloaded.contentType,
          fileSizeBytes: downloaded.body.byteLength,
          etag: upload.etag ?? null,
          sortOrder: candidate.sortOrder,
        });

        persisted.push({
          materialId: material.id,
          sourceItemId,
          url: candidate.url,
          asset,
        });
      } catch (error) {
        persisted.push({
          materialId: material.id,
          sourceItemId,
          url: candidate.url,
          skippedReason: getErrorMessage(error),
        });
      }
    }
  }

  return persisted;
}

export function buildSocialMaterialMediaCandidates(
  providerItem: MaterialProviderLibraryItemInput | undefined,
): SocialMaterialMediaCandidate[] {
  if (!providerItem || providerItem.sourceKind !== "benchmark") {
    return [];
  }

  const structureSummary = toRecord(providerItem.structureSummary);
  const coverUrl = firstUrl(structureSummary.coverUrl);
  const imageUrls = readUrlArray(structureSummary.imageUrls);
  const videoUrls = readUrlArray(structureSummary.videoUrls).filter(looksLikeVideoUrl);
  const candidates: Array<Omit<SocialMaterialMediaCandidate, "sortOrder">> = [];

  if (providerItem.materialType === "video") {
    if (coverUrl) {
      candidates.push({ assetType: "cover", url: coverUrl });
    }

    candidates.push(
      ...videoUrls
        .slice(0, maxVideoAssetsPerMaterial)
        .map((url) => ({ assetType: "video" as const, url })),
    );
  } else {
    const images = imageUrls.length > 0 ? imageUrls : compactUrls([coverUrl]);
    candidates.push(
      ...images
        .slice(0, maxImageAssetsPerMaterial)
        .map((url) => ({ assetType: "image" as const, url })),
    );
  }

  return dedupeCandidates(candidates).map((candidate, index) => ({
    ...candidate,
    sortOrder: index,
  }));
}

export function buildSocialMaterialMediaStorageKey(input: {
  merchantId: string;
  sourceItemId: string;
  candidate: SocialMaterialMediaCandidate;
  contentType?: string | null;
}) {
  const digest = createHash("sha256").update(input.candidate.url).digest("hex").slice(0, 16);
  const extension = inferMediaExtension({
    url: input.candidate.url,
    assetType: input.candidate.assetType,
    contentType: input.contentType,
  });

  return [
    "source-assets",
    input.merchantId,
    input.sourceItemId,
    socialViralAssetFolder,
    `${input.candidate.assetType}-${input.candidate.sortOrder}-${digest}.${extension}`,
  ].join("/");
}

function dedupeCandidates(
  candidates: Array<Omit<SocialMaterialMediaCandidate, "sortOrder">>,
) {
  const seen = new Set<string>();
  const result: Array<Omit<SocialMaterialMediaCandidate, "sortOrder">> = [];

  for (const candidate of candidates) {
    const key = `${candidate.assetType}:${candidate.url}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

async function downloadRemoteMedia(url: string, maxBytes: number) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8",
      referer: inferReferer(url),
    },
  });

  if (!response.ok) {
    throw new Error(`REMOTE_MEDIA_FETCH_FAILED:${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("REMOTE_MEDIA_TOO_LARGE");
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error("REMOTE_MEDIA_TOO_LARGE");
  }

  return {
    body,
    contentType: normalizeContentType(response.headers.get("content-type")),
  };
}

function inferReferer(url: string) {
  if (/xiaohongshu|xhscdn|xhs/i.test(url)) {
    return "https://www.xiaohongshu.com/";
  }

  return "https://www.douyin.com/";
}

function normalizeContentType(value: string | null) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();
  return contentType || "application/octet-stream";
}

function inferMediaExtension(input: {
  url: string;
  assetType: SocialMaterialMediaAssetType;
  contentType?: string | null;
}) {
  const contentType = input.contentType?.toLowerCase() ?? "";

  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";

  const pathname = safeUrlPathname(input.url);
  const extension = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension && ["mp4", "mov", "webm", "jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  return input.assetType === "video" ? "mp4" : "jpg";
}

function looksLikeVideoUrl(url: string) {
  return /\.mp4(?:[?#]|$)|video|douyin|byte|stream\//i.test(url);
}

function readUrlArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return compactUrls(value);
}

function compactUrls(values: unknown[]) {
  return Array.from(
    new Set(
      values.filter((value): value is string =>
        typeof value === "string" && /^https?:\/\//i.test(value.trim()),
      ).map((url) => url.trim()),
    ),
  );
}

function firstUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : null;
}

function safeUrlPathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
