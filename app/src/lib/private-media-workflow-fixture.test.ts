import assert from "node:assert/strict";
import test from "node:test";

import { runPrivateMediaDoctor } from "./private-media-doctor.ts";
import {
  InMemoryPrivateMediaClipRepository,
  fixturePrivateMediaClips,
} from "./private-media-fixture-repository.ts";
import { searchPrivateMediaPexels } from "./private-media-pexels-service-core.ts";
import { resolvePrivateMediaDownload } from "./private-media-download-service-core.ts";
import {
  verifyPrivateMediaDownloadToken,
} from "./private-media-download-token.ts";
import { buildVideoEditJobInputPayload } from "../server/api/video-job-payload.ts";
import type { MerchantMediaAssetRecord } from "./merchant-media-library-contract.ts";
import type { VoiceProfileStateRecord } from "./voice-profile-state-machine.ts";

const now = "2026-05-15T00:00:00.000Z";
const tokenSecret = "fixture-workflow-secret";

test("private media Dify-to-OpenStoryline workflow has a fixture-level smoke substitute", async () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-private-media-fixture",
    variant: {
      contentVariantId: "variant-private-media-video",
      draftId: "draft-private-media-fixture",
      scriptText: privateMediaVideoScript.scriptText,
      productionScenes: privateMediaVideoScript.productionScenes,
      reviewStatus: "approved",
    },
    materialReferences: [],
    assets: [
      {
        id: "fixture-user-talking-head",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "fixture-private-bucket",
        storageKey: "draft-inputs/demo-merchant-local/draft-private-media-fixture/opening.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    merchantMediaClips: [v1WorkflowClip],
    requireUserTalkingHead: true,
    now,
  });
  assert.equal(payload.materialContext.sceneAssetQueries[0]?.query.includes("project entrance shops"), true);
  assert.deepEqual(payload.materialContext.userTalkingHeadAssetIds, ["fixture-user-talking-head"]);
  assert.equal(payload.materialContext.merchantMediaMatches[0]?.clipIds.includes("fixture-video-a-entrance"), true);
  assert.equal(payload.input_assets[0]?.asset_id, "fixture-user-talking-head");
  const rawPayload = payload as Record<string, unknown>;
  assert.equal(rawPayload.workflowVersion, undefined);
  assert.equal(rawPayload.outputs, undefined);
  assert.equal(rawPayload.article, undefined);
  assert.equal(rawPayload.video, undefined);
  assert.equal(rawPayload.quality, undefined);

  const previousTokenSecret = process.env.PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET;
  process.env.PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET = tokenSecret;
  const repository = new InMemoryPrivateMediaClipRepository([
    v1WorkflowClip,
    ...fixturePrivateMediaClips.filter((clip) => clip.id !== v1WorkflowClip.id),
  ]);
  const pexels = await searchPrivateMediaPexels({
    merchantId: "demo-merchant-local",
    kind: "video",
    requestUrl: "https://app.local/api/private-media/pexels/videos/search?query=entrance%20shops&page=1&per_page=10",
    repository,
    now,
  });
  if (previousTokenSecret == null) {
    delete process.env.PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET;
  } else {
    process.env.PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET = previousTokenSecret;
  }
  assert.equal(pexels.videos.length, 1);
  const videoUrl = pexels.videos[0]?.video_files[0]?.link;
  assert.ok(videoUrl);
  assert.equal(videoUrl.includes("fixture-video-b-entrance"), false);
  assert.equal(videoUrl.includes("cosKey"), false);
  assert.equal(videoUrl.includes("/api/private-media/download/"), true);

  const token = decodeURIComponent(new URL(videoUrl).pathname.split("/").at(-1) ?? "");
  const tokenPayload = verifyPrivateMediaDownloadToken({
    token,
    secret: tokenSecret,
    now,
  });
  assert.equal(tokenPayload.ok, true);
  if (tokenPayload.ok) {
    assert.equal(tokenPayload.payload.clipId, "fixture-video-a-entrance");
    assert.equal(Date.parse(tokenPayload.payload.expiresAt) - Date.parse(now) >= 60 * 24 * 60 * 60 * 1000, true);
  }

  const download = await resolvePrivateMediaDownload({
    token,
    secret: tokenSecret,
    now,
    repository,
    signReadUrl: ({ storageKey }) => `https://cos.local/${encodeURIComponent(storageKey)}?signed=1`,
  });
  assert.equal(download.ok, true);
  if (download.ok) {
    assert.equal(download.status, 302);
    assert.equal(download.location.includes("merchant-media%2Fdemo-merchant-local%2Fclips%2Ffixture-video-a-entrance.mp4"), true);
    assert.equal(download.contentDisposition, "inline");
  }

  const cleanDoctorIssues = runPrivateMediaDoctor({
    assets: [fixtureAsset],
    clips: [v1WorkflowClip],
    voiceProfiles: [fixtureVoiceProfile],
    now,
    existingCosKeys: [
      v1WorkflowClip.cosKey,
      v1WorkflowClip.thumbCosKey!,
    ],
    publicBuckets: [],
    clientExposedEnvKeys: ["NEXT_PUBLIC_SUPA\x42ASE_URL"],
    pendingUploads: [],
    orphanCosKeys: [],
    cleanupJobs: [],
    maxAutoReadyVideoDurationSeconds: 180,
  });
  assert.deepEqual(cleanDoctorIssues, []);
});

const privateMediaVideoScript = {
  scriptText: [
    "Private project entrance video",
    "Use private merchant media instead of public stock footage.",
    "Scene 1 | 00:00-00:08",
    "Visual: Project entrance with nearby shops.",
    "Task: Use a private clip of the project entrance.",
    "Voiceover: Start from the real entrance that buyers can verify.",
  ].join("\n"),
  productionScenes: [
    {
      sceneNo: 1,
      timeRange: "00:00-00:08",
      shotRequirement: "Use a private clip of the project entrance.",
      visual: "Project entrance with nearby shops.",
      voiceover: "Start from the real entrance that buyers can verify.",
      subtitle: "Verify the entrance first.",
      materials: ["project entrance shops", "project sign"],
      cameraMovement: "slow push",
      purpose: "Show the real project entrance.",
      fallbackShot: "Use a lobby clip if entrance media is unavailable.",
    },
  ],
};

const v1WorkflowClip = {
  ...fixturePrivateMediaClips[0]!,
  assetId: "fixture-asset-a-entrance",
  clipIndex: 0,
  clipType: "full_video",
  startTimeSeconds: 0,
  endTimeSeconds: fixturePrivateMediaClips[0]!.durationSeconds,
  tagConfidence: 0.86,
  tagSource: "fixture",
} as const;

const fixtureAsset: MerchantMediaAssetRecord = {
  id: "fixture-asset-a-entrance",
  merchantId: "demo-merchant-local",
  uploadedByUserId: "user-a",
  mediaType: "video",
  source: "merchant_upload",
  sourceCosKey: v1WorkflowClip.cosKey,
  status: "ready",
  createdAt: now,
};

const fixtureVoiceProfile = {
  id: "voice-a",
  merchantId: "demo-merchant-local",
  createdByUserId: "user-a",
  displayName: "voice",
  status: "ready",
  provider: "pixelle_clone",
  externalVoiceId: "voice-a",
  externalModelId: null,
  refAudioAssetId: "voice-a-audio",
  authorizationAcceptedAt: now,
  createdAt: now,
  updatedAt: null,
} satisfies VoiceProfileStateRecord;
