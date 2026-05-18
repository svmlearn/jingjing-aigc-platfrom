import "server-only";

import type {
  MediaAssetDto,
  MediaCompleteRequest,
  MediaUploadIntentDto,
  MediaUploadIntentRequest,
} from "@/contracts/media";
import {
  assertLocalRealChainMediaOwner,
  createLocalRealChainAssetObject,
  getLocalRealChainMerchantId,
  isLocalRealChainEnabled,
} from "@/lib/db/local-real-chain-repository";
import { assertMediaOwnerAccess, createAssetObject } from "@/lib/db/media-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";
import {
  getConfiguredObjectStorageProvider,
  getWritableConfiguredObjectStorageProvider,
} from "@/server/storage";

export async function createMediaUploadIntentForUser(input: {
  userId: string;
  request: MediaUploadIntentRequest;
}): Promise<MediaUploadIntentDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  if (input.request.ownerType === "content_variant") {
    throw new ApiError(
      400,
      "MEDIA_UPLOAD_OWNER_UNSUPPORTED",
      "Direct browser uploads only support source items and content drafts.",
    );
  }

  const storage = getConfiguredObjectStorageProvider();
  storage.assertUploadSizeWithinLimit(input.request.sizeBytes);

  if (isLocalRealChainEnabled()) {
    await assertLocalRealChainMediaOwner({
      ownerType: input.request.ownerType,
      ownerId: input.request.ownerId,
    });
    const storageKey = storage.buildMediaUploadKey({
      merchantId: getLocalRealChainMerchantId(),
      ownerType: input.request.ownerType,
      ownerId: input.request.ownerId,
      fileName: input.request.fileName,
    });

    return storage.issueBrowserUploadIntent({
      storageKey,
      contentType: input.request.mimeType,
    });
  }

  await assertMediaOwnerAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
  });

  const storageKey = storage.buildMediaUploadKey({
    merchantId: merchant.id,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
    fileName: input.request.fileName,
  });

  return storage.issueBrowserUploadIntent({
    storageKey,
    contentType: input.request.mimeType,
  });
}

export async function completeMediaUploadForUser(input: {
  userId: string;
  request: MediaCompleteRequest;
}): Promise<MediaAssetDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);

  if (input.request.ownerType === "content_variant") {
    throw new ApiError(
      400,
      "MEDIA_COMPLETE_OWNER_UNSUPPORTED",
      "Direct browser uploads only support source items and content drafts.",
    );
  }

  const storage = getWritableConfiguredObjectStorageProvider(input.request.storageProvider);
  const merchantId = isLocalRealChainEnabled() ? getLocalRealChainMerchantId() : merchant.id;

  if (input.request.sizeBytes !== null && input.request.sizeBytes !== undefined) {
    storage.assertUploadSizeWithinLimit(input.request.sizeBytes);
  }

  const objectRef = storage.assertWritableObjectRef({
    bucketName: input.request.bucketName,
    storageKey: input.request.storageKey,
    merchantId,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
  });

  if (isLocalRealChainEnabled()) {
    await assertLocalRealChainMediaOwner({
      ownerType: input.request.ownerType,
      ownerId: input.request.ownerId,
    });

    return createLocalRealChainAssetObject({
      ownerType: input.request.ownerType,
      ownerId: input.request.ownerId,
      assetType: input.request.assetType,
      storageProvider: storage.provider,
      bucketName: objectRef.bucketName,
      storageKey: objectRef.storageKey,
      originUrl: input.request.originUrl,
      mimeType: input.request.mimeType,
      fileSizeBytes: input.request.sizeBytes,
      etag: input.request.etag,
      sortOrder: input.request.sortOrder,
    });
  }

  await assertMediaOwnerAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
  });

  return createAssetObject({
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
    assetType: input.request.assetType,
    storageProvider: storage.provider,
    bucketName: objectRef.bucketName,
    storageKey: objectRef.storageKey,
    originUrl: input.request.originUrl,
    mimeType: input.request.mimeType,
    fileSizeBytes: input.request.sizeBytes,
    etag: input.request.etag,
    sortOrder: input.request.sortOrder,
  });
}
