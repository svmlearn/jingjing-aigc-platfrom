import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryMerchantMediaRepository,
  MerchantMediaRepositoryContractError,
} from "./merchant-media-repository-contract.ts";
import type { MerchantMediaAssetRecord } from "./merchant-media-library-contract.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

const now = "2026-05-15T00:00:00.000Z";

test("merchant media repository lists assets and clips only with explicit merchant_id", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  await repository.upsertAsset({
    asset: assetA,
    idempotencyKey: "cos-etag-a",
  });
  await repository.upsertAsset({
    asset: assetB,
    idempotencyKey: "cos-etag-b",
  });
  await repository.upsertReadyClip({
    merchantId: "merchant-a",
    assetId: assetA.id,
    clip: clipA,
  });
  await repository.upsertReadyClip({
    merchantId: "merchant-b",
    assetId: assetB.id,
    clip: clipB,
  });

  assert.deepEqual((await repository.listAssetsByMerchant({ merchantId: "merchant-a" })).map((asset) => asset.id), [
    "asset-a",
  ]);
  const listedAssets = await repository.listAssetsByMerchant({ merchantId: "merchant-a" });
  const listedClips = await repository.listReadyClipsByMerchant({ merchantId: "merchant-a" });

  assert.equal(listedAssets[0]?.sourceStorageKey, listedAssets[0]?.sourceCosKey);
  assert.equal(listedClips[0]?.storageKey, listedClips[0]?.cosKey);
  assert.equal(listedClips[0]?.thumbStorageKey, listedClips[0]?.thumbCosKey);
  assert.deepEqual(listedClips.map((clip) => clip.id), [
    "clip-a",
  ]);
  assert.equal(await repository.getReadyClipByMerchant({ merchantId: "merchant-a", clipId: "clip-b" }), null);
});

test("merchant media repository keeps asset upload and clip upserts idempotent", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  const firstAsset = await repository.upsertAsset({
    asset: assetA,
    idempotencyKey: "cos-etag-a",
  });
  const retryAsset = await repository.upsertAsset({
    asset: { ...assetA, id: "asset-a-retry" },
    idempotencyKey: "cos-etag-a",
  });
  await repository.upsertReadyClip({
    merchantId: "merchant-a",
    assetId: firstAsset.id,
    clip: clipA,
  });
  const retryClip = await repository.upsertReadyClip({
    merchantId: "merchant-a",
    assetId: firstAsset.id,
    clip: { ...clipA, id: "clip-a-retry" },
  });

  assert.equal(firstAsset.id, "asset-a");
  assert.equal(retryAsset.id, "asset-a");
  assert.equal(retryClip.id, "clip-a");
  assert.equal((await repository.listReadyClipsByMerchant({ merchantId: "merchant-a" })).length, 1);
});

test("merchant media repository rejects member temporary material and voice recordings", async () => {
  const repository = new InMemoryMerchantMediaRepository();

  await assert.rejects(
    () =>
      repository.upsertAsset({
        asset: {
          ...assetA,
          id: "member-temp",
          source: "member_task_temp",
          sourceCosKey: "draft-inputs/merchant-a/draft-1/source.mp4",
        },
        idempotencyKey: "member-temp",
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_SOURCE_FORBIDDEN",
  );

  await assert.rejects(
    () =>
      repository.upsertAsset({
        asset: {
          ...assetA,
          id: "voice-audio",
          mediaType: "video",
          source: "voice_profile",
          sourceCosKey: "voice-profiles/merchant-a/profile-1/ref.m4a",
        },
        idempotencyKey: "voice-audio",
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_VOICE_AUDIO_FORBIDDEN",
  );
});

test("merchant media repository accepts merchant segment clips", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  await repository.upsertAsset({
    asset: assetA,
    idempotencyKey: "cos-etag-a",
  });

  await repository.upsertReadyClip({
    merchantId: "merchant-a",
    assetId: assetA.id,
    clip: {
      ...clipA,
      id: "clip-window",
      clipIndex: 1,
      clipType: "segment",
      startTimeSeconds: 5,
      endTimeSeconds: 10,
      durationSeconds: 5,
      cosKey: "merchant-media/merchant-a/clips/asset-a/clip-window.mp4",
    },
  });

  assert.deepEqual((await repository.listReadyClipsByMerchant({ merchantId: "merchant-a" })).map((clip) => clip.id), [
    "clip-window",
  ]);
});

test("merchant media repository accepts matching provider-neutral storage aliases", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  const asset = await repository.upsertAsset({
    asset: {
      ...assetA,
      sourceStorageKey: assetA.sourceCosKey,
    },
    idempotencyKey: "storage-key-alias-a",
  });
  const clip = await repository.upsertReadyClip({
    merchantId: "merchant-a",
    assetId: assetA.id,
    clip: {
      ...clipA,
      storageKey: clipA.cosKey,
      thumbStorageKey: clipA.thumbCosKey,
    },
  });

  assert.equal(asset.sourceStorageKey, asset.sourceCosKey);
  assert.equal(clip.storageKey, clip.cosKey);
  assert.equal(clip.thumbStorageKey, clip.thumbCosKey);
});

test("merchant media repository rejects conflicting storage aliases", async () => {
  const repository = new InMemoryMerchantMediaRepository();

  await assert.rejects(
    () =>
      repository.upsertAsset({
        asset: {
          ...assetA,
          sourceStorageKey: "merchant-media/merchant-a/originals/asset-a/other.mp4",
        },
        idempotencyKey: "storage-key-conflict-a",
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_SOURCE_KEY_CONFLICT",
  );

  await repository.upsertAsset({
    asset: assetA,
    idempotencyKey: "cos-etag-a",
  });

  await assert.rejects(
    () =>
      repository.upsertReadyClip({
        merchantId: "merchant-a",
        assetId: assetA.id,
        clip: {
          ...clipA,
          storageKey: "merchant-media/merchant-a/originals/asset-a/other.mp4",
        },
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_CLIP_KEY_CONFLICT",
  );
});

test("merchant media repository rejects invalid clip shapes", async () => {
  const repository = new InMemoryMerchantMediaRepository();
  await repository.upsertAsset({
    asset: assetA,
    idempotencyKey: "cos-etag-a",
  });

  await assert.rejects(
    () =>
      repository.upsertReadyClip({
        merchantId: "merchant-a",
        assetId: assetA.id,
        clip: {
          ...clipA,
          id: "clip-bad",
          clipIndex: -1,
        },
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_CLIP_INDEX_INVALID",
  );

  await assert.rejects(
    () =>
      repository.upsertReadyClip({
        merchantId: "merchant-a",
        assetId: assetA.id,
        clip: {
          ...clipA,
          id: "clip-not-ready",
          status: "archived",
        },
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_CLIP_NOT_READY",
  );

  await assert.rejects(
    () =>
      repository.upsertReadyClip({
        merchantId: "merchant-a",
        assetId: assetA.id,
        clip: {
          ...clipA,
          id: "clip-asset-mismatch",
          assetId: "other-asset",
        },
      }),
    (error) =>
      error instanceof MerchantMediaRepositoryContractError &&
      error.code === "MERCHANT_MEDIA_CLIP_ASSET_MISMATCH",
  );
});

const assetA: MerchantMediaAssetRecord = {
  id: "asset-a",
  merchantId: "merchant-a",
  uploadedByUserId: "user-a",
  mediaType: "video",
  source: "merchant_upload",
  sourceCosKey: "merchant-media/merchant-a/originals/asset-a/source.mp4",
  status: "ready",
  createdAt: now,
};

const assetB: MerchantMediaAssetRecord = {
  ...assetA,
  id: "asset-b",
  merchantId: "merchant-b",
  sourceCosKey: "merchant-media/merchant-b/originals/asset-b/source.mp4",
};

const clipA: PrivateMediaClipRecord = {
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
  tagSource: "fixture",
  bucketName: "private-bucket",
  cosKey: "merchant-media/merchant-a/originals/asset-a/source.mp4",
  thumbCosKey: "merchant-media/merchant-a/thumbs/asset-a/clip-1.jpg",
  mimeType: "video/mp4",
  createdAt: now,
};

const clipB: PrivateMediaClipRecord = {
  ...clipA,
  id: "clip-b",
  assetId: "asset-b",
  merchantId: "merchant-b",
  cosKey: "merchant-media/merchant-b/originals/asset-b/source.mp4",
  thumbCosKey: "merchant-media/merchant-b/thumbs/asset-b/clip-1.jpg",
};
