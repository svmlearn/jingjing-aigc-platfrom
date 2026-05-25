import assert from "node:assert/strict";
import test from "node:test";

import {
  processMerchantRawUploadFixture,
  type ProcessedMediaTags,
} from "./media-processing-contract.ts";
import type { MerchantMediaAssetRecord } from "./merchant-media-library-contract.ts";

const now = "2026-05-15T00:00:00.000Z";

test("merchant raw upload fixture models raw_upload to processed_ready", () => {
  const result = processMerchantRawUploadFixture({
    asset: rawUploadAsset,
    detectedMimeType: "video/mp4",
    metadata: {
      mediaType: "video",
      width: 1080,
      height: 1920,
      durationSeconds: 8.4,
      mimeType: "video/mp4",
    },
    thumbnailCosKey: "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg",
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, "processed_ready");
    assert.deepEqual(result.stages, [
      "raw_upload",
      "post_upload_validated",
      "metadata_extracted",
      "clip_extracted",
      "thumbnail_generated",
      "tagged",
      "processed_ready",
    ]);
    assert.equal(result.readyAsset.status, "ready");
    assert.equal(result.readyClips.length, 1);
    assert.equal(result.readyClips[0]?.clipType, "full_video");
    assert.equal(result.readyClips[0]?.clipIndex, 0);
    assert.equal(result.readyClips[0]?.startTimeSeconds, 0);
    assert.equal(result.readyClips[0]?.endTimeSeconds, 8.4);
    assert.equal(result.readyClips[0]?.cosKey, rawUploadAsset.sourceCosKey);
    assert.equal(result.readyClips[0]?.storageKey, rawUploadAsset.sourceStorageKey ?? rawUploadAsset.sourceCosKey);
    assert.equal(result.readyClips[0]?.thumbStorageKey, "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg");
    assert.equal(result.readyClips[0]?.durationSeconds, 8.4);
    assert.equal(result.readyClips[0]?.orientation, "portrait");
  }
});

test("image raw upload fixture produces one deterministic image clip without video duration", () => {
  const imageAsset: MerchantMediaAssetRecord = {
    ...rawUploadAsset,
    id: "asset-image-1",
    mediaType: "image",
    sourceCosKey: "merchant-media/merchant-a/originals/asset-image-1/source.jpg",
  };
  const result = processMerchantRawUploadFixture({
    asset: imageAsset,
    detectedMimeType: "image/jpeg",
    metadata: {
      mediaType: "image",
      width: 1600,
      height: 900,
      durationSeconds: null,
      mimeType: "image/jpeg",
    },
    thumbnailCosKey: "merchant-media/merchant-a/thumbs/asset-image-1/clip-1.jpg",
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.readyClips.length, 1);
    assert.equal(result.readyClips[0]?.clipType, "image");
    assert.equal(result.readyClips[0]?.clipIndex, 0);
    assert.equal(result.readyClips[0]?.durationSeconds, null);
    assert.equal(result.readyClips[0]?.cosKey, imageAsset.sourceCosKey);
    assert.equal(result.readyClips[0]?.storageKey, imageAsset.sourceStorageKey ?? imageAsset.sourceCosKey);
  }
});

test("merchant raw upload fixture accepts provider-neutral thumbnail storage key", () => {
  const result = processMerchantRawUploadFixture({
    asset: {
      ...rawUploadAsset,
      sourceStorageKey: rawUploadAsset.sourceCosKey,
    },
    detectedMimeType: "video/mp4",
    metadata: {
      mediaType: "video",
      width: 1080,
      height: 1920,
      durationSeconds: 8.4,
      mimeType: "video/mp4",
    },
    thumbnailStorageKey: "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg",
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.readyClips[0]?.thumbCosKey, "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg");
    assert.equal(result.readyClips[0]?.thumbStorageKey, result.readyClips[0]?.thumbCosKey);
  }
});

test("merchant raw upload fixture rejects conflicting thumbnail key aliases", () => {
  const result = processMerchantRawUploadFixture({
    asset: rawUploadAsset,
    detectedMimeType: "video/mp4",
    metadata: {
      mediaType: "video",
      width: 1080,
      height: 1920,
      durationSeconds: 8.4,
      mimeType: "video/mp4",
    },
    thumbnailCosKey: "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg",
    thumbnailStorageKey: "merchant-media/merchant-a/thumbs/asset-raw-1/other.jpg",
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("thumbnailStorageKey must match thumbnailCosKey")));
  }
});

test("raw uploaded MP4 is not a ready clip without parsed metadata and thumbnail", () => {
  const result = processMerchantRawUploadFixture({
    asset: rawUploadAsset,
    detectedMimeType: "video/mp4",
    metadata: null,
    thumbnailCosKey: null,
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "processing_failed");
    assert.ok(result.errors.some((error) => error.includes("metadata extraction")));
    assert.ok(result.stages.includes("raw_upload"));
    assert.equal(result.stages.includes("processed_ready"), false);
  }
});

test("low confidence or incomplete tags go to needs_retag instead of Pexels-ready", () => {
  const result = processMerchantRawUploadFixture({
    asset: rawUploadAsset,
    detectedMimeType: "video/mp4",
    metadata: {
      mediaType: "video",
      width: 1920,
      height: 1080,
      durationSeconds: 10,
      mimeType: "video/mp4",
    },
    thumbnailCosKey: "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg",
    tags: {
      ...readyTags,
      tags: ["project", "entrance"],
      tagConfidence: 0.4,
    },
    now,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "needs_retag");
    assert.ok(result.errors.some((error) => error.includes("three tags")));
    assert.ok(result.errors.some((error) => error.includes("low tag confidence")));
  }
});

test("overlong video uses needs_reclip gate and does not silently trim the full_video clip", () => {
  const result = processMerchantRawUploadFixture({
    asset: rawUploadAsset,
    detectedMimeType: "video/mp4",
    metadata: {
      mediaType: "video",
      width: 1920,
      height: 1080,
      durationSeconds: 181,
      mimeType: "video/mp4",
    },
    maxAutoReadyVideoDurationSeconds: 180,
    thumbnailCosKey: "merchant-media/merchant-a/thumbs/asset-raw-1/clip-1.jpg",
    tags: readyTags,
    now,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "needs_reclip");
    assert.ok(result.errors.some((error) => error.includes("needs_reclip")));
    assert.equal(result.stages.includes("processed_ready"), false);
  }
});

test("member temporary uploads cannot be promoted into merchant media processing", () => {
  const result = processMerchantRawUploadFixture({
    asset: {
      ...rawUploadAsset,
      source: "member_task_temp",
      sourceCosKey: "draft-inputs/merchant-a/draft-1/source.mp4",
    },
    detectedMimeType: "video/mp4",
    metadata: null,
    thumbnailCosKey: null,
    tags: null,
    now,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "validation_failed");
    assert.ok(result.errors.some((error) => error.includes("merchant-side raw uploads")));
  }
});

const rawUploadAsset: MerchantMediaAssetRecord = {
  id: "asset-raw-1",
  merchantId: "merchant-a",
  uploadedByUserId: "user-a",
  mediaType: "video",
  source: "merchant_upload",
  sourceCosKey: "merchant-media/merchant-a/originals/asset-raw-1/source.mp4",
  status: "uploaded",
  createdAt: now,
};

const readyTags: ProcessedMediaTags = {
  description: "Project entrance and nearby commercial street suitable for opening shot.",
  tags: ["project", "entrance", "shops"],
  industryTags: ["real_estate"],
  sceneTags: ["exterior"],
  shotTags: ["wide"],
  qualityTags: ["stable"],
  tagConfidence: 0.86,
  tagSource: "fixture",
};
