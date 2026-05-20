import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryMerchantMediaRepository } from "../../lib/merchant-media-repository-contract.ts";
import { receiveMerchantMediaManifest } from "../../lib/merchant-media-manifest.ts";
import { searchPrivateMediaClips } from "../../lib/private-media-pexels-adapter.ts";

const now = "2026-05-15T00:00:00.000Z";
const userId = "demo-user-owner";
const merchantId = "demo-merchant-local";
const assetId = "11111111-1111-4111-8111-111111111111";
const clipOneId = "22222222-2222-4222-8222-222222222222";
const clipTwoId = "33333333-3333-4333-8333-333333333333";

test("merchant media manifest stores ready segment clips and keeps them searchable by tags", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  const result = await receiveMerchantMediaManifest({
    userId,
    merchantId,
    repository,
    now,
    defaultBucketName: "jj-private-bucket",
    request: validManifest(),
  });

  assert.equal(result.asset.id, assetId);
  assert.deepEqual(result.clips.map((clip) => clip.id), [clipOneId, clipTwoId]);

  const searchable = searchPrivateMediaClips({
    merchantId,
    mediaType: "video",
    query: "entrance shops",
    clips: await repository.listReadyClipsByMerchant({ merchantId }),
  });

  assert.deepEqual(searchable.map((clip) => clip.id), [clipOneId]);
});

test("merchant media manifest rejects cross-merchant COS keys", async () => {
  await assert.rejects(
    () =>
      receiveMerchantMediaManifest({
        userId,
        merchantId,
        repository: new InMemoryMerchantMediaRepository(),
        now,
        defaultBucketName: "jj-private-bucket",
        request: {
          ...validManifest(),
          asset: {
            ...validManifest().asset,
            sourceCosKey: `merchant-media/other-merchant/originals/${assetId}/source.mp4`,
          },
        },
      }),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "MERCHANT_MEDIA_SOURCE_KEY_INVALID",
  );
});

test("merchant media manifest rejects clips with fewer than three tags", async () => {
  await assert.rejects(
    () =>
      receiveMerchantMediaManifest({
        userId,
        merchantId,
        repository: new InMemoryMerchantMediaRepository(),
        now,
        defaultBucketName: "jj-private-bucket",
        request: {
          ...validManifest(),
          clips: [
            {
              ...validManifest().clips[0]!,
              tags: ["entrance", "shops"],
            },
          ],
        },
      }),
    (error) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "MERCHANT_MEDIA_MANIFEST_INVALID",
  );
});

function validManifest() {
  return {
    draftId: null,
    asset: {
      id: assetId,
      mediaType: "video" as const,
      source: "merchant_upload" as const,
      bucketName: "jj-private-bucket",
      sourceCosKey: `merchant-media/${merchantId}/originals/${assetId}/source.mp4`,
      mimeType: "video/mp4",
      idempotencyKey: "manifest-source-a",
    },
    clips: [
      {
        id: clipOneId,
        clipIndex: 0,
        mediaType: "video" as const,
        clipType: "segment" as const,
        startTimeSeconds: 0,
        endTimeSeconds: 5,
        durationSeconds: 5,
        bucketName: "jj-private-bucket",
        cosKey: `merchant-media/${merchantId}/clips/${assetId}/entrance.mp4`,
        thumbCosKey: `merchant-media/${merchantId}/thumbs/${assetId}/entrance.jpg`,
        mimeType: "video/mp4",
        width: 1080,
        height: 1920,
        orientation: "portrait" as const,
        description: "Project entrance with nearby shops.",
        tags: ["project", "entrance", "shops"],
        sceneTags: ["exterior"],
        shotTags: ["wide"],
        tagConfidence: 0.92,
        tagSource: "manual" as const,
      },
      {
        id: clipTwoId,
        clipIndex: 1,
        mediaType: "video" as const,
        clipType: "segment" as const,
        startTimeSeconds: 5,
        endTimeSeconds: 10,
        durationSeconds: 5,
        bucketName: "jj-private-bucket",
        cosKey: `merchant-media/${merchantId}/clips/${assetId}/lobby.mp4`,
        thumbCosKey: `merchant-media/${merchantId}/thumbs/${assetId}/lobby.jpg`,
        mimeType: "video/mp4",
        width: 1080,
        height: 1920,
        orientation: "portrait" as const,
        description: "Lobby corridor and interior details.",
        tags: ["project", "lobby", "corridor"],
        sceneTags: ["interior"],
        shotTags: ["detail"],
        tagConfidence: 0.9,
        tagSource: "manual" as const,
      },
    ],
  };
}
