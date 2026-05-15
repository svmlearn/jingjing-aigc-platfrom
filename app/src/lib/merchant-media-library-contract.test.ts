import assert from "node:assert/strict";
import test from "node:test";

import {
  MerchantMediaLibraryContractError,
  assertMerchantMediaAssetCanEnterTeamLibrary,
  listMerchantReadyClips,
  validateMerchantMediaReadyAsset,
  type MerchantMediaAssetRecord,
} from "./merchant-media-library-contract.ts";
import type { PrivateMediaClipRecord } from "./private-media-pexels-adapter.ts";

test("merchant media library accepts only merchant-side explicit sources", () => {
  assert.doesNotThrow(() => assertMerchantMediaAssetCanEnterTeamLibrary(asset));

  for (const source of ["member_task_temp", "content_draft_temp", "voice_profile", "worker_output"] as const) {
    assert.throws(
      () => assertMerchantMediaAssetCanEnterTeamLibrary({ ...asset, source }),
      (error) =>
        error instanceof MerchantMediaLibraryContractError &&
        error.message.includes("cannot enter merchant_media_*"),
    );
  }
});

test("ready merchant media asset requires ready clips with metadata, thumbnail, and tags", () => {
  const validation = validateMerchantMediaReadyAsset({
    asset,
    clips: [readyClip],
  });

  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.deepEqual(validation.readyClips.map((clip) => clip.id), ["clip-1"]);
  }
});

test("ready merchant media asset rejects missing clips and incomplete ready metadata", () => {
  const noClips = validateMerchantMediaReadyAsset({ asset, clips: [] });
  const badClip = validateMerchantMediaReadyAsset({
    asset,
    clips: [
      {
        ...readyClip,
        description: "",
        tags: ["one"],
        thumbCosKey: null,
        durationSeconds: null,
      },
    ],
  });

  assert.equal(noClips.ok, false);
  assert.equal(badClip.ok, false);
  if (!noClips.ok) {
    assert.ok(noClips.errors.some((error) => error.includes("at least one ready clip")));
  }
  if (!badClip.ok) {
    assert.ok(badClip.errors.some((error) => error.includes("description")));
    assert.ok(badClip.errors.some((error) => error.includes("three tags")));
    assert.ok(badClip.errors.some((error) => error.includes("thumb_cos_key")));
    assert.ok(badClip.errors.some((error) => error.includes("duration_seconds")));
  }
});

test("merchant ready clip listing explicitly filters tenant and ready status", () => {
  const results = listMerchantReadyClips({
    merchantId: "merchant-a",
    clips: [
      readyClip,
      { ...readyClip, id: "clip-b", merchantId: "merchant-b" },
      { ...readyClip, id: "clip-failed", status: "tagging_failed" },
    ],
  });

  assert.deepEqual(results.map((clip) => clip.id), ["clip-1"]);
});

const asset: MerchantMediaAssetRecord = {
  id: "asset-1",
  merchantId: "merchant-a",
  uploadedByUserId: "user-a",
  mediaType: "video",
  source: "merchant_upload",
  sourceCosKey: "merchant-media/merchant-a/originals/asset-1/source.mp4",
  status: "ready",
  createdAt: "2026-05-15T00:00:00.000Z",
};

const readyClip: PrivateMediaClipRecord = {
  id: "clip-1",
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
  cosKey: "merchant-media/merchant-a/clips/asset-1/clip-1.mp4",
  thumbCosKey: "merchant-media/merchant-a/thumbs/asset-1/clip-1.jpg",
  mimeType: "video/mp4",
  createdAt: "2026-05-15T00:00:00.000Z",
};
