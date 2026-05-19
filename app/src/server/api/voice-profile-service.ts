import "server-only";

import type { CreateVoiceProfileRequest, VoiceProfileDto } from "@/contracts/voice";
import {
  createVoiceProfile,
  listVoiceProfiles,
} from "@/lib/db/voice-profile-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

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
