import "server-only";

import type {
  MediaAssetDto,
  MediaCompleteRequest,
  MediaUploadIntentDto,
  MediaUploadIntentRequest,
} from "@/contracts/media";
import { assertMediaOwnerAccess, createAssetObject } from "@/lib/db/media-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";
import {
  assertSupportedMediaStorageProvider,
  assertUploadSizeWithinLimit,
  buildCosUploadObjectKey,
  getCosConfig,
  getCosUploadKeyPrefix,
  issueCosUploadCredentials,
} from "@/server/api/cos";

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

  assertUploadSizeWithinLimit(input.request.sizeBytes);

  await assertMediaOwnerAccess({
    merchantId: merchant.id,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
  });

  const cosKey = buildCosUploadObjectKey({
    merchantId: merchant.id,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
    fileName: input.request.fileName,
  });
  const credentials = await issueCosUploadCredentials({ cosKey });
  const cosConfig = getCosConfig();

  return {
    bucket: cosConfig.bucket,
    region: cosConfig.region,
    cosKey,
    ...credentials,
  };
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

  assertSupportedMediaStorageProvider(input.request.storageProvider);
  const cosConfig = getCosConfig();

  if (input.request.sizeBytes !== null && input.request.sizeBytes !== undefined) {
    assertUploadSizeWithinLimit(input.request.sizeBytes);
  }

  if ((input.request.bucketName ?? cosConfig.bucket) !== cosConfig.bucket) {
    throw new ApiError(
      400,
      "MEDIA_BUCKET_MISMATCH",
      "Uploaded media must target the configured Tencent COS bucket.",
    );
  }

  if (
    !input.request.storageKey.startsWith(
      `${getCosUploadKeyPrefix({
        merchantId: merchant.id,
        ownerType: input.request.ownerType,
        ownerId: input.request.ownerId,
      })}/`,
    )
  ) {
    throw new ApiError(
      400,
      "MEDIA_STORAGE_KEY_INVALID",
      "Uploaded media key does not match the expected owner prefix.",
    );
  }

  await assertMediaOwnerAccess({
    merchantId: merchant.id,
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
  });

  return createAssetObject({
    ownerType: input.request.ownerType,
    ownerId: input.request.ownerId,
    assetType: input.request.assetType,
    storageProvider: input.request.storageProvider,
    bucketName: input.request.bucketName ?? cosConfig.bucket,
    storageKey: input.request.storageKey,
    originUrl: input.request.originUrl,
    mimeType: input.request.mimeType,
    fileSizeBytes: input.request.sizeBytes,
    etag: input.request.etag,
    sortOrder: input.request.sortOrder,
  });
}
