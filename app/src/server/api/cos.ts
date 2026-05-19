import "server-only";

import type { Buffer } from "node:buffer";

import type { MediaStorageProvider, MediaUploadIntentDto } from "@/contracts/media";
import { ApiError } from "@/server/api/errors";
import type {
  BrowserUploadOwnerType,
  KnowledgeUploadScope,
} from "@/server/storage/object-storage";
import {
  getTencentCosConfig,
  tencentCosProvider,
  type TencentCosConfig,
} from "@/server/storage/tencent-cos-provider";

export type CosConfig = TencentCosConfig;

export function getCosConfig(): CosConfig {
  return getTencentCosConfig();
}

export function assertSupportedMediaStorageProvider(storageProvider: MediaStorageProvider) {
  if (storageProvider !== "tencent_cos") {
    throw new ApiError(
      400,
      "MEDIA_STORAGE_PROVIDER_UNSUPPORTED",
      "Tencent COS is only available for explicit legacy/reference operations.",
    );
  }
}

export function assertUploadSizeWithinLimit(sizeBytes: number) {
  tencentCosProvider.assertUploadSizeWithinLimit(sizeBytes);
}

export function buildCosUploadObjectKey(input: {
  merchantId: string;
  ownerType: BrowserUploadOwnerType;
  ownerId: string;
  fileName: string;
}): string {
  return tencentCosProvider.buildMediaUploadKey(input);
}

export function buildKnowledgeCosObjectKey(input: {
  scope: KnowledgeUploadScope;
  merchantId?: string | null;
  documentId: string;
  fileName: string;
}): string {
  return tencentCosProvider.buildKnowledgeUploadKey(input);
}

export function getCosUploadKeyPrefix(input: {
  merchantId: string;
  ownerType: BrowserUploadOwnerType;
  ownerId: string;
}): string {
  return tencentCosProvider.getMediaUploadKeyPrefix(input);
}

export async function issueCosUploadCredentials(input: {
  cosKey: string;
}): Promise<Omit<MediaUploadIntentDto, "bucket" | "region" | "cosKey">> {
  const intent = await tencentCosProvider.issueBrowserUploadIntent({
    storageKey: input.cosKey,
  });

  return {
    TmpSecretId: intent.TmpSecretId,
    TmpSecretKey: intent.TmpSecretKey,
    Token: intent.Token,
    StartTime: intent.StartTime,
    ExpiredTime: intent.ExpiredTime,
    expiredTime: intent.expiredTime,
  };
}

export async function putCosObject(input: {
  key: string;
  body: Buffer;
  contentType?: string | null;
}): Promise<{ bucketName: string; storageKey: string; etag?: string | null }> {
  const result = await tencentCosProvider.putObject(input);

  return {
    bucketName: result.bucketName,
    storageKey: result.storageKey,
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
  return tencentCosProvider.createSignedReadUrl(input);
}
