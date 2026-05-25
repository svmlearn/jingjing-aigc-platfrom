import "server-only";

import { randomUUID } from "node:crypto";

import OSS from "ali-oss";

import { ApiError } from "@/server/api/errors";
import {
  assertObjectRefMatchesPrefix,
  buildBrowserUploadIntentStorageKeys,
  buildStandardKnowledgeUploadKey,
  buildStandardMediaUploadKeyPrefix,
  defaultMediaUploadMaxBytes,
  defaultReadUrlTtlSeconds,
  defaultStsDurationSeconds,
  parsePositiveInt,
  sanitizeFileName,
  type ObjectStorageConfig,
  type ObjectStorageProvider,
} from "@/server/storage/object-storage";

export type AliyunOssConfig = ObjectStorageConfig & {
  provider: "aliyun_oss";
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  stsRoleArn?: string | null;
};

const requiredAliyunOssEnv = [
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_ENDPOINT",
] as const;

export function getMissingAliyunOssEnv() {
  return requiredAliyunOssEnv.filter((name) => !process.env[name]?.trim());
}

export function getAliyunOssConfig(): AliyunOssConfig {
  const missing = getMissingAliyunOssEnv();

  if (missing.length > 0) {
    throw new ApiError(
      503,
      "OSS_NOT_CONFIGURED",
      "Aliyun OSS environment variables are not configured.",
      { missing },
    );
  }

  return {
    provider: "aliyun_oss",
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim() ?? "",
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim() ?? "",
    bucket: process.env.ALIYUN_OSS_BUCKET?.trim() ?? "",
    region: process.env.ALIYUN_OSS_REGION?.trim() ?? "",
    endpoint: normalizeEndpoint(process.env.ALIYUN_OSS_ENDPOINT?.trim() ?? ""),
    stsRoleArn: process.env.ALIYUN_OSS_STS_ROLE_ARN?.trim() || null,
    stsDurationSeconds: parsePositiveInt(
      process.env.ALIYUN_OSS_STS_DURATION_SECONDS,
      defaultStsDurationSeconds,
      "ALIYUN_OSS_STS_DURATION_SECONDS",
      "OSS_ENV_INVALID",
    ),
    readUrlTtlSeconds: parsePositiveInt(
      process.env.ALIYUN_OSS_READ_URL_TTL_SECONDS,
      defaultReadUrlTtlSeconds,
      "ALIYUN_OSS_READ_URL_TTL_SECONDS",
      "OSS_ENV_INVALID",
    ),
    mediaUploadMaxBytes: parsePositiveInt(
      process.env.MEDIA_UPLOAD_MAX_BYTES,
      defaultMediaUploadMaxBytes,
      "MEDIA_UPLOAD_MAX_BYTES",
      "OSS_ENV_INVALID",
    ),
  };
}

export const aliyunOssProvider: ObjectStorageProvider = {
  provider: "aliyun_oss",

  getConfig() {
    return getAliyunOssConfig();
  },

  assertUploadSizeWithinLimit(sizeBytes) {
    const { mediaUploadMaxBytes } = getAliyunOssConfig();

    if (sizeBytes > mediaUploadMaxBytes) {
      throw new ApiError(
        413,
        "MEDIA_UPLOAD_TOO_LARGE",
        `Media upload exceeds the ${mediaUploadMaxBytes} byte limit.`,
      );
    }
  },

  buildMediaUploadKey(input) {
    const prefix = this.getMediaUploadKeyPrefix(input);
    return `${prefix}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
  },

  getMediaUploadKeyPrefix(input) {
    return buildStandardMediaUploadKeyPrefix(input);
  },

  buildKnowledgeUploadKey(input) {
    return buildStandardKnowledgeUploadKey(input);
  },

  async issueBrowserUploadIntent(input) {
    const config = getAliyunOssConfig();
    const expiresAt = new Date(Date.now() + config.stsDurationSeconds * 1000);
    const contentType = input.contentType?.trim() || "application/octet-stream";
    const client = createAliyunOssClient(config);
    const uploadUrl = client.signatureUrl(input.storageKey, {
      expires: config.stsDurationSeconds,
      method: "PUT",
      "Content-Type": contentType,
    });

    return {
      provider: "aliyun_oss",
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
      ...buildBrowserUploadIntentStorageKeys(input.storageKey),
      uploadUrl: ensureHttpsUrl(uploadUrl),
      uploadMethod: "PUT",
      uploadHeaders: {
        "Content-Type": contentType,
      },
      expiredTime: Math.floor(expiresAt.getTime() / 1000),
      expiresAt: expiresAt.toISOString(),
      credentials: {
        provider: "aliyun_oss",
        method: "signed_put_url",
        expiresAt: expiresAt.toISOString(),
      },
    };
  },

  async putObject(input) {
    const config = getAliyunOssConfig();
    const client = createAliyunOssClient(config);
    const result = await client.put(input.key, input.body, {
      mime: input.contentType ?? undefined,
    });

    return {
      provider: "aliyun_oss",
      bucketName: config.bucket,
      storageKey: input.key,
      etag: readHeader(result.res.headers, "etag"),
    };
  },

  createSignedReadUrl(input) {
    const config = getAliyunOssConfig();
    const client = createAliyunOssClient(config);
    const response: Record<string, string> = {};

    if (input.responseContentDisposition) {
      response["content-disposition"] = input.responseContentDisposition;
    }

    // OSS rejects signed GET URLs that try to override response content-type.
    // Preserve the object's stored Content-Type and only override disposition.

    const signedUrl = client.signatureUrl(input.storageKey, {
      expires: input.expiresInSeconds ?? config.readUrlTtlSeconds,
      method: "GET",
      ...(Object.keys(response).length > 0 ? { response } : {}),
    });

    return ensureHttpsUrl(signedUrl);
  },

  assertWritableObjectRef(input) {
    const config = getAliyunOssConfig();
    const expectedPrefix = this.getMediaUploadKeyPrefix(input);

    return assertObjectRefMatchesPrefix({
      providerLabel: "Aliyun OSS",
      configuredBucket: config.bucket,
      bucketName: input.bucketName,
      storageKey: input.storageKey,
      expectedPrefix,
    });
  },
};

function createAliyunOssClient(config: AliyunOssConfig) {
  return new OSS({
    region: config.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: config.endpoint,
    secure: true,
  });
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/^https?:\/\//i, "");
}

function ensureHttpsUrl(url: string) {
  return url.replace(/^http:\/\//i, "https://");
}

function readHeader(headers: object, name: string) {
  const normalizedName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === normalizedName && typeof value === "string") {
      return value;
    }
  }

  return null;
}
