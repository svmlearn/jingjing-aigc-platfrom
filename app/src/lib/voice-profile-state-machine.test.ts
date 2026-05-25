import assert from "node:assert/strict";
import test from "node:test";

import {
  VoiceProfileRuleError,
  assertUsableVoiceProfile,
  replaceCurrentVoiceProfile,
  type VoiceProfileStateRecord,
} from "./voice-profile-state-machine.ts";

const merchantA = "merchant-a";
const merchantB = "merchant-b";
const userA = "user-a";
const userB = "user-b";
const now = "2026-05-15T00:00:00.000Z";

test("replaceCurrentVoiceProfile keeps only one ready profile for a merchant user after Aliyun clone success", () => {
  const oldProfile = profile({
    id: "voice-old",
    merchantId: merchantA,
    createdByUserId: userA,
    refAudioAssetId: "audio-old",
      externalVoiceId: "aliyun-old",
  });
  const otherUserProfile = profile({
    id: "voice-other-user",
    merchantId: merchantA,
    createdByUserId: userB,
    refAudioAssetId: "audio-other-user",
  });
  const otherMerchantProfile = profile({
    id: "voice-other-merchant",
    merchantId: merchantB,
    createdByUserId: userA,
    refAudioAssetId: "audio-other-merchant",
  });

  const result = replaceCurrentVoiceProfile({
    profiles: [oldProfile, otherUserProfile, otherMerchantProfile],
    candidate: {
      id: "voice-new",
      merchantId: merchantA,
      createdByUserId: userA,
      displayName: "new voice",
      refAudioAssetId: "audio-new",
    },
    providerResult: {
      ok: true,
      externalVoiceId: "aliyun-new",
      externalModelId: "model-new",
    },
    now,
  });

  assert.equal(result.currentProfile?.id, "voice-new");
  assert.equal(result.currentProfile?.provider, "aliyun_cosyvoice_clone");
  assert.equal(result.currentProfile?.externalVoiceId, "aliyun-new");
  assert.equal(
    result.profiles.filter(
      (candidate) =>
        candidate.merchantId === merchantA &&
        candidate.createdByUserId === userA &&
        candidate.status === "ready",
    ).length,
    1,
  );
  assert.equal(result.profiles.find((candidate) => candidate.id === "voice-old")?.status, "archived");
  assert.equal(result.profiles.find((candidate) => candidate.id === "voice-other-user")?.status, "ready");
  assert.equal(result.profiles.find((candidate) => candidate.id === "voice-other-merchant")?.status, "ready");
  assert.deepEqual(result.cleanupJobs.map((job) => job.profileId), ["voice-old"]);
});

test("replaceCurrentVoiceProfile keeps the old voice when Aliyun clone fails", () => {
  const oldProfile = profile({
    id: "voice-old",
    merchantId: merchantA,
    createdByUserId: userA,
    refAudioAssetId: "audio-old",
  });

  const result = replaceCurrentVoiceProfile({
    profiles: [oldProfile],
    candidate: {
      id: "voice-new",
      merchantId: merchantA,
      createdByUserId: userA,
      displayName: "new voice",
      refAudioAssetId: "audio-new",
    },
    providerResult: {
      ok: false,
      code: "ALIYUN_COSYVOICE_CLONE_FAILED",
      message: "mock provider failure",
    },
    now,
  });

  assert.equal(result.currentProfile?.id, oldProfile.id);
  assert.equal(result.providerFailure?.code, "ALIYUN_COSYVOICE_CLONE_FAILED");
  assert.deepEqual(result.cleanupJobs, []);
  assert.deepEqual(result.profiles, [oldProfile]);
  assert.equal(
    assertUsableVoiceProfile(result.profiles, {
      merchantId: merchantA,
      createdByUserId: userA,
      voiceProfileId: oldProfile.id,
    }).id,
    oldProfile.id,
  );
});

test("replaceCurrentVoiceProfile is idempotent for the same preallocated profile and audio", () => {
  const existing = profile({
    id: "voice-current",
    merchantId: merchantA,
    createdByUserId: userA,
    refAudioAssetId: "audio-current",
  });

  const result = replaceCurrentVoiceProfile({
    profiles: [existing],
    candidate: {
      id: existing.id,
      merchantId: merchantA,
      createdByUserId: userA,
      displayName: "current voice",
      refAudioAssetId: existing.refAudioAssetId,
    },
    providerResult: {
      ok: false,
      code: "SHOULD_NOT_REPLACE",
      message: "idempotent retries do not replace the existing voice",
    },
    now,
  });

  assert.equal(result.currentProfile?.id, existing.id);
  assert.deepEqual(result.profiles, [existing]);
  assert.deepEqual(result.cleanupJobs, []);
});

test("assertUsableVoiceProfile rejects another user's voice profile", () => {
  const profiles = [
    profile({
      id: "voice-private",
      merchantId: merchantA,
      createdByUserId: userA,
      refAudioAssetId: "audio-private",
    }),
  ];

  assert.throws(
    () =>
      assertUsableVoiceProfile(profiles, {
        merchantId: merchantA,
        createdByUserId: userB,
        voiceProfileId: "voice-private",
      }),
    (error) =>
      error instanceof VoiceProfileRuleError &&
      error.code === "VOICE_PROFILE_NOT_FOUND",
  );
});

test("replaceCurrentVoiceProfile rejects a preallocated id already owned by another user", () => {
  const profiles = [
    profile({
      id: "voice-conflict",
      merchantId: merchantA,
      createdByUserId: userA,
      refAudioAssetId: "audio-private",
    }),
  ];

  assert.throws(
    () =>
      replaceCurrentVoiceProfile({
        profiles,
        candidate: {
          id: "voice-conflict",
          merchantId: merchantA,
          createdByUserId: userB,
          displayName: "conflict",
          refAudioAssetId: "audio-other",
        },
        providerResult: { ok: true },
        now,
      }),
    (error) =>
      error instanceof VoiceProfileRuleError &&
      error.code === "VOICE_PROFILE_ID_CONFLICT",
  );
});

function profile(overrides: Partial<VoiceProfileStateRecord> & Pick<VoiceProfileStateRecord, "id">) {
  return {
    merchantId: merchantA,
    createdByUserId: userA,
    displayName: "voice",
    status: "ready",
    provider: "aliyun_cosyvoice_clone",
    externalVoiceId: null,
    externalModelId: null,
    refAudioAssetId: "audio",
    authorizationAcceptedAt: "2026-05-14T00:00:00.000Z",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: null,
    ...overrides,
  } satisfies VoiceProfileStateRecord;
}
