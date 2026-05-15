import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { createCosSignedPreviewUrl, getCosConfig } from "@/server/api/cos";
import { ApiError, handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await getAuthenticatedUser();
    const url = new URL(request.url);
    const rawPath = url.searchParams.get("path")?.trim() ?? "";

    if (!rawPath) {
      throw new ApiError(400, "COS_PREVIEW_PATH_REQUIRED", "图片路径不能为空。");
    }

    if (/^https?:\/\//i.test(rawPath)) {
      return Response.redirect(rawPath, 302);
    }

    const signedUrl = createCosSignedPreviewUrl(parseDifyCosPath(rawPath));
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    return handleApiError(error);
  }
}

function parseDifyCosPath(rawPath: string): { storageKey: string; bucketName?: string | null } {
  const value = rawPath.replace(/^cos:\/\//i, "").replace(/^\/+/, "");

  if (!value) {
    throw new ApiError(400, "COS_PREVIEW_PATH_INVALID", "图片路径无效。");
  }

  const segments = value.split("/").filter(Boolean);

  if (rawPath.startsWith("cos://") && segments.length > 1) {
    const [bucketOrPrefix, ...rest] = segments;
    const defaultBucket = safeGetDefaultBucket();

    if (bucketOrPrefix && defaultBucket && bucketOrPrefix === defaultBucket) {
      return { bucketName: bucketOrPrefix, storageKey: rest.join("/") };
    }
  }

  return { storageKey: value };
}

function safeGetDefaultBucket() {
  try {
    return getCosConfig().bucket;
  } catch {
    return null;
  }
}
