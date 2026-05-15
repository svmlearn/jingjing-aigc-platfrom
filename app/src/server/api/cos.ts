import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import COS from "cos-nodejs-sdk-v5";
import * as STS from "qcloud-cos-sts";

import type { MediaStorageProvider, MediaUploadIntentDto } from "@/contracts/media";
import { ApiError } from "@/server/api/errors";

const defaultCosStsDurationSeconds = 1800;
const defaultCosReadUrlTtlSeconds = 3600;
const defaultMediaUploadMaxBytes = 1024 * 1024 * 1024;

type BrowserUploadOwnerType = "source_item" | "content_draft" | "voice_profile";

type KnowledgeUploadScope = "platform" | "merchant";

type CosConfig = {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  stsDurationSeconds: number;
  readUrlTtlSeconds: number;
  mediaUploadMaxBytes: number;
};

export function getCosConfig(): CosConfig {
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
    secretId,
    secretKey,
    bucket,
    region,
    stsDurationSeconds: parsePositiveInt(
      process.env.COS_STS_DURATION_SECONDS,
      defaultCosStsDurationSeconds,
      "COS_STS_DURATION_SECONDS",
    ),
    readUrlTtlSeconds: parsePositiveInt(
      process.env.COS_READ_URL_TTL_SECONDS,
      defaultCosReadUrlTtlSeconds,
      "COS_READ_URL_TTL_SECONDS",
    ),
    mediaUploadMaxBytes: parsePositiveInt(
      process.env.MEDIA_UPLOAD_MAX_BYTES,
      defaultMediaUploadMaxBytes,
      "MEDIA_UPLOAD_MAX_BYTES",
    ),
  };
}

export function assertSupportedMediaStorageProvider(storageProvider: MediaStorageProvider) {
  if (storageProvider !== "tencent_cos") {
    throw new ApiError(
      400,
      "MEDIA_STORAGE_PROVIDER_UNSUPPORTED",
      "New media uploads must use Tencent COS.",
    );
  }
}

export function assertUploadSizeWithinLimit(sizeBytes: number) {
  const { mediaUploadMaxBytes } = getCosConfig();

  if (sizeBytes > mediaUploadMaxBytes) {
    throw new ApiError(
      413,
      "MEDIA_UPLOAD_TOO_LARGE",
      `Media upload exceeds the ${mediaUploadMaxBytes} byte limit.`,
    );
  }
}

export function buildCosUploadObjectKey(input: {
  merchantId: string;
  ownerType: BrowserUploadOwnerType;
  ownerId: string;
  fileName: string;
}): string {
  const prefix = getCosUploadKeyPrefix(input);
  return `${prefix}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
}

export function buildKnowledgeCosObjectKey(input: {
  scope: KnowledgeUploadScope;
  merchantId?: string | null;
  documentId: string;
  fileName: string;
}): string {
  const ownerSegment =
    input.scope === "merchant" ? input.merchantId ?? "unknown-merchant" : "platform";

  return `knowledge/${input.scope}/${ownerSegment}/${input.documentId}/${sanitizeFileName(
    input.fileName,
  )}`;
}

export function getCosUploadKeyPrefix(input: {
  merchantId: string;
  ownerType: BrowserUploadOwnerType;
  ownerId: string;
}): string {
  if (input.ownerType === "source_item") {
    return `source-assets/${input.merchantId}/${input.ownerId}`;
  }
  if (input.ownerType === "voice_profile") {
    return `voice-profiles/${input.merchantId}/${input.ownerId}`;
  }

  return `draft-inputs/${input.merchantId}/${input.ownerId}`;
}

export async function issueCosUploadCredentials(input: {
  cosKey: string;
}): Promise<Omit<MediaUploadIntentDto, "bucket" | "region" | "cosKey">> {
  const config = getCosConfig();
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
      prefix: input.cosKey,
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

  return {
    TmpSecretId: data.credentials.tmpSecretId,
    TmpSecretKey: data.credentials.tmpSecretKey,
    Token: data.credentials.sessionToken,
    StartTime: data.startTime,
    ExpiredTime: data.expiredTime,
    expiredTime: data.expiredTime,
  };
}

export async function putCosObject(input: {
  key: string;
  body: Buffer;
  contentType?: string | null;
}): Promise<{ bucketName: string; storageKey: string; etag?: string | null }> {
  const config = getCosConfig();
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
    bucketName: config.bucket,
    storageKey: input.key,
    etag: result.etag,
  };
}

export function createCosSignedReadUrl(input: {
  storageKey: string;
  bucketName?: string | null;
  expiresInSeconds?: number;
  responseContentDisposition?: "inline" | "attachment";
  responseContentType?: string | null;
}): string {
  const config = getCosConfig();
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
    Query: {
      ...(input.responseContentDisposition
        ? { "response-content-disposition": input.responseContentDisposition }
        : {}),
      ...(input.responseContentType ? { "response-content-type": input.responseContentType } : {}),
    },
  });
}

export const createCosSignedPreviewUrl = createCosSignedReadUrl;

function parsePositiveInt(rawValue: string | undefined, fallback: number, envName: string) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(500, "COS_ENV_INVALID", `${envName} must be a positive integer.`);
  }

  return parsed;
}

function sanitizeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "upload";
  const extensionIndex = baseName.lastIndexOf(".");
  const namePart = extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName;
  const extensionPart = extensionIndex > 0 ? baseName.slice(extensionIndex + 1) : "";
  const safeName = normalizeKeySegment(namePart, "upload");
  const safeExtension = normalizeKeySegment(extensionPart, "");

  return safeExtension ? `${safeName}.${safeExtension}` : safeName;
}

function normalizeKeySegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized || fallback;
}
