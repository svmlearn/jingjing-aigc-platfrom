import "server-only";

import type { Buffer } from "node:buffer";

import type { MediaStorageProvider, MediaUploadIntentDto } from "@/contracts/media";
import { ApiError } from "@/server/api/errors";

export type AppObjectStorageProviderName = Extract<
  MediaStorageProvider,
  "tencent_cos" | "aliyun_oss"
>;

export type BrowserUploadOwnerType = "source_item" | "content_draft";

export type KnowledgeUploadScope = "platform" | "merchant";

export type ObjectStorageConfig = {
  provider: AppObjectStorageProviderName;
  bucket: string;
  region: string;
  endpoint?: string | null;
  stsDurationSeconds: number;
  readUrlTtlSeconds: number;
  mediaUploadMaxBytes: number;
};

export type ServerPutObjectResult = {
  provider: AppObjectStorageProviderName;
  bucketName: string;
  storageKey: string;
  etag?: string | null;
};

export type ObjectStorageProvider = {
  provider: AppObjectStorageProviderName;
  getConfig(): ObjectStorageConfig;
  assertUploadSizeWithinLimit(sizeBytes: number): void;
  buildMediaUploadKey(input: {
    merchantId: string;
    ownerType: BrowserUploadOwnerType;
    ownerId: string;
    fileName: string;
  }): string;
  getMediaUploadKeyPrefix(input: {
    merchantId: string;
    ownerType: BrowserUploadOwnerType;
    ownerId: string;
  }): string;
  buildKnowledgeUploadKey(input: {
    scope: KnowledgeUploadScope;
    merchantId?: string | null;
    documentId: string;
    fileName: string;
  }): string;
  issueBrowserUploadIntent(input: {
    storageKey: string;
    contentType?: string | null;
  }): Promise<MediaUploadIntentDto>;
  putObject(input: {
    key: string;
    body: Buffer;
    contentType?: string | null;
  }): Promise<ServerPutObjectResult>;
  createSignedReadUrl(input: {
    storageKey: string;
    bucketName?: string | null;
    expiresInSeconds?: number;
  }): string;
  assertWritableObjectRef(input: {
    bucketName?: string | null;
    storageKey: string;
    merchantId: string;
    ownerType: BrowserUploadOwnerType;
    ownerId: string;
  }): { bucketName: string; storageKey: string };
};

export const defaultStorageProviderName: AppObjectStorageProviderName = "tencent_cos";
export const defaultStsDurationSeconds = 1800;
export const defaultReadUrlTtlSeconds = 3600;
export const defaultMediaUploadMaxBytes = 1024 * 1024 * 1024;

export function normalizeConfiguredStorageProviderName(
  rawValue: string | null | undefined,
): AppObjectStorageProviderName {
  const value = rawValue?.trim() || defaultStorageProviderName;

  if (value === "tencent_cos" || value === "aliyun_oss") {
    return value;
  }

  throw new ApiError(
    500,
    "STORAGE_PROVIDER_UNSUPPORTED",
    "STORAGE_PROVIDER must be tencent_cos or aliyun_oss.",
  );
}

export function getConfiguredStorageProviderName(): AppObjectStorageProviderName {
  return normalizeConfiguredStorageProviderName(process.env.STORAGE_PROVIDER);
}

export function assertAppObjectStorageProviderName(
  storageProvider: MediaStorageProvider,
): AppObjectStorageProviderName {
  if (storageProvider === "tencent_cos" || storageProvider === "aliyun_oss") {
    return storageProvider;
  }

  throw new ApiError(
    400,
    "MEDIA_STORAGE_PROVIDER_UNSUPPORTED",
    "New media uploads must use the configured object storage provider.",
  );
}

export function assertStorageProviderMatchesConfigured(
  storageProvider: MediaStorageProvider,
): AppObjectStorageProviderName {
  const requested = assertAppObjectStorageProviderName(storageProvider);
  const configured = getConfiguredStorageProviderName();

  if (requested !== configured) {
    throw new ApiError(
      400,
      "MEDIA_STORAGE_PROVIDER_MISMATCH",
      `Uploaded media provider must match configured storage provider ${configured}.`,
    );
  }

  return requested;
}

export function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
  envName: string,
  errorCode = "STORAGE_ENV_INVALID",
) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(500, errorCode, `${envName} must be a positive integer.`);
  }

  return parsed;
}

export function sanitizeFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop()?.trim() || "upload";
  const extensionIndex = baseName.lastIndexOf(".");
  const namePart = extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName;
  const extensionPart = extensionIndex > 0 ? baseName.slice(extensionIndex + 1) : "";
  const safeName = normalizeKeySegment(namePart, "upload");
  const safeExtension = normalizeKeySegment(extensionPart, "");

  return safeExtension ? `${safeName}.${safeExtension}` : safeName;
}

export function normalizeKeySegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized || fallback;
}

export function buildStandardMediaUploadKeyPrefix(input: {
  merchantId: string;
  ownerType: BrowserUploadOwnerType;
  ownerId: string;
}) {
  if (input.ownerType === "source_item") {
    return `source-assets/${input.merchantId}/${input.ownerId}`;
  }

  return `draft-inputs/${input.merchantId}/${input.ownerId}`;
}

export function buildStandardKnowledgeUploadKey(input: {
  scope: KnowledgeUploadScope;
  merchantId?: string | null;
  documentId: string;
  fileName: string;
}) {
  const ownerSegment =
    input.scope === "merchant" ? input.merchantId ?? "unknown-merchant" : "platform";

  return `knowledge/${input.scope}/${ownerSegment}/${input.documentId}/${sanitizeFileName(
    input.fileName,
  )}`;
}

export function assertObjectRefMatchesPrefix(input: {
  providerLabel: string;
  configuredBucket: string;
  bucketName?: string | null;
  storageKey: string;
  expectedPrefix: string;
}) {
  const bucketName = input.bucketName ?? input.configuredBucket;

  if (bucketName !== input.configuredBucket) {
    throw new ApiError(
      400,
      "MEDIA_BUCKET_MISMATCH",
      `Uploaded media must target the configured ${input.providerLabel} bucket.`,
    );
  }

  if (!input.storageKey.startsWith(`${input.expectedPrefix}/`)) {
    throw new ApiError(
      400,
      "MEDIA_STORAGE_KEY_INVALID",
      "Uploaded media key does not match the expected owner prefix.",
    );
  }

  return { bucketName, storageKey: input.storageKey };
}
