import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoJobPayloadValidationError,
  buildVideoEditJobInputPayload,
} from "./video-job-payload.ts";

const approvedVariant = {
  contentVariantId: "variant-1",
  draftId: "draft-1",
  scriptText: "Scene 1\n台词：先看真实门店细节。",
  reviewStatus: "approved",
};

test("buildVideoEditJobInputPayload creates the worker contract from an approved script", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [
      {
        id: "reference-1",
        materialItemId: "material-1",
      },
    ],
    assets: [
      {
        id: "asset-1",
        assetType: "video",
        storageProvider: "tencent_cos",
        bucketName: "jj-content-staging-1341668543",
        storageKey: "draft-inputs/demo.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    now: "2026-04-27T00:00:00.000Z",
  });

  assert.equal(payload.source, "video_workbench");
  assert.equal(payload.executionMode, "staging_worker");
  assert.deepEqual(payload.script, {
    text: approvedVariant.scriptText,
    locked: true,
    variantId: approvedVariant.contentVariantId,
  });
  assert.deepEqual(payload.productionDirective, {
    targetPlatform: "douyin",
    aspectRatio: "9:16",
    desiredOutputs: ["final_video", "cover", "subtitles"],
    lockedFields: ["script", "cta", "target_user", "claims"],
  });
  assert.deepEqual(payload.materialContext, {
    assetPlanId: null,
    assetMatchReportId: null,
    scriptBindingId: "variant-1",
    materialIds: ["material-1"],
    materialReferenceIds: ["reference-1"],
    selectionMode: "user_confirmed",
    fallbackMode: null,
  });
  assert.deepEqual(payload.input_assets, [
    {
      asset_id: "asset-1",
      asset_type: "video",
      storage_provider: "tencent_cos",
      bucket_name: "jj-content-staging-1341668543",
      storage_key: "draft-inputs/demo.mp4",
      mime_type: "video/mp4",
      file_size_bytes: 123456,
      etag: "etag",
      sort_order: 0,
    },
  ]);
});

test("buildVideoEditJobInputPayload rejects unapproved scripts", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: {
          ...approvedVariant,
          reviewStatus: "review_pending",
        },
        materialReferences: [],
        assets: [],
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_SCRIPT_NOT_APPROVED" &&
      error.status === 409,
  );
});

test("buildVideoEditJobInputPayload rejects empty script text", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: {
          ...approvedVariant,
          scriptText: "   ",
        },
        materialReferences: [],
        assets: [],
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_SCRIPT_TEXT_REQUIRED",
  );
});

test("buildVideoEditJobInputPayload rejects bad COS input assets", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [],
        assets: [
          {
            id: "asset-bad",
            assetType: "video",
            storageProvider: "tencent_cos",
            bucketName: null,
            storageKey: "draft-inputs/bad.mp4",
            mimeType: "video/mp4",
            fileSizeBytes: 1,
            etag: null,
            sortOrder: 0,
          },
        ],
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_INPUT_ASSET_BUCKET_REQUIRED",
  );
});

test("buildVideoEditJobInputPayload rejects non-COS input assets", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [],
        assets: [
          {
            id: "asset-supabase",
            assetType: "video",
            storageProvider: "supabase_storage",
            bucketName: null,
            storageKey: "draft-inputs/supabase.mp4",
            mimeType: "video/mp4",
            fileSizeBytes: 1,
            etag: null,
            sortOrder: 0,
          },
        ],
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_INPUT_ASSET_PROVIDER_UNSUPPORTED" &&
      error.status === 409,
  );
});

test("buildVideoEditJobInputPayload rejects confirmed material references without input assets", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [
          {
            id: "reference-1",
            materialItemId: "material-1",
          },
        ],
        assets: [],
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_CONFIRMED_MATERIAL_ASSET_REQUIRED" &&
      error.status === 409,
  );
});

test("buildVideoEditJobInputPayload normalizes COS fields and orders input assets", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [
      {
        id: "reference-1",
        materialItemId: "material-1",
      },
    ],
    assets: [
      {
        id: "asset-2",
        assetType: "image",
        storageProvider: "tencent_cos",
        bucketName: " jj-content-staging-1341668543 ",
        storageKey: " draft-inputs/cover.jpg ",
        mimeType: "image/jpeg",
        fileSizeBytes: 456,
        etag: "etag-2",
        sortOrder: 2,
      },
      {
        id: "asset-1",
        assetType: "video",
        storageProvider: "tencent_cos",
        bucketName: "jj-content-staging-1341668543",
        storageKey: "draft-inputs/demo.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123,
        etag: "etag-1",
        sortOrder: 1,
      },
    ],
    now: "2026-04-27T00:00:00.000Z",
  });

  assert.deepEqual(
    payload.input_assets.map((asset) => ({
      asset_id: asset.asset_id,
      bucket_name: asset.bucket_name,
      storage_key: asset.storage_key,
      sort_order: asset.sort_order,
    })),
    [
      {
        asset_id: "asset-1",
        bucket_name: "jj-content-staging-1341668543",
        storage_key: "draft-inputs/demo.mp4",
        sort_order: 1,
      },
      {
        asset_id: "asset-2",
        bucket_name: "jj-content-staging-1341668543",
        storage_key: "draft-inputs/cover.jpg",
        sort_order: 2,
      },
    ],
  );
});
