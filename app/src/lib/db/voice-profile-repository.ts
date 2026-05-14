import "server-only";

import { randomUUID } from "node:crypto";

import type {
  CreateVoiceProfileRequest,
  VoiceProfileDto,
  VoiceProfileProvider,
  VoiceProfileStatus,
} from "@/contracts/voice";
import type { MediaAssetDto } from "@/contracts/media";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type VoiceProfileRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string;
  display_name: string;
  status: VoiceProfileStatus;
  provider: VoiceProfileProvider;
  external_voice_id: string | null;
  external_model_id: string | null;
  ref_audio_asset_id: string;
  authorization_accepted_at: string;
  created_at: string;
  updated_at: string | null;
};

type VoiceProfileAssetRow = {
  id: string;
  owner_type: MediaAssetDto["ownerType"];
  owner_id: string;
  asset_type: MediaAssetDto["assetType"];
  storage_provider: MediaAssetDto["storageProvider"];
  bucket_name: string | null;
  storage_key: string;
  origin_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  etag: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

type LocalVoiceProfileStore = {
  voiceProfiles: Map<string, VoiceProfileDto>;
};

const globalVoiceProfileStore = globalThis as typeof globalThis & {
  __jingjingLocalVoiceProfileStore?: LocalVoiceProfileStore;
};

const localVoiceProfileStore =
  globalVoiceProfileStore.__jingjingLocalVoiceProfileStore ??
  (globalVoiceProfileStore.__jingjingLocalVoiceProfileStore = {
    voiceProfiles: new Map<string, VoiceProfileDto>(),
  });

export async function listVoiceProfiles(input: {
  merchantId: string;
  createdByUserId: string;
}): Promise<VoiceProfileDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(localVoiceProfileStore.voiceProfiles.values())
      .filter(
        (profile) =>
          profile.merchantId === input.merchantId &&
          profile.createdByUserId === input.createdByUserId &&
          profile.status !== "archived",
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("voice_profiles")
    .select(voiceProfileSelect)
    .eq("merchant_id", input.merchantId)
    .eq("created_by_user_id", input.createdByUserId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "VOICE_PROFILE_LIST_FAILED", error.message);
  }

  const profiles = ((data ?? []) as unknown as VoiceProfileRow[]).map(mapVoiceProfile);
  return attachVoiceProfileAssets(profiles);
}

export async function createVoiceProfile(input: {
  merchantId: string;
  createdByUserId: string;
  request: CreateVoiceProfileRequest;
}): Promise<VoiceProfileDto> {
  const id = input.request.id ?? randomUUID();

  if (!input.request.authorizationAccepted) {
    throw new ApiError(
      400,
      "VOICE_PROFILE_AUTHORIZATION_REQUIRED",
      "Voice cloning requires explicit authorization confirmation.",
    );
  }

  const refAudioAsset = await assertVoiceProfileAudioAsset({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    voiceProfileId: id,
    assetId: input.request.refAudioAssetId,
  });

  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const profile: VoiceProfileDto = {
      id,
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      displayName: input.request.displayName.trim(),
      status: "ready",
      provider: "pixelle_clone",
      externalVoiceId: null,
      externalModelId: null,
      refAudioAssetId: input.request.refAudioAssetId,
      authorizationAcceptedAt: now,
      createdAt: now,
      updatedAt: null,
      refAudioAsset,
    };
    localVoiceProfileStore.voiceProfiles.set(profile.id, profile);
    return profile;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("voice_profiles")
    .insert({
      id,
      merchant_id: input.merchantId,
      created_by_user_id: input.createdByUserId,
      display_name: input.request.displayName.trim(),
      status: "ready",
      provider: "pixelle_clone",
      ref_audio_asset_id: input.request.refAudioAssetId,
      authorization_accepted_at: new Date().toISOString(),
    })
    .select(voiceProfileSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "VOICE_PROFILE_CREATE_FAILED", error?.message ?? "Create voice profile failed.");
  }

  return {
    ...mapVoiceProfile(data as unknown as VoiceProfileRow),
    refAudioAsset,
  };
}

export async function assertVoiceProfileAccess(input: {
  merchantId: string;
  createdByUserId: string;
  voiceProfileId: string;
}): Promise<VoiceProfileDto> {
  if (!isSupabaseAdminConfigured()) {
    const profile = localVoiceProfileStore.voiceProfiles.get(input.voiceProfileId);
    if (
      !profile ||
      profile.merchantId !== input.merchantId ||
      profile.createdByUserId !== input.createdByUserId ||
      profile.status !== "ready"
    ) {
      throw new ApiError(404, "VOICE_PROFILE_NOT_FOUND", "Voice profile not found.");
    }
    return profile;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("voice_profiles")
    .select(voiceProfileSelect)
    .eq("id", input.voiceProfileId)
    .eq("merchant_id", input.merchantId)
    .eq("created_by_user_id", input.createdByUserId)
    .eq("status", "ready")
    .single();

  if (error || !data) {
    throw new ApiError(404, "VOICE_PROFILE_NOT_FOUND", "Voice profile not found.");
  }

  return mapVoiceProfile(data as unknown as VoiceProfileRow);
}

export async function assertVoiceProfileAudioAsset(input: {
  merchantId: string;
  createdByUserId: string;
  voiceProfileId: string;
  assetId: string;
}): Promise<MediaAssetDto> {
  if (!isSupabaseAdminConfigured()) {
    return {
      id: input.assetId,
      ownerType: "voice_profile",
      ownerId: input.voiceProfileId,
      assetType: "audio",
      storageProvider: "tencent_cos",
      bucketName: null,
      storageKey: `voice-profiles/${input.merchantId}/${input.voiceProfileId}/local-audio`,
      originUrl: null,
      mimeType: "audio/wav",
      fileSizeBytes: null,
      etag: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("asset_objects")
    .select(assetObjectSelect)
    .eq("id", input.assetId)
    .eq("owner_type", "voice_profile")
    .eq("owner_id", input.voiceProfileId)
    .eq("asset_type", "audio")
    .eq("storage_provider", "tencent_cos")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "VOICE_PROFILE_AUDIO_LOOKUP_FAILED", error.message);
  }

  if (!data) {
    throw new ApiError(400, "VOICE_PROFILE_AUDIO_ASSET_INVALID", "Reference audio asset is invalid.");
  }

  const asset = mapAssetObject(data as unknown as VoiceProfileAssetRow);
  if (!asset.storageKey.startsWith(`voice-profiles/${input.merchantId}/${input.voiceProfileId}/`)) {
    throw new ApiError(
      400,
      "VOICE_PROFILE_AUDIO_ASSET_INVALID",
      "Reference audio asset does not belong to this voice profile.",
    );
  }

  return asset;
}

async function attachVoiceProfileAssets(profiles: VoiceProfileDto[]): Promise<VoiceProfileDto[]> {
  if (!isSupabaseAdminConfigured() || profiles.length === 0) {
    return profiles;
  }

  const assetIds = profiles.map((profile) => profile.refAudioAssetId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("asset_objects")
    .select(assetObjectSelect)
    .in("id", assetIds);

  if (error) {
    throw new ApiError(500, "VOICE_PROFILE_AUDIO_LIST_FAILED", error.message);
  }

  const assetsById = new Map(
    ((data ?? []) as unknown as VoiceProfileAssetRow[]).map((row) => {
      const asset = mapAssetObject(row);
      return [asset.id, asset] as const;
    }),
  );

  return profiles.map((profile) => ({
    ...profile,
    refAudioAsset: assetsById.get(profile.refAudioAssetId) ?? null,
  }));
}

function mapVoiceProfile(row: VoiceProfileRow): VoiceProfileDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id,
    displayName: row.display_name,
    status: row.status,
    provider: row.provider,
    externalVoiceId: row.external_voice_id,
    externalModelId: row.external_model_id,
    refAudioAssetId: row.ref_audio_asset_id,
    authorizationAcceptedAt: row.authorization_accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAssetObject(row: VoiceProfileAssetRow): MediaAssetDto {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    assetType: row.asset_type,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    originUrl: row.origin_url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    etag: row.etag,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const voiceProfileSelect = [
  "id",
  "merchant_id",
  "created_by_user_id",
  "display_name",
  "status",
  "provider",
  "external_voice_id",
  "external_model_id",
  "ref_audio_asset_id",
  "authorization_accepted_at",
  "created_at",
  "updated_at",
].join(", ");

const assetObjectSelect = [
  "id",
  "owner_type",
  "owner_id",
  "asset_type",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "origin_url",
  "mime_type",
  "file_size_bytes",
  "etag",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");
