import type { MediaAssetDto } from "./media";

export type VoiceProfileStatus = "ready" | "disabled" | "archived";

export type VoiceProfileProvider = "aliyun_cosyvoice_clone" | "pixelle_clone";

export type VoiceProfileDto = {
  id: string;
  merchantId: string;
  createdByUserId: string;
  displayName: string;
  status: VoiceProfileStatus;
  provider: VoiceProfileProvider;
  externalVoiceId?: string | null;
  externalModelId?: string | null;
  refAudioAssetId: string;
  authorizationAcceptedAt: string;
  createdAt: string;
  updatedAt?: string | null;
  refAudioAsset?: MediaAssetDto | null;
};

export type CreateVoiceProfileRequest = {
  id?: string;
  displayName: string;
  refAudioAssetId: string;
  authorizationAccepted: boolean;
};
