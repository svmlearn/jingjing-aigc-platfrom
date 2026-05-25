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
  normalizeConfiguredStorageProviderName(
    providerName ?? getConfiguredStorageProviderName(),
  );

  return aliyunOssProvider;
}

export function getConfiguredObjectStorageProvider(): ObjectStorageProvider {
  return getObjectStorageProvider(getConfiguredStorageProviderName());
}

export function getWritableConfiguredObjectStorageProvider(
  storageProvider: MediaStorageProvider,
): ObjectStorageProvider {
  return getObjectStorageProvider(assertStorageProviderMatchesConfigured(storageProvider));
}
