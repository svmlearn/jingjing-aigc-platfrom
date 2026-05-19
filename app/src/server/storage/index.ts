import "server-only";

import type { MediaStorageProvider } from "@/contracts/media";
import { aliyunOssProvider } from "@/server/storage/aliyun-oss-provider";
import {
  assertStorageProviderMatchesConfigured,
  getConfiguredStorageProviderName,
  normalizeConfiguredStorageProviderName,
  type AppObjectStorageProviderName,
  type ObjectStorageProvider,
} from "@/server/storage/object-storage";
import { tencentCosProvider } from "@/server/storage/tencent-cos-provider";

export type {
  AppObjectStorageProviderName,
  BrowserUploadOwnerType,
  KnowledgeUploadScope,
  ObjectStorageConfig,
  ObjectStorageProvider,
  ServerPutObjectResult,
} from "@/server/storage/object-storage";

export function getObjectStorageProvider(
  providerName?: MediaStorageProvider | AppObjectStorageProviderName | string | null,
): ObjectStorageProvider {
  const resolvedProviderName = normalizeConfiguredStorageProviderName(
    providerName ?? getConfiguredStorageProviderName(),
  );

  if (resolvedProviderName === "aliyun_oss") {
    return aliyunOssProvider;
  }

  return tencentCosProvider;
}

export function getConfiguredObjectStorageProvider(): ObjectStorageProvider {
  return getObjectStorageProvider(getConfiguredStorageProviderName());
}

export function getWritableConfiguredObjectStorageProvider(
  storageProvider: MediaStorageProvider,
): ObjectStorageProvider {
  return getObjectStorageProvider(assertStorageProviderMatchesConfigured(storageProvider));
}
