import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrivateMediaClipRepository } from "../../lib/private-media-fixture-repository.ts";
import {
  verifyPrivateMediaDownloadToken,
  type PrivateMediaDownloadTokenPayload,
} from "../../lib/private-media-download-token.ts";
import type { PrivateMediaClipRecord } from "../../lib/private-media-pexels-adapter.ts";

import {
  getPrivateMediaDownloadTokenSecret,
  searchPrivateMediaPexels,
} from "../../lib/private-media-pexels-service-core.ts";

const now = "2026-05-15T00:00:00.000Z";
const requestUrl = "https://app.example.com/api/private-media/pexels/videos/search?query=entrance&per_page=10&page=1";

test("private Pexels video route service uses repository merchant filter and returns sanitized links", async () => {
  const repository = new AssertingRepository(clips);
  const response = await searchPrivateMediaPexels({
    merchantId: "merchant-a",
    requestUrl,
    kind: "video",
    repository,
    now,
  });
  const serialized = JSON.stringify(response);

  assert.equal(repository.lastMerchantId, "merchant-a");
  assert.equal(response.videos.length, 1);
  assert.equal(response.videos[0]?.id, "video-a-1");
  assert.equal(response.videos[0]?.video_files[0]?.link.startsWith("https://app.example.com/api/private-media/download/"), true);
  assertNoInternalFields(serialized);
});

test("private Pexels photo route service returns Pexels-like src fields", async () => {
  const response = await searchPrivateMediaPexels({
    merchantId: "merchant-a",
    requestUrl: "https://app.example.com/api/private-media/pexels/v1/search?query=living%20room",
    kind: "photo",
    repository: new InMemoryPrivateMediaClipRepository(clips),
    now,
  });

  assert.equal(response.photos.length, 1);
  assert.equal(response.photos[0]?.src.original.includes("/api/private-media/download/"), true);
  assert.equal(response.photos[0]?.src.landscape.includes("/api/private-media/download/"), true);
});

test("private media download token is at least sixty days and rejects tampering", async () => {
  const response = await searchPrivateMediaPexels({
    merchantId: "merchant-a",
    requestUrl,
    kind: "video",
    repository: new InMemoryPrivateMediaClipRepository(clips),
    now,
  });
  const link = response.videos[0]?.video_files[0]?.link;
  assert.ok(link);
  const token = decodeURIComponent(new URL(link).pathname.split("/").pop() ?? "");
  const verified = verifyPrivateMediaDownloadToken({
    token,
    secret: getPrivateMediaDownloadTokenSecret(),
    now,
  });

  assert.equal(verified.ok, true);
  const payload = (verified as { ok: true; payload: PrivateMediaDownloadTokenPayload }).payload;
  assert.equal(payload.clipId, "video-a-1");
  assert.equal(payload.kind, "video");
  assert.equal(Date.parse(payload.expiresAt) - Date.parse(now), 60 * 24 * 60 * 60 * 1000);

  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const tamperedResult = verifyPrivateMediaDownloadToken({
    token: tampered,
    secret: getPrivateMediaDownloadTokenSecret(),
    now,
  });
  assert.equal(tamperedResult.ok, false);
});

class AssertingRepository extends InMemoryPrivateMediaClipRepository {
  lastMerchantId: string | null = null;

  async listClipsByMerchant(input: { merchantId: string }) {
    this.lastMerchantId = input.merchantId;
    return super.listClipsByMerchant(input);
  }
}

function assertNoInternalFields(serialized: string) {
  assert.equal(serialized.includes("merchantId"), false);
  assert.equal(serialized.includes("merchant-a"), false);
  assert.equal(serialized.includes("merchant-b"), false);
  assert.equal(serialized.includes("storageKey"), false);
  assert.equal(serialized.includes("bucketName"), false);
  assert.equal(serialized.includes("merchant-media/"), false);
  assert.equal(serialized.includes("tags"), false);
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
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/video-a-1.mp4",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/video-a-1.jpg",
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
    description: "Other merchant entrance.",
    tags: ["project", "entrance"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-b/clips/video-b-1.mp4",
    thumbStorageKey: "merchant-media/merchant-b/thumbs/video-b-1.jpg",
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
    description: "Living room with daylight.",
    tags: ["living", "room", "daylight"],
    bucketName: "private-bucket",
    storageKey: "merchant-media/merchant-a/clips/photo-a-1.jpg",
    thumbStorageKey: "merchant-media/merchant-a/thumbs/photo-a-1.jpg",
    mimeType: "image/jpeg",
    createdAt: "2026-05-15T00:00:00.000Z",
  },
];
