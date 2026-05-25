import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { ApiError, handleApiError } from "@/server/api/errors";
import { getObjectStorageProvider, type AppObjectStorageProviderName } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser();
    const url = new URL(request.url);
    const rawPath = url.searchParams.get("path")?.trim() ?? "";

    if (!rawPath) {
      throw new ApiError(400, "OBJECT_PREVIEW_PATH_REQUIRED", "对象预览路径不能为空。");
    }

    if (/^https?:\/\//i.test(rawPath)) {
      return Response.redirect(rawPath, 302);
    }

    const parsedPath = parseDifyStoragePath(rawPath);
    const signedUrl = getObjectStorageProvider(parsedPath.provider).createSignedReadUrl(parsedPath);
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    return handleApiError(error);
  }
}

function parseDifyStoragePath(rawPath: string): {
  provider?: AppObjectStorageProviderName;
  storageKey: string;
  bucketName?: string | null;
} {
  if (/^cos:\/\//i.test(rawPath)) {
    throw new ApiError(
      400,
      "OBJECT_PREVIEW_PROVIDER_UNSUPPORTED",
      "对象预览只支持 Aliyun OSS 路径或原始 storage key。",
    );
  }

  const provider = /^oss:\/\//i.test(rawPath) ? "aliyun_oss" : undefined;
  const value = rawPath.replace(/^oss:\/\//i, "").replace(/^\/+/, "");

  if (!value) {
    throw new ApiError(400, "OBJECT_PREVIEW_PATH_INVALID", "对象预览路径无效。");
  }

  const segments = value.split("/").filter(Boolean);

  if (provider && segments.length > 1) {
    const [bucketOrPrefix, ...rest] = segments;
    const defaultBucket = safeGetDefaultBucket(provider);

    if (
      provider === "aliyun_oss" ||
      (bucketOrPrefix && defaultBucket && bucketOrPrefix === defaultBucket)
    ) {
      return { bucketName: bucketOrPrefix, storageKey: rest.join("/") };
    }
  }

  return { provider, storageKey: value };
}

function safeGetDefaultBucket(provider: AppObjectStorageProviderName) {
  try {
    return getObjectStorageProvider(provider).getConfig().bucket;
  } catch {
    return null;
  }
}
