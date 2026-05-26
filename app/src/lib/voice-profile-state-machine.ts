export type VoiceProfileStateStatus = "ready" | "disabled" | "archived";

export type VoiceProfileStateProvider = "aliyun_cosyvoice_clone" | "pixelle_clone";

export type VoiceProfileStateRecord = {
  id: string;
  merchantId: string;
  createdByUserId: string;
  displayName: string;
  status: VoiceProfileStateStatus;
  provider: VoiceProfileStateProvider;
  externalVoiceId?: string | null;
  externalModelId?: string | null;
  refAudioAssetId: string;
  authorizationAcceptedAt: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type VoiceProfileReplacementCandidate = {
  id: string;
  merchantId: string;
  createdByUserId: string;
  displayName: string;
  refAudioAssetId: string;
  authorizationAcceptedAt?: string;
};

export type VoiceCloneProviderResult =
  | {
      ok: true;
      externalVoiceId?: string | null;
      externalModelId?: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type VoiceProfileCleanupJob = {
  profileId: string;
  refAudioAssetId: string;
  externalVoiceId?: string | null;
  externalModelId?: string | null;
  reason: "voice_profile_replaced";
  status: "pending";
  createdAt: string;
};

export type VoiceProfileReplacementResult = {
  profiles: VoiceProfileStateRecord[];
  currentProfile: VoiceProfileStateRecord | null;
  cleanupJobs: VoiceProfileCleanupJob[];
  providerFailure?: Extract<VoiceCloneProviderResult, { ok: false }>;
};

export class VoiceProfileRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function replaceCurrentVoiceProfile(input: {
  profiles: VoiceProfileStateRecord[];
  candidate: VoiceProfileReplacementCandidate;
  providerResult: VoiceCloneProviderResult;
  now: string;
}): VoiceProfileReplacementResult {
  const existing = input.profiles.find((profile) => profile.id === input.candidate.id);
  if (existing) {
    if (
      existing.merchantId !== input.candidate.merchantId ||
      existing.createdByUserId !== input.candidate.createdByUserId ||
      existing.status !== "ready" ||
      existing.refAudioAssetId !== input.candidate.refAudioAssetId
    ) {
      throw new VoiceProfileRuleError(
        "VOICE_PROFILE_ID_CONFLICT",
        "Voice profile id is already used.",
      );
    }

    return {
      profiles: [...input.profiles],
      currentProfile: existing,
      cleanupJobs: [],
    };
  }

  const existingCurrentProfile = findCurrentVoiceProfile(input.profiles, {
    merchantId: input.candidate.merchantId,
    createdByUserId: input.candidate.createdByUserId,
  });

  if (!input.providerResult.ok) {
    return {
      profiles: [...input.profiles],
      currentProfile: existingCurrentProfile,
      cleanupJobs: [],
      providerFailure: input.providerResult,
    };
  }

  const profilesToArchive = input.profiles.filter(
    (profile) =>
      profile.merchantId === input.candidate.merchantId &&
      profile.createdByUserId === input.candidate.createdByUserId &&
      profile.status === "ready",
  );
  const nextProfile: VoiceProfileStateRecord = {
    id: input.candidate.id,
    merchantId: input.candidate.merchantId,
    createdByUserId: input.candidate.createdByUserId,
    displayName: input.candidate.displayName.trim(),
    status: "ready",
    provider: "aliyun_cosyvoice_clone",
    externalVoiceId: input.providerResult.externalVoiceId ?? null,
    externalModelId: input.providerResult.externalModelId ?? null,
    refAudioAssetId: input.candidate.refAudioAssetId,
    authorizationAcceptedAt: input.candidate.authorizationAcceptedAt ?? input.now,
    createdAt: input.now,
    updatedAt: null,
  };

  return {
    profiles: [
      ...input.profiles.map((profile) =>
        profilesToArchive.some((archived) => archived.id === profile.id)
          ? {
              ...profile,
              status: "archived" as const,
              updatedAt: input.now,
            }
          : profile,
      ),
      nextProfile,
    ],
    currentProfile: nextProfile,
    cleanupJobs: profilesToArchive.map((profile) => ({
      profileId: profile.id,
      refAudioAssetId: profile.refAudioAssetId,
      externalVoiceId: profile.externalVoiceId ?? null,
      externalModelId: profile.externalModelId ?? null,
      reason: "voice_profile_replaced",
      status: "pending",
      createdAt: input.now,
    })),
  };
}

export function findCurrentVoiceProfile(
  profiles: VoiceProfileStateRecord[],
  input: {
    merchantId: string;
    createdByUserId: string;
  },
) {
  return (
    profiles.find(
      (profile) =>
        profile.merchantId === input.merchantId &&
        profile.createdByUserId === input.createdByUserId &&
        profile.status === "ready",
    ) ?? null
  );
}

export function assertUsableVoiceProfile(
  profiles: VoiceProfileStateRecord[],
  input: {
    merchantId: string;
    createdByUserId: string;
    voiceProfileId: string;
  },
) {
  const profile = profiles.find(
    (candidate) =>
      candidate.id === input.voiceProfileId &&
      candidate.merchantId === input.merchantId &&
      candidate.createdByUserId === input.createdByUserId &&
      candidate.status === "ready",
  );

  if (!profile) {
    throw new VoiceProfileRuleError("VOICE_PROFILE_NOT_FOUND", "Voice profile not found.");
  }

  return profile;
}
