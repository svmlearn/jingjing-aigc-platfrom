import "server-only";

import { randomUUID } from "node:crypto";

import COS from "cos-nodejs-sdk-v5";
import * as STS from "qcloud-cos-sts";

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

export type TencentCosConfig = ObjectStorageConfig & {
  provider: "tencent_cos";
  secretId: string;
  secretKey: string;
};

export function getTencentCosConfig(): TencentCosConfig {
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;

  if (!secretId || !secretKey || !bucket || !region) {
    throw new ApiError(
      503,
      "COS_NOT_CONFIGURED",
      "Tencent COS environment variables are not configured.",
    );
  }

  return {
    provider: "tencent_cos",
    secretId,
    secretKey,
    bucket,
    region,
    endpoint: null,
    stsDurationSeconds: parsePositiveInt(
      process.env.COS_STS_DURATION_SECONDS,
      defaultStsDurationSeconds,
      "COS_STS_DURATION_SECONDS",
      "COS_ENV_INVALID",
    ),
    readUrlTtlSeconds: parsePositiveInt(
      process.env.COS_READ_URL_TTL_SECONDS,
      defaultReadUrlTtlSeconds,
      "COS_READ_URL_TTL_SECONDS",
      "COS_ENV_INVALID",
    ),
    mediaUploadMaxBytes: parsePositiveInt(
      process.env.MEDIA_UPLOAD_MAX_BYTES,
      defaultMediaUploadMaxBytes,
      "MEDIA_UPLOAD_MAX_BYTES",
      "COS_ENV_INVALID",
    ),
  };
}

export const tencentCosProvider: ObjectStorageProvider = {
  provider: "tencent_cos",

  getConfig() {
    return getTencentCosConfig();
  },

  assertUploadSizeWithinLimit(sizeBytes) {
    const { mediaUploadMaxBytes } = getTencentCosConfig();

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
    const config = getTencentCosConfig();
    const policy = STS.getPolicy([
      {
        action: [
          "name/cos:PutObject",
          "name/cos:PostObject",
          "name/cos:InitiateMultipartUpload",
          "name/cos:ListMultipartUploads",
          "name/cos:ListParts",
          "name/cos:UploadPart",
          "name/cos:CompleteMultipartUpload",
          "name/cos:AbortMultipartUpload",
        ],
        bucket: config.bucket,
        region: config.region,
        prefix: input.storageKey,
      },
    ]);

    const data = await STS.getCredential({
      secretId: config.secretId,
      secretKey: config.secretKey,
      durationSeconds: config.stsDurationSeconds,
      policy,
    });

    if (!data.credentials) {
      throw new ApiError(
        500,
        "COS_TEMP_CREDENTIALS_MISSING",
        "Tencent COS temporary credentials were not returned.",
      );
    }

    const credentials = {
      TmpSecretId: data.credentials.tmpSecretId,
      TmpSecretKey: data.credentials.tmpSecretKey,
      Token: data.credentials.sessionToken,
      StartTime: data.startTime,
      ExpiredTime: data.expiredTime,
      expiredTime: data.expiredTime,
    };

    return {
      provider: "tencent_cos",
      bucket: config.bucket,
      region: config.region,
      endpoint: null,
      storageKey: input.storageKey,
      uploadKey: input.storageKey,
      cosKey: input.storageKey,
      credentials: {
        provider: "tencent_cos",
        ...credentials,
      },
      ...credentials,
    };
  },

  async putObject(input) {
    const config = getTencentCosConfig();
    const client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });

    const result = await new Promise<{ etag?: string | null }>((resolve, reject) => {
      client.putObject(
        {
          Bucket: config.bucket,
          Region: config.region,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType ?? undefined,
        },
        (error, data) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({ etag: data?.ETag ?? null });
        },
      );
    });

    return {
      provider: "tencent_cos",
      bucketName: config.bucket,
      storageKey: input.key,
      etag: result.etag,
    };
  },

  createSignedReadUrl(input) {
    const config = getTencentCosConfig();
    const client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });

    return client.getObjectUrl({
      Bucket: input.bucketName ?? config.bucket,
      Region: config.region,
      Key: input.storageKey,
      Sign: true,
      Method: "GET",
      Expires: input.expiresInSeconds ?? config.readUrlTtlSeconds,
      Protocol: "https:",
    });
  },

  assertWritableObjectRef(input) {
    const config = getTencentCosConfig();
    const expectedPrefix = this.getMediaUploadKeyPrefix(input);

    return assertObjectRefMatchesPrefix({
      providerLabel: "Tencent COS",
      configuredBucket: config.bucket,
      bucketName: input.bucketName,
      storageKey: input.storageKey,
      expectedPrefix,
    });
  },
};
