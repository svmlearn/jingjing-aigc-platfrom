import "server-only";

import { randomUUID } from "node:crypto";

import { ApiError } from "@/server/api/errors";
import {
  assertObjectRefMatchesPrefix,
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
  stsRoleArn: string;
};

const requiredAliyunOssEnv = [
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_ENDPOINT",
  "ALIYUN_OSS_STS_ROLE_ARN",
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
    endpoint: process.env.ALIYUN_OSS_ENDPOINT?.trim() ?? "",
    stsRoleArn: process.env.ALIYUN_OSS_STS_ROLE_ARN?.trim() ?? "",
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

  async issueBrowserUploadIntent() {
    getAliyunOssConfig();
    throw new ApiError(
      501,
      "ALIYUN_OSS_BROWSER_UPLOAD_PENDING",
      "Aliyun OSS browser upload intent is pending SDK wiring in a later storage batch.",
    );
  },

  async putObject() {
    getAliyunOssConfig();
    throw new ApiError(
      501,
      "ALIYUN_OSS_SERVER_UPLOAD_PENDING",
      "Aliyun OSS server-side object upload is pending SDK wiring in a later storage batch.",
    );
  },

  createSignedReadUrl() {
    getAliyunOssConfig();
    throw new ApiError(
      501,
      "ALIYUN_OSS_SIGNED_URL_PENDING",
      "Aliyun OSS signed read URL is pending SDK wiring in a later storage batch.",
    );
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
