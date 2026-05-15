import assert from "node:assert/strict";
import test from "node:test";

import { buildDifyMainlineDraftInput } from "./dify-content-generation-mainline.ts";
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
  const difyBuilt = buildDifyMainlineDraftInput({
    source: "consultation_calendar",
    consultationSessionId: "session-1",
    calendarItemId: "calendar-1",
    strategyTag: "project_walkthrough",
    rewriteGoal: "Use private project media.",
    finalResult: difyFixture,
  });

  assert.equal(difyBuilt.ok, true);
  if (!difyBuilt.ok) {
    return;
  }

  const videoVariant = difyBuilt.draft.variants.find((variant) => variant.variantType === "video_script");
  assert.ok(videoVariant?.scriptText);
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-private-media-fixture",
    variant: {
      contentVariantId: "variant-private-media-video",
      draftId: "draft-private-media-fixture",
      scriptText: videoVariant.scriptText,
      productionScenes: videoVariant.productionScenes,
      reviewStatus: "approved",
    },
    materialReferences: [],
    assets: [],
    now,
  });
  assert.equal(payload.materialContext.sceneAssetQueries[0]?.query.includes("project entrance shops"), true);

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
    clientExposedEnvKeys: ["NEXT_PUBLIC_SUPABASE_URL"],
    pendingUploads: [],
    orphanCosKeys: [],
    cleanupJobs: [],
    maxAutoReadyVideoDurationSeconds: 180,
  });
  assert.deepEqual(cleanDoctorIssues, []);
});

const difyFixture = {
  workflowVersion: "dify-v3.1",
  status: "succeeded",
  article: {
    title: "Private project media note",
    coverCopy: "Real entrance, real scene",
    images: [
      {
        cosPath: "cos://fixture/article-cover.jpg",
        role: "cover",
      },
    ],
    copyText: "A note generated from the private-media fixture flow.",
    hashtags: ["#project", "#entrance"],
    ctaText: "Ask for the viewing route.",
  },
  video: {
    title: "Private project entrance video",
    storyOutline: "Use private merchant media instead of public stock footage.",
    estimatedDuration: 60,
    scenes: [
      {
        sceneNo: 1,
        timeRange: "00:00-00:08",
        durationSec: 8,
        sceneType: "location_broll",
        title: "Entrance",
        purpose: "Show the real project entrance.",
        requiresUserUpload: false,
        taskDescription: "Use a private clip of the project entrance.",
        visualDescription: "Project entrance with nearby shops.",
        voiceover: "Start from the real entrance that buyers can verify.",
        subtitle: "Verify the entrance first.",
        filmingGuide: {
          props: ["project sign"],
        },
        shotLanguage: {
          cameraMovement: "slow push",
        },
        assetQuery: "project entrance shops",
        fallbackVisual: "Use a lobby clip if entrance media is unavailable.",
      },
    ],
    ctaText: "Ask for a visit.",
  },
  quality: {
    status: "passed",
    pass: true,
    blockingReasons: [],
    missingInputs: [],
  },
  debug: {
    fixtureSmoke: true,
  },
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
