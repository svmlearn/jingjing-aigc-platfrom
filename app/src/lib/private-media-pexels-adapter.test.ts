import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPexelsPhotoSearchResponse,
  buildPexelsVideoSearchResponse,
  searchPrivateMediaClips,
  type PrivateMediaClipRecord,
  type PrivateMediaDownloadKind,
} from "./private-media-pexels-adapter.ts";

const now = "2026-05-15T00:00:00.000Z";
const expiresAt = "2026-07-14T00:00:00.000Z";

test("searchPrivateMediaClips explicitly filters by merchant_id and ready status", () => {
  const results = searchPrivateMediaClips({
    clips,
    merchantId: "merchant-a",
    mediaType: "video",
    query: "",
  });

  assert.deepEqual(results.map((clip) => clip.id), ["video-a-2", "video-a-1"]);
});

test("buildPexelsVideoSearchResponse returns OpenStoryline-compatible video JSON without internals", () => {
  const response = buildPexelsVideoSearchResponse({
    clips,
    merchantId: "merchant-a",
    query: "nearby shops",
    page: 1,
    perPage: 10,
    now,
    signDownloadUrl,
  });
  const serialized = JSON.stringify(response);

  assert.equal(response.videos.length, 1);
  assert.equal(response.videos[0]?.video_files[0]?.link.includes("/api/private-media/download/"), true);
  assert.equal(response.next_page, null);
  assertNoInternalFields(serialized);
});

test("buildPexelsPhotoSearchResponse returns Pexels-like photo JSON without storage keys or tags", () => {
  const response = buildPexelsPhotoSearchResponse({
    clips,
    merchantId: "merchant-a",
    query: "living room",
    page: 1,
    perPage: 10,
    now,
    signDownloadUrl,
  });
  const serialized = JSON.stringify(response);

  assert.equal(response.photos.length, 1);
  assert.equal(response.photos[0]?.src.original.includes("/api/private-media/download/"), true);
  assert.equal(response.photos[0]?.src.landscape.includes("landscape"), true);
  assertNoInternalFields(serialized);
});

test("Pexels-compatible pagination caps per_page and does not repeat consecutive pages", () => {
  const firstPage = buildPexelsVideoSearchResponse({
    clips,
    merchantId: "merchant-a",
    page: 1,
    perPage: 1,
    now,
    signDownloadUrl,
  });
  const secondPage = buildPexelsVideoSearchResponse({
    clips,
    merchantId: "merchant-a",
    page: 2,
    perPage: 1,
    now,
    signDownloadUrl,
  });
  const capped = buildPexelsVideoSearchResponse({
    clips,
    merchantId: "merchant-a",
    page: 1,
    perPage: 999,
    now,
    signDownloadUrl,
  });

  assert.equal(firstPage.per_page, 1);
  assert.equal(firstPage.next_page, "/api/private-media/pexels/videos/search?page=2&per_page=1");
  assert.notEqual(firstPage.videos[0]?.id, secondPage.videos[0]?.id);
  assert.equal(capped.per_page, 80);
});

test("Pexels-compatible response skips clips whose download URL is shorter than 60 days", () => {
  const response = buildPexelsVideoSearchResponse({
    clips,
    merchantId: "merchant-a",
    query: "nearby shops",
    page: 1,
    perPage: 10,
    now,
    signDownloadUrl: (clip, kind) => ({
      url: signedUrl(clip, kind),
      expiresAt: "2026-06-01T00:00:00.000Z",
    }),
  });

  assert.equal(response.total_results, 0);
  assert.deepEqual(response.videos, []);
});

function signDownloadUrl(clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) {
  return {
    url: signedUrl(clip, kind),
    expiresAt,
  };
}

function signedUrl(clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) {
  return `https://app.example.com/api/private-media/download/${clip.id}-${kind}?expires_at=${encodeURIComponent(expiresAt)}`;
}

function assertNoInternalFields(serialized: string) {
  assert.equal(serialized.includes("merchantId"), false);
  assert.equal(serialized.includes("merchant-a"), false);
  assert.equal(serialized.includes("merchant-b"), false);
  assert.equal(serialized.includes("storageKey"), false);
  assert.equal(serialized.includes("bucketName"), false);
  assert.equal(serialized.includes("merchant-media/"), false);
  assert.equal(serialized.includes("tags"), false);
  assert.equal(serialized.includes("sceneTags"), false);
}

const clips: PrivateMediaClipRecord[] = [
  {
    id: "video-a-1",
    merchantId: "merchant-a",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Project entrance with nearby shops and readable signage.",
    tags: ["project", "entrance", "shops"],
    sceneTags: ["exterior"],
    shotTags: ["wide"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/video-a-1.mp4",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/video-a-1.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-14T00:00:00.000Z",
  },
  {
    id: "video-a-2",
    merchantId: "merchant-a",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 12,
    orientation: "portrait",
    description: "Recent verified project lobby detail.",
    tags: ["project", "lobby"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/video-a-2.mp4",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/video-a-2.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "video-b-1",
    merchantId: "merchant-b",
    mediaType: "video",
    status: "ready",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Project entrance from another merchant.",
    tags: ["project", "entrance"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-b/clips/video-b-1.mp4",
    thumbStorageKey: "merchant-media/merchant-b/thumbs/video-b-1.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "video-a-tagging-failed",
    merchantId: "merchant-a",
    mediaType: "video",
    status: "tagging_failed",
    width: 1080,
    height: 1920,
    durationSeconds: 8,
    orientation: "portrait",
    description: "Should not be searchable.",
    tags: ["project", "entrance"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/video-a-bad.mp4",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/video-a-bad.jpg",
    mimeType: "video/mp4",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "photo-a-1",
    merchantId: "merchant-a",
    mediaType: "image",
    status: "ready",
    width: 1600,
    height: 900,
    orientation: "landscape",
    description: "Living room with daylight and clean circulation.",
    tags: ["living", "room", "daylight"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/photo-a-1.jpg",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/photo-a-1.jpg",
    mimeType: "image/jpeg",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
];
