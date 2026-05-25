import assert from "node:assert/strict";
import test from "node:test";

import {
  runPrivateMediaDoctor,
} from "./private-media-doctor.ts";
import type { MerchantMediaAssetRecord } from "./merchant-media-library-contract.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";
import type { VoiceProfileStateRecord } from "./voice-profile-state-machine.ts";

const now = "2026-05-15T00:00:00.000Z";

test("private media doctor passes clean full_video/segment clips and one current voice profile", () => {
  const issues = runPrivateMediaDoctor({
    assets: [asset],
    clips: [clip, segmentClip],
    voiceProfiles: [voiceProfile("voice-a")],
    maxAutoReadyVideoDurationSeconds: 180,
  });

  assert.deepEqual(issues, []);
});

test("private media doctor detects wrong sources and ready assets without ready clips", () => {
  const issues = runPrivateMediaDoctor({
    assets: [
      {
        ...asset,
        id: "member-temp",
        source: "member_task_temp",
      },
      {
        ...asset,
        id: "voice-audio",
        source: "voice_profile",
      },
      {
        ...asset,
        id: "no-clip",
      },
    ],
    clips: [],
    voiceProfiles: [],
  });

  assertIssueCodes(issues, [
    "wrong_source",
    "merchant_asset_without_ready_clip",
    "wrong_source",
    "merchant_asset_without_ready_clip",
    "merchant_asset_without_ready_clip",
  ]);
});

test("private media doctor detects slice and media readiness violations", () => {
  const issues = runPrivateMediaDoctor({
    assets: [asset],
    clips: [
      {
        ...clip,
        id: "clip-window",
        clipIndex: -1,
        startTimeSeconds: 5,
        endTimeSeconds: 10,
      },
      {
        ...clip,
        id: "clip-low-confidence",
        tagConfidence: 0.3,
      },
      {
        ...clip,
        id: "clip-no-thumb",
        thumbCosKey: null,
      },
      {
        ...clip,
        id: "clip-overlong",
        durationSeconds: 181,
        endTimeSeconds: 181,
      },
    ],
    voiceProfiles: [],
    maxAutoReadyVideoDurationSeconds: 180,
  });

  assertIssueCodes(issues, [
    "slice_policy_violation",
    "slice_boundary_violation",
    "low_confidence_ready_clip",
    "missing_thumbnail",
    "duration_gate_violation",
  ]);
});

test("private media doctor detects multiple ready voice profiles for the same merchant user", () => {
  const issues = runPrivateMediaDoctor({
    assets: [],
    clips: [],
    voiceProfiles: [
      voiceProfile("voice-a"),
      voiceProfile("voice-b"),
      voiceProfile("voice-other-user", { createdByUserId: "user-b" }),
    ],
  });

  assertIssueCodes(issues, ["multi_ready_voice_profile"]);
});

test("private media doctor detects storage security and pending cleanup blockers with fixtures", () => {
  const issues = runPrivateMediaDoctor({
    assets: [asset],
    clips: [clip],
    voiceProfiles: [voiceProfile("voice-a")],
    now,
    existingCosKeys: [
      "merchant-media/merchant-a/thumbs/asset-a/clip-1.jpg",
    ],
    publicBuckets: ["private-bucket"],
    clientExposedEnvKeys: [
      "NEXT_PUBLIC_SUPA\x42ASE_URL",
      "SUPA\x42ASE_SERVICE_ROLE_KEY",
      "COS_SECRET_KEY",
    ],
    pendingUploads: [
      {
        id: "intent-expired",
        status: "pending",
        expiresAt: "2026-05-14T00:00:00.000Z",
        storageKey: "source-assets/merchant-a/asset-a/source.mp4",
      },
    ],
    orphanCosKeys: ["source-assets/merchant-a/orphan/source.mp4"],
    cleanupJobs: [
      {
        id: "cleanup-stale",
        provider: "pixelle_clone",
        status: "pending",
        createdAt: "2026-05-13T00:00:00.000Z",
      },
    ],
    maxCleanupJobAgeHours: 24,
  });

  assertIssueCodes(issues, [
    "missing_object",
    "public_bucket",
    "public_bucket",
    "service_role_client_leak",
    "service_role_client_leak",
    "expired_pending_upload",
    "orphan_upload_object",
    "provider_cleanup_backlog",
  ]);
});

function assertIssueCodes(
  issues: ReturnType<typeof runPrivateMediaDoctor>,
  expected: string[],
) {
  assert.deepEqual(issues.map((issue) => issue.code).sort(), [...expected].sort());
}

const asset: MerchantMediaAssetRecord = {
  id: "asset-a",
  merchantId: "merchant-a",
  uploadedByUserId: "user-a",
  mediaType: "video",
  source: "merchant_upload",
  sourceCosKey: "merchant-media/merchant-a/originals/asset-a/source.mp4",
  status: "ready",
  createdAt: now,
};

const clip: PrivateMediaClipRecord = {
  id: "clip-a",
  assetId: "asset-a",
  merchantId: "merchant-a",
  mediaType: "video",
  status: "ready",
  clipIndex: 0,
  clipType: "full_video",
  startTimeSeconds: 0,
  endTimeSeconds: 8,
  width: 1080,
  height: 1920,
  durationSeconds: 8,
  orientation: "portrait",
  description: "Project entrance.",
  tags: ["project", "entrance", "shops"],
  tagConfidence: 0.86,
  tagSource: "fixture",
  bucketName: "private-bucket",
  cosKey: "merchant-media/merchant-a/originals/asset-a/source.mp4",
  thumbCosKey: "merchant-media/merchant-a/thumbs/asset-a/clip-1.jpg",
  mimeType: "video/mp4",
  createdAt: now,
};

const segmentClip: PrivateMediaClipRecord = {
  ...clip,
  id: "clip-segment",
  clipIndex: 1,
  clipType: "segment",
  startTimeSeconds: 3,
  endTimeSeconds: 7,
  durationSeconds: 4,
  cosKey: "merchant-media/merchant-a/clips/asset-a/clip-segment.mp4",
  thumbCosKey: "merchant-media/merchant-a/thumbs/asset-a/clip-segment.jpg",
};

function voiceProfile(
  id: string,
  overrides: Partial<VoiceProfileStateRecord> = {},
) {
  return {
    id,
    merchantId: "merchant-a",
    createdByUserId: "user-a",
    displayName: "voice",
    status: "ready",
    provider: "pixelle_clone",
    externalVoiceId: id,
    externalModelId: null,
    refAudioAssetId: `${id}-audio`,
    authorizationAcceptedAt: now,
    createdAt: now,
    updatedAt: null,
    ...overrides,
  } satisfies VoiceProfileStateRecord;
}
