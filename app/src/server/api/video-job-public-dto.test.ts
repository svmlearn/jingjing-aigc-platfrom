import assert from "node:assert/strict";
import test from "node:test";

import type { VideoEditJobDto } from "@/contracts/video";

import { toPublicVideoEditJob } from "./video-job-public-dto.ts";

const baseJob: VideoEditJobDto = {
  id: "job-1",
  merchantId: "merchant-1",
  createdByUserId: "user-1",
  draftId: "draft-1",
  contentVariantId: "variant-1",
  status: "running",
  currentStage: "openstoryline_voiceover",
  triggerSource: "manual",
  instructionText: "Make it warmer",
  inputPayload: {
    source: "video_workbench",
    secretWorkerInput: true,
  },
  runtimePayload: {
    progress_modules: [
      {
        key: "voiceover",
        label: "Voiceover",
        status: "running",
        progress_pct: 55,
      },
    ],
  },
  progressPct: 55,
  retryCount: 0,
  failureReason: null,
  resultPayload: {
    resultAssets: [
      {
        id: "asset-1",
        ownerId: "variant-1",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "bucket",
        storageKey: "outputs/final.mp4",
        originUrl: "https://example.com/final.mp4",
      },
    ],
  },
  logPayload: {
    steps: ["internal"],
  },
  progressModules: [
    {
      key: "voiceover",
      label: "Voiceover",
      status: "running",
      progressPct: 55,
    },
  ],
  startedAt: "2026-05-13T01:00:00.000Z",
  finishedAt: null,
  createdAt: "2026-05-13T00:59:00.000Z",
  updatedAt: "2026-05-13T01:01:00.000Z",
};

test("toPublicVideoEditJob removes internal payload fields", () => {
  const publicJob = toPublicVideoEditJob(baseJob);
  const raw = publicJob as Record<string, unknown>;

  assert.deepEqual(Object.keys(publicJob).sort(), [
    "calendarItemId",
    "contentVariantId",
    "createdAt",
    "currentStage",
    "dailyTaskId",
    "draftId",
    "failureReason",
    "finishedAt",
    "id",
    "instructionText",
    "progressModules",
    "progressPct",
    "resultAssets",
    "retryCount",
    "startedAt",
    "status",
    "triggerSource",
    "updatedAt",
  ]);
  assert.equal(raw.inputPayload, undefined);
  assert.equal(raw.runtimePayload, undefined);
  assert.equal(raw.resultPayload, undefined);
  assert.equal(raw.logPayload, undefined);
  assert.equal(publicJob.id, "job-1");
  assert.equal(publicJob.progressModules[0]?.key, "voiceover");
});

test("toPublicVideoEditJob exposes member task linkage without leaking worker payload", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    inputPayload: {
      source: "video_workbench",
      secretWorkerInput: true,
      materialContext: {
        dailyTaskId: "11111111-1111-4111-8111-111111111111",
        calendarItemId: "calendar-video-1",
      },
    },
  });
  const raw = publicJob as Record<string, unknown>;

  assert.equal(publicJob.dailyTaskId, "11111111-1111-4111-8111-111111111111");
  assert.equal(publicJob.calendarItemId, "calendar-video-1");
  assert.equal(raw.inputPayload, undefined);
  assert.equal(raw.secretWorkerInput, undefined);
});

test("toPublicVideoEditJob exposes result assets at the top level", () => {
  const publicJob = toPublicVideoEditJob(baseJob);

  assert.equal(publicJob.resultAssets?.length, 1);
  assert.equal(publicJob.resultAssets?.[0]?.id, "asset-1");
  assert.equal(publicJob.resultAssets?.[0]?.signedPreviewUrl, "https://example.com/final.mp4");
});

test("toPublicVideoEditJob preserves explicit result asset download URL", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      resultAssets: [
        {
          id: "asset-1",
          ownerId: "variant-1",
          assetType: "video",
          storageProvider: "aliyun_oss",
          bucketName: "bucket",
          storageKey: "outputs/final.mp4",
          signedPreviewUrl: "/api/video-edit-jobs/job-1/result/asset-1?disposition=inline",
          signedDownloadUrl: "/api/video-edit-jobs/job-1/result/asset-1?disposition=attachment",
        },
      ],
    },
  });

  assert.equal(
    publicJob.resultAssets?.[0]?.signedPreviewUrl,
    "/api/video-edit-jobs/job-1/result/asset-1?disposition=inline",
  );
  assert.equal(
    publicJob.resultAssets?.[0]?.signedDownloadUrl,
    "/api/video-edit-jobs/job-1/result/asset-1?disposition=attachment",
  );
});

test("toPublicVideoEditJob keeps payload result asset types intact", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      resultAssets: [
        {
          id: "asset-cover-1",
          ownerId: "variant-1",
          assetType: "cover",
          storageProvider: "aliyun_oss",
          bucketName: "bucket",
          storageKey: "outputs/cover.jpg",
        },
        {
          id: "asset-subtitle-1",
          ownerId: "variant-1",
          assetType: "subtitle",
          storageProvider: "aliyun_oss",
          bucketName: "bucket",
          storageKey: "outputs/subtitles.srt",
        },
      ],
    },
  });

  assert.deepEqual(
    publicJob.resultAssets.map((asset) => asset.assetType),
    ["cover", "subtitle"],
  );
});

test("toPublicVideoEditJob maps worker uploaded assets to top-level result assets", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      uploaded_assets: [
        {
          asset_id: "asset-video-1",
          asset_type: "video",
          bucket_name: "bucket",
          storage_provider: "aliyun_oss",
          storage_key: "outputs/final.mp4",
          mime_type: "video/mp4",
          etag: "etag",
          file_size_bytes: 1024,
        },
      ],
    },
  });

  assert.equal(publicJob.resultAssets.length, 1);
  assert.equal(publicJob.resultAssets[0]?.id, "asset-video-1");
  assert.equal(publicJob.resultAssets[0]?.ownerId, "variant-1");
  assert.equal(publicJob.resultAssets[0]?.storageKey, "outputs/final.mp4");
});

test("toPublicVideoEditJob preserves Aliyun OSS worker uploaded assets", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      uploaded_assets: [
        {
          asset_id: "asset-video-aliyun-1",
          asset_type: "video",
          bucket_name: "jingjing-domestic-phase1-hz",
          storage_provider: "aliyun_oss",
          storage_key: "video-results/final.mp4",
          mime_type: "video/mp4",
          etag: "etag",
          file_size_bytes: 1024,
        },
      ],
    },
  });

  assert.equal(publicJob.resultAssets.length, 1);
  assert.equal(publicJob.resultAssets[0]?.storageProvider, "aliyun_oss");
  assert.equal(publicJob.resultAssets[0]?.bucketName, "jingjing-domestic-phase1-hz");
  assert.equal(publicJob.resultAssets[0]?.storageKey, "video-results/final.mp4");
});

test("toPublicVideoEditJob defaults missing worker result provider to Aliyun OSS", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      uploaded_assets: [
        {
          asset_id: "asset-video-missing-provider",
          asset_type: "video",
          bucket_name: "jingjing-domestic-phase1-hz",
          storage_key: "video-results/missing-provider.mp4",
        },
      ],
    },
  });

  assert.equal(publicJob.resultAssets.length, 1);
  assert.equal(publicJob.resultAssets[0]?.storageProvider, "aliyun_oss");
});

test("toPublicVideoEditJob defaults unknown worker result provider to Aliyun OSS", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      uploaded_assets: [
        {
          asset_id: "asset-video-unknown-provider",
          asset_type: "video",
          bucket_name: "jingjing-domestic-phase1-hz",
          storage_provider: "unknown_provider",
          storage_key: "video-results/unknown-provider.mp4",
        },
      ],
    },
  });

  assert.equal(publicJob.resultAssets.length, 1);
  assert.equal(publicJob.resultAssets[0]?.storageProvider, "aliyun_oss");
});

test("toPublicVideoEditJob defaults explicit historical removed storage payloads to Aliyun OSS", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultPayload: {
      uploaded_assets: [
        {
          asset_id: "asset-video-historical-provider",
          asset_type: "video",
          bucket_name: "legacy-bucket",
          storage_provider: "supabase_storage",
          storage_key: "legacy/video.mp4",
        },
      ],
    },
  });

  assert.equal(publicJob.resultAssets.length, 1);
  assert.equal(publicJob.resultAssets[0]?.storageProvider, "aliyun_oss");
});

test("toPublicVideoEditJob keeps explicit result assets before payload assets", () => {
  const publicJob = toPublicVideoEditJob({
    ...baseJob,
    resultAssets: [
      {
        id: "asset-explicit",
        ownerType: "content_variant",
        ownerId: "variant-1",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "bucket",
        storageKey: "outputs/explicit.mp4",
        originUrl: null,
        signedPreviewUrl: "/api/video-edit-jobs/job-1/result/asset-explicit",
        mimeType: "video/mp4",
        fileSizeBytes: null,
        etag: null,
        sortOrder: 0,
        createdAt: "2026-05-13T01:01:00.000Z",
        updatedAt: null,
      },
    ],
  });

  assert.equal(publicJob.resultAssets?.length, 1);
  assert.equal(publicJob.resultAssets?.[0]?.id, "asset-explicit");
  assert.equal(publicJob.resultAssets?.[0]?.signedPreviewUrl, "/api/video-edit-jobs/job-1/result/asset-explicit");
});
