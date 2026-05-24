import "server-only";

import { randomUUID } from "node:crypto";

import type { MediaAssetDto } from "@/contracts/media";
import type {
  CreateVoiceProfileRequest,
  VoiceProfileDto,
  VoiceProfileProvider,
  VoiceProfileStatus,
} from "@/contracts/voice";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import {
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

type Timestamp = string | Date;

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
  authorization_accepted_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp | null;
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
  created_at: Timestamp;
  updated_at: Timestamp | null;
};

type LocalVoiceProfileStore = {
  voiceProfiles: Map<string, VoiceProfileDto>;
};

const globalLocalVoiceProfileStore = globalThis as typeof globalThis & {
  __jingjingLocalVoiceProfileStore?: LocalVoiceProfileStore;
};

const localVoiceProfileStore =
  globalLocalVoiceProfileStore.__jingjingLocalVoiceProfileStore ??
  (globalLocalVoiceProfileStore.__jingjingLocalVoiceProfileStore = {
    voiceProfiles: new Map<string, VoiceProfileDto>(),
  });

export async function listVoiceProfiles(input: {
  merchantId: string;
  createdByUserId: string;
}): Promise<VoiceProfileDto[]> {
  if (isLocalDemoRuntime()) {
    return [...localVoiceProfileStore.voiceProfiles.values()]
      .filter(
        (profile) =>
          profile.merchantId === input.merchantId &&
          profile.createdByUserId === input.createdByUserId &&
          profile.status !== "archived",
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const result = await queryAppDb<VoiceProfileRow>(
    `
    select ${voiceProfileSelect}
    from public.voice_profiles
    where merchant_id = $1
      and created_by_user_id = $2
      and status <> 'archived'
    order by created_at desc
    `,
    [input.merchantId, input.createdByUserId],
  );

  return attachVoiceProfileAssets(result.rows.map(mapVoiceProfile));
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

  if (isLocalDemoRuntime()) {
    const now = new Date().toISOString();
    for (const profile of localVoiceProfileStore.voiceProfiles.values()) {
      if (
        profile.merchantId === input.merchantId &&
        profile.createdByUserId === input.createdByUserId &&
        profile.status === "ready"
      ) {
        localVoiceProfileStore.voiceProfiles.set(profile.id, {
          ...profile,
          status: "archived",
          updatedAt: now,
        });
      }
    }

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

  const profile = await withAppDbTransaction(async (client) => {
    const existingResult = await client.query<VoiceProfileRow>(
      `
      select ${voiceProfileSelect}
      from public.voice_profiles
      where id = $1
      for update
      `,
      [id],
    );
    const existing = existingResult.rows[0];

    if (existing) {
      if (
        existing.merchant_id !== input.merchantId ||
        existing.created_by_user_id !== input.createdByUserId ||
        existing.ref_audio_asset_id !== input.request.refAudioAssetId ||
        existing.status !== "ready"
      ) {
        throw new ApiError(409, "VOICE_PROFILE_ID_CONFLICT", "Voice profile id is already used.");
      }

      return mapVoiceProfile(existing);
    }

    await client.query(
      `
      update public.voice_profiles
      set status = 'archived',
          updated_at = timezone('utc', now())
      where merchant_id = $1
        and created_by_user_id = $2
        and status = 'ready'
      `,
      [input.merchantId, input.createdByUserId],
    );

    const result = await client.query<VoiceProfileRow>(
      `
      insert into public.voice_profiles (
        id,
        merchant_id,
        created_by_user_id,
        display_name,
        status,
        provider,
        ref_audio_asset_id,
        authorization_accepted_at
      ) values ($1, $2, $3, $4, 'ready', 'pixelle_clone', $5, timezone('utc', now()))
      returning ${voiceProfileSelect}
      `,
      [
        id,
        input.merchantId,
        input.createdByUserId,
        input.request.displayName.trim(),
        input.request.refAudioAssetId,
      ],
    );

    return mapVoiceProfile(result.rows[0]);
  });

  return { ...profile, refAudioAsset };
}

export async function assertVoiceProfileAccess(input: {
  merchantId: string;
  createdByUserId: string;
  voiceProfileId: string;
}): Promise<VoiceProfileDto> {
  if (isLocalDemoRuntime()) {
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

  const result = await queryAppDb<VoiceProfileRow>(
    `
    select ${voiceProfileSelect}
    from public.voice_profiles
    where id = $1
      and merchant_id = $2
      and created_by_user_id = $3
      and status = 'ready'
    limit 1
    `,
    [input.voiceProfileId, input.merchantId, input.createdByUserId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "VOICE_PROFILE_NOT_FOUND", "Voice profile not found.");
  }

  return mapVoiceProfile(row);
}

export async function assertVoiceProfileAudioAsset(input: {
  merchantId: string;
  createdByUserId: string;
  voiceProfileId: string;
  assetId: string;
}): Promise<MediaAssetDto> {
  const result = await queryAppDb<VoiceProfileAssetRow>(
    `
    select ${assetObjectSelect}
    from public.asset_objects
    where id = $1
      and owner_type = 'voice_profile'
      and owner_id = $2
      and asset_type = 'audio'
      and storage_provider in ('tencent_cos', 'aliyun_oss')
    limit 1
    `,
    [input.assetId, input.voiceProfileId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(400, "VOICE_PROFILE_AUDIO_ASSET_INVALID", "Reference audio asset is invalid.");
  }
  const asset = mapAssetObject(row);
  assertVoiceProfileAudioStorageKey(input, asset);
  return asset;
}

async function attachVoiceProfileAssets(profiles: VoiceProfileDto[]): Promise<VoiceProfileDto[]> {
  if (profiles.length === 0) {
    return profiles;
  }

  const result = await queryAppDb<VoiceProfileAssetRow>(
    `
    select ${assetObjectSelect}
    from public.asset_objects
    where id = any($1::uuid[])
    `,
    [profiles.map((profile) => profile.refAudioAssetId)],
  );
  const assetsById = new Map(result.rows.map((row) => {
    const asset = mapAssetObject(row);
    return [asset.id, asset] as const;
  }));

  return profiles.map((profile) => ({
    ...profile,
    refAudioAsset: assetsById.get(profile.refAudioAssetId) ?? null,
  }));
}

function assertVoiceProfileAudioStorageKey(input: {
  merchantId: string;
  voiceProfileId: string;
}, asset: Pick<MediaAssetDto, "storageKey">) {
  const allowedPrefixes = [
    `voice-profiles/${input.merchantId}/${input.voiceProfileId}/`,
    `draft-inputs/${input.merchantId}/${input.voiceProfileId}/voice-profile-audio/`,
  ];

  if (!allowedPrefixes.some((prefix) => asset.storageKey.startsWith(prefix))) {
    throw new ApiError(
      400,
      "VOICE_PROFILE_AUDIO_ASSET_INVALID",
      "Reference audio asset does not belong to this voice profile.",
    );
  }
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
    authorizationAcceptedAt: normalizeTimestamp(row.authorization_accepted_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: row.updated_at ? normalizeTimestamp(row.updated_at) : null,
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
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: row.updated_at ? normalizeTimestamp(row.updated_at) : null,
  };
}

function normalizeTimestamp(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
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
