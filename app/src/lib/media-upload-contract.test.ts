import assert from "node:assert/strict";
import test from "node:test";

import {
  getUploadKeyPrefix,
  validateMediaUploadCompleteContract,
  type MediaUploadCompleteContractInput,
} from "./media-upload-contract.ts";

test("media upload complete accepts valid merchant video upload", () => {
  const result = validateMediaUploadCompleteContract(baseInput);

  assert.deepEqual(result, { ok: true });
});

test("media upload complete rejects wrong bucket, prefix, provider, and cross owner", () => {
  assertFailure({ bucketName: "other-bucket" }, "MEDIA_BUCKET_MISMATCH");
  assertFailure({ storageProvider: "tencent_cos" }, "MEDIA_STORAGE_PROVIDER_UNSUPPORTED");
  assertFailure({ storageProvider: "supabase_storage" }, "MEDIA_STORAGE_PROVIDER_UNSUPPORTED");
  assertFailure(
    { storageKey: "merchant-media/merchant-a/originals/asset-1/source.mp4" },
    "MEDIA_STORAGE_KEY_INVALID",
  );
  assertFailure(
    { storageKey: `${getUploadKeyPrefix({ ...baseInput, ownerId: "owner-b" })}/source.mp4` },
    "MEDIA_STORAGE_KEY_INVALID",
  );
});

test("media upload complete rejects declared/detected MIME mismatch", () => {
  assertFailure({ declaredMimeType: "video/mp4", detectedMimeType: "application/pdf" }, "MEDIA_DETECTED_TYPE_MISMATCH");
  assertFailure({ declaredMimeType: "image/jpeg", detectedMimeType: "video/mp4" }, "MEDIA_DECLARED_TYPE_MISMATCH");
});

test("media upload complete keeps user temporary assets out of merchant library source_item", () => {
  assertFailure({ source: "member_task_temp" }, "MEDIA_SOURCE_UNSUPPORTED");
  assert.deepEqual(
    validateMediaUploadCompleteContract({
      ...baseInput,
      ownerType: "content_draft",
      ownerId: "draft-1",
      source: "member_task_temp",
      storageKey: "draft-inputs/merchant-a/draft-1/source.mp4",
    }),
    { ok: true },
  );
});

test("media upload complete validates voice reference audio separately", () => {
  const expectedPrefix = getUploadKeyPrefix({
    merchantId: "merchant-a",
    ownerType: "voice_profile",
    ownerId: "profile-1",
  });

  assert.equal(
    expectedPrefix,
    "draft-inputs/merchant-a/profile-1/voice-profile-audio",
  );
  assert.deepEqual(
    validateMediaUploadCompleteContract({
      ...baseInput,
      ownerType: "voice_profile",
      ownerId: "profile-1",
      assetType: "audio",
      declaredMimeType: "audio/mp4",
      detectedMimeType: "audio/mp4",
      source: "voice_profile",
      storageKey: `${expectedPrefix}/ref.m4a`,
    }),
    { ok: true },
  );
  assertFailure(
    {
      ownerType: "voice_profile",
      ownerId: "profile-1",
      assetType: "audio",
      source: "voice_profile",
      storageKey: "voice-profiles/merchant-a/profile-1/ref.m4a",
    },
    "MEDIA_STORAGE_KEY_INVALID",
  );
  assertFailure(
    {
      ownerType: "voice_profile",
      ownerId: "profile-1",
      assetType: "video",
      storageKey: `${expectedPrefix}/ref.mp4`,
    },
    "MEDIA_ASSET_TYPE_UNSUPPORTED",
  );
});

function assertFailure(
  overrides: Partial<MediaUploadCompleteContractInput>,
  code: string,
) {
  const result = validateMediaUploadCompleteContract({
    ...baseInput,
    ...overrides,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, code);
  }
}

const baseInput: MediaUploadCompleteContractInput = {
  merchantId: "merchant-a",
  ownerType: "source_item",
  ownerId: "asset-1",
  assetType: "video",
  expectedBucket: "private-bucket",
  bucketName: "private-bucket",
  storageProvider: "aliyun_oss",
  storageKey: "source-assets/merchant-a/asset-1/source.mp4",
  declaredMimeType: "video/mp4",
  detectedMimeType: "video/mp4",
  source: "merchant_upload",
};
