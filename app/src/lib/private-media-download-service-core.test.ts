import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivateMediaDownloadToken,
} from "./private-media-download-token.ts";
import {
  InMemoryPrivateMediaClipRepository,
} from "./private-media-fixture-repository.ts";
import {
  resolvePrivateMediaDownload,
  type PrivateMediaReadUrlSigner,
} from "./private-media-download-service-core.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

const now = "2026-05-15T00:00:00.000Z";
const expiresAt = "2026-07-14T00:00:00.000Z";
const secret = "test-private-media-download-secret";

test("private media download resolves valid token to server-signed read URL without exposing storage key in token route", async () => {
  const result = await resolvePrivateMediaDownload({
    token: tokenFor("ready-video", "video"),
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository(clips),
    signReadUrl,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 302);
    assert.equal(result.contentType, "video/mp4");
    assert.equal(result.contentDisposition, "inline");
    assert.equal(result.location, "https://cos.example.com/signed?key=merchant-media%2Fmerchant-a%2Foriginals%2Fasset-1%2Fsource.mp4&type=video%2Fmp4");
    assert.equal(result.payload.clipId, "ready-video");
  }
});

test("private media download rejects expired or tampered tokens", async () => {
  const expired = await resolvePrivateMediaDownload({
    token: createPrivateMediaDownloadToken({
      secret,
      payload: {
        clipId: "ready-video",
        kind: "video",
        expiresAt: now,
      },
    }),
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository(clips),
    signReadUrl,
  });
  const tampered = await resolvePrivateMediaDownload({
    token: `${tokenFor("ready-video", "video")}x`,
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository(clips),
    signReadUrl,
  });

  assert.equal(expired.ok, false);
  assert.equal(tampered.ok, false);
  if (!expired.ok) {
    assert.equal(expired.code, "PRIVATE_MEDIA_DOWNLOAD_EXPIRED");
  }
  if (!tampered.ok) {
    assert.equal(tampered.code, "PRIVATE_MEDIA_DOWNLOAD_TOKEN_INVALID");
  }
});

test("private media download blocks revoked, archived, quarantined, and missing objects even before token expiry", async () => {
  for (const [clipId, expectedCode] of [
    ["tagging-failed-video", "PRIVATE_MEDIA_DOWNLOAD_REVOKED"],
    ["archived-video", "PRIVATE_MEDIA_DOWNLOAD_ARCHIVED"],
    ["quarantined-video", "PRIVATE_MEDIA_DOWNLOAD_QUARANTINED"],
    ["missing-video", "PRIVATE_MEDIA_DOWNLOAD_MISSING_OBJECT"],
  ] as const) {
    const result = await resolvePrivateMediaDownload({
      token: tokenFor(clipId, "video"),
      secret,
      now,
      repository: new InMemoryPrivateMediaClipRepository(clips),
      signReadUrl,
    });

    assert.equal(result.ok, false, clipId);
    if (!result.ok) {
      assert.equal(result.status, 410);
      assert.equal(result.code, expectedCode);
    }
  }
});

test("private media download signs thumbnail key for thumb requests", async () => {
  const result = await resolvePrivateMediaDownload({
    token: tokenFor("ready-video", "thumb"),
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository(clips),
    signReadUrl,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.contentType, "image/jpeg");
    assert.equal(result.location, "https://cos.example.com/signed?key=merchant-media%2Fmerchant-a%2Fthumbs%2Fasset-1%2Fclip-1.jpg&type=image%2Fjpeg");
  }
});

test("private media download prefers provider-neutral storage key aliases", async () => {
  const result = await resolvePrivateMediaDownload({
    token: tokenFor("alias-video", "video"),
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository([
      {
        ...readyVideo,
        id: "alias-video",
        storageKey: "merchant-media/merchant-a/originals/asset-1/source-alias.mp4",
        thumbStorageKey: "merchant-media/merchant-a/thumbs/asset-1/clip-alias.jpg",
      },
    ]),
    signReadUrl,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.location, "https://cos.example.com/signed?key=merchant-media%2Fmerchant-a%2Foriginals%2Fasset-1%2Fsource-alias.mp4&type=video%2Fmp4");
  }

  const thumb = await resolvePrivateMediaDownload({
    token: tokenFor("alias-video", "thumb"),
    secret,
    now,
    repository: new InMemoryPrivateMediaClipRepository([
      {
        ...readyVideo,
        id: "alias-video",
        storageKey: "merchant-media/merchant-a/originals/asset-1/source-alias.mp4",
        thumbStorageKey: "merchant-media/merchant-a/thumbs/asset-1/clip-alias.jpg",
      },
    ]),
    signReadUrl,
  });

  assert.equal(thumb.ok, true);
  if (thumb.ok) {
    assert.equal(thumb.location, "https://cos.example.com/signed?key=merchant-media%2Fmerchant-a%2Fthumbs%2Fasset-1%2Fclip-alias.jpg&type=image%2Fjpeg");
  }
});

function tokenFor(clipId: string, kind: "video" | "thumb") {
  return createPrivateMediaDownloadToken({
    secret,
    payload: {
      clipId,
      kind,
      expiresAt,
    },
  });
}

const signReadUrl: PrivateMediaReadUrlSigner = (input) =>
  `https://cos.example.com/signed?key=${encodeURIComponent(input.storageKey)}&type=${encodeURIComponent(input.responseContentType)}`;

const readyVideo: PrivateMediaClipRecord = {
  id: "ready-video",
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
  bucketName: "private-bucket",
  cosKey: "merchant-media/merchant-a/originals/asset-1/source.mp4",
  thumbCosKey: "merchant-media/merchant-a/thumbs/asset-1/clip-1.jpg",
  mimeType: "video/mp4",
  createdAt: now,
};

const clips: PrivateMediaClipRecord[] = [
  readyVideo,
  {
    ...readyVideo,
    id: "tagging-failed-video",
    status: "tagging_failed",
  },
  {
    ...readyVideo,
    id: "archived-video",
    status: "archived",
  },
  {
    ...readyVideo,
    id: "quarantined-video",
    status: "quarantined",
  },
  {
    ...readyVideo,
    id: "missing-video",
    status: "missing_object",
  },
];
