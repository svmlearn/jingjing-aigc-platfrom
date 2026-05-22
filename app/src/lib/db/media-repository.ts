import "server-only";

import type {
  MediaAssetDto,
  MediaAssetType,
  MediaOwnerType,
  MediaStorageProvider,
} from "@/contracts/media";
import type { ContentVariantDto } from "@/contracts/draft";
import {
  pgAssertMediaOwnerAccess,
  pgCreateAssetObject,
  pgListAssetObjectsByOwner,
} from "@/lib/db/postgres-video-chain-repository";

export type MediaOwnerContext = {
  ownerType: MediaOwnerType;
  ownerId: string;
  merchantId: string;
  createdByUserId?: string | null;
  draftId?: string;
  variantType?: ContentVariantDto["variantType"];
};

export async function assertMediaOwnerAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaOwnerContext> {
  return pgAssertMediaOwnerAccess(input);
}

export async function createAssetObject(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  originUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder?: number;
}): Promise<MediaAssetDto> {
  return pgCreateAssetObject(input);
}

export async function listAssetObjectsByOwner(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}): Promise<MediaAssetDto[]> {
  return pgListAssetObjectsByOwner(input);
}
