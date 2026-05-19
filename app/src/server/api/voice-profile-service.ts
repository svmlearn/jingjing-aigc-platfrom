import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type { MediaAssetDto } from "@/contracts/media";
import type { CreateVoiceProfileRequest, VoiceProfileDto } from "@/contracts/voice";
import {
  createVoiceProfile,
  listVoiceProfiles,
} from "@/lib/db/voice-profile-repository";
import { createAssetObject } from "@/lib/db/media-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  isSupportedVoiceProfileAudioFile,
  normalizeVoiceProfileAudioMimeType,
} from "@/lib/member-video-workflow";
import { ApiError } from "@/server/api/errors";
import { getConfiguredObjectStorageProvider } from "@/server/storage";

export async function listVoiceProfilesForUser(input: {
  userId: string;
}): Promise<VoiceProfileDto[]> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return listVoiceProfiles({
    merchantId: merchant.id,
    createdByUserId: input.userId,
  });
}

export async function createVoiceProfileForUser(input: {
  userId: string;
  request: CreateVoiceProfileRequest;
}): Promise<VoiceProfileDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return createVoiceProfile({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    request: input.request,
  });
}

export async function uploadVoiceProfileAudioForUser(input: {
  userId: string;
  voiceProfileId?: string | null;
  displayName: string;
  authorizationAccepted: boolean;
  file: File;
}): Promise<{ voiceProfile: VoiceProfileDto; audioAsset: MediaAssetDto }> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const voiceProfileId = input.voiceProfileId?.trim() || randomUUID();
  const displayName = input.displayName.trim() || input.file.name.replace(/\.[^.]+$/, "");

  if (!input.authorizationAccepted) {
    throw new ApiError(
      400,
      "VOICE_PROFILE_AUTHORIZATION_REQUIRED",
      "Voice cloning requires explicit authorization confirmation.",
    );
  }

  if (!isSupportedVoiceProfileAudioFile(input.file)) {
    throw new ApiError(
      400,
      "VOICE_PROFILE_AUDIO_UNSUPPORTED",
      "Voice clone reference audio must be wav, mp3, m4a, aac, ogg, opus, or webm.",
    );
  }

  const storage = getConfiguredObjectStorageProvider();
  storage.assertUploadSizeWithinLimit(input.file.size);
  const mimeType = normalizeVoiceProfileAudioMimeType(input.file);
  const storageKey = storage.buildMediaUploadKey({
    merchantId: merchant.id,
    ownerType: "voice_profile",
    ownerId: voiceProfileId,
    fileName: input.file.name,
  });
  const uploadResult = await storage.putObject({
    key: storageKey,
    body: Buffer.from(await input.file.arrayBuffer()),
    contentType: mimeType,
  });

  const audioAsset = await createAssetObject({
    ownerType: "voice_profile",
    ownerId: voiceProfileId,
    assetType: "audio",
    storageProvider: uploadResult.provider,
    bucketName: uploadResult.bucketName,
    storageKey: uploadResult.storageKey,
    mimeType,
    fileSizeBytes: input.file.size,
    etag: uploadResult.etag,
  });

  const voiceProfile = await createVoiceProfile({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    request: {
      id: voiceProfileId,
      displayName,
      refAudioAssetId: audioAsset.id,
      authorizationAccepted: true,
    },
  });

  return { voiceProfile, audioAsset };
}
