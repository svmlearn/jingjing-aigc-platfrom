import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoJobPayloadValidationError,
  buildVideoEditJobInputPayload,
} from "./video-job-payload.ts";
import type { PrivateMediaClipRecord } from "../../lib/private-media-pexels-adapter.ts";

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
        storageKey: "draft-inputs/merchant-1/draft-1/talking-head.mp4",
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
  assert.deepEqual(payload.productionConfig, {
    voiceover: { enabled: true, mode: "system", provider: "bytedance_bigtts", volume: 2 },
    bgm: { enabled: true, userRequest: "", include: {}, exclude: {}, volume: 0.25 },
    subtitles: { enabled: true, style: "platform_default" },
    render: { aspectRatio: "9:16", includeOriginalAudio: false },
  });
  assert.deepEqual(payload.materialContext, {
    retrievalTarget: "video_edit_asset",
    assetPlanId: null,
    assetMatchReportId: null,
    scriptBindingId: "variant-1",
    materialIds: ["material-1"],
    materialReferenceIds: ["reference-1"],
    selectionMode: "user_confirmed",
    fallbackMode: null,
    excludedAssetIds: [],
    userTalkingHeadAssetIds: [],
    merchantMediaCandidateCount: 0,
    merchantMediaMatches: [],
    missingVideoAssetHints: [],
    sceneAssetQueries: [],
    assetMatchPlan: [],
  });
  assert.deepEqual(payload.input_assets, [
    {
      asset_id: "asset-1",
      asset_type: "video",
      storage_provider: "tencent_cos",
      bucket_name: "jj-content-staging-1341668543",
      storage_key: "draft-inputs/merchant-1/draft-1/talking-head.mp4",
      mime_type: "video/mp4",
      file_size_bytes: 123456,
      etag: "etag",
      sort_order: 0,
    },
  ]);
});

test("buildVideoEditJobInputPayload adds default production config", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    now: "2026-04-27T00:00:00.000Z",
  });

  assert.deepEqual(payload.productionConfig, {
    voiceover: { enabled: true, mode: "system", provider: "bytedance_bigtts", volume: 2 },
    bgm: { enabled: true, userRequest: "", include: {}, exclude: {}, volume: 0.25 },
    subtitles: { enabled: true, style: "platform_default" },
    render: { aspectRatio: "9:16", includeOriginalAudio: false },
  });
});

test("buildVideoEditJobInputPayload keeps non-talking-head jobs on script subtitles", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: {
      ...approvedVariant,
      productionScenes: [
        {
          sceneNo: 1,
          shotRequirement: "Project entrance with nearby shops",
          visual: "Show entrance and shops",
        },
      ],
    },
    materialReferences: [],
    assets: [],
  });

  assert.equal(payload.productionConfig.subtitles.talkingHeadSource, undefined);
  assert.equal(payload.productionConfig.render.preserveTalkingHeadOriginalAudio, undefined);
  assert.equal(payload.productionConfig.render.includeOriginalAudio, false);
});

test("buildVideoEditJobInputPayload requires at least one user talking-head draft video when enabled", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [],
        assets: [],
        merchantMediaClips: [merchantClip],
        requireUserTalkingHead: true,
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_USER_TALKING_HEAD_ASSET_REQUIRED" &&
      error.status === 409,
  );
});

test("buildVideoEditJobInputPayload keeps user uploads in input_assets and merchant clips in materialContext", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: {
      ...approvedVariant,
      productionScenes: [
        {
          sceneNo: 2,
          timeRange: "00:05-00:12",
          shotRequirement: "Project entrance with nearby shops",
          visual: "Show entrance and shops",
          materials: ["entrance", "shops"],
          fallbackShot: "Use lobby if entrance unavailable",
        },
      ],
    },
    materialReferences: [],
    assets: [
      {
        id: "user-head-1",
        assetType: "video",
        storageProvider: "tencent_cos",
        bucketName: "jj-content-staging-1341668543",
        storageKey: "draft-inputs/merchant-1/draft-1/opening-talking-head.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    merchantMediaClips: [merchantClip],
    requireUserTalkingHead: true,
  });

  assert.deepEqual(payload.input_assets.map((asset) => asset.asset_id), ["user-head-1"]);
  assert.deepEqual(payload.materialContext.userTalkingHeadAssetIds, ["user-head-1"]);
  assert.equal(payload.input_assets[0]?.role, "talking_head");
  assert.deepEqual(payload.productionConfig.subtitles, {
    enabled: true,
    style: "platform_default",
    talkingHeadSource: "asr_original_audio",
  });
  assert.deepEqual(payload.productionConfig.render, {
    aspectRatio: "9:16",
    includeOriginalAudio: true,
    preserveTalkingHeadOriginalAudio: true,
  });
  assert.equal(payload.materialContext.merchantMediaCandidateCount, 1);
  assert.deepEqual(payload.materialContext.merchantMediaMatches, [
    {
      sceneNo: 2,
      query: "Project entrance with nearby shops Show entrance and shops entrance shops",
      clipIds: ["merchant-clip-entrance"],
      clips: [
        {
          clipId: "merchant-clip-entrance",
          assetId: "merchant-asset-1",
          mediaType: "video",
          clipType: "segment",
          bucketName: "jj-private-bucket",
          cosKey: "merchant-media/merchant-1/clips/merchant-asset-1/entrance.mp4",
          thumbCosKey: "merchant-media/merchant-1/thumbs/merchant-asset-1/entrance.jpg",
          mimeType: "video/mp4",
          durationSeconds: 5,
          startTimeSeconds: 0,
          endTimeSeconds: 5,
          tags: ["project", "entrance", "shops"],
          sceneTags: ["exterior"],
          shotTags: ["wide"],
          description: "Project entrance with nearby shops.",
        },
      ],
    },
  ]);
  assert.deepEqual(payload.materialContext.assetMatchPlan, [
    {
      sceneNo: 2,
      query: "Project entrance with nearby shops Show entrance and shops entrance shops",
      matchedAssetIds: [],
      missing: true,
      reason: "no_video_asset",
    },
  ]);
  const rawPayload = payload as Record<string, unknown>;
  assert.equal(rawPayload.difyFinalJson, undefined);
  assert.equal(rawPayload.difyRawOutputs, undefined);
});

test("buildVideoEditJobInputPayload marks intro/outro scenes as user talking head", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: {
      ...approvedVariant,
      productionScenes: [
        {
          sceneNo: 1,
          timeRange: "00:00-00:05",
          requiresUserUpload: true,
          sceneType: "intro_talking_head",
          shotRequirement: "真人口播开场",
          visual: "经纪人出镜口播",
          materials: ["user upload"],
          fallbackShot: "Use uploaded phone clip",
        },
        {
          sceneNo: 2,
          timeRange: "00:05-00:12",
          shotRequirement: "Project entrance with nearby shops",
          visual: "Show entrance and shops",
          materials: ["entrance", "shops"],
          fallbackShot: "Use lobby if entrance unavailable",
        },
      ],
    },
    materialReferences: [],
    assets: [
      {
        id: "user-head-1",
        assetType: "video",
        storageProvider: "tencent_cos",
        bucketName: "jj-content-staging-1341668543",
        storageKey: "draft-inputs/merchant-1/draft-1/opening-talking-head.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    merchantMediaClips: [merchantClip],
    requireUserTalkingHead: true,
  });

  assert.deepEqual(
    payload.materialContext.sceneAssetQueries.map((query) => ({
      sceneNo: query.sceneNo,
      sourceRole: query.sourceRole,
    })),
    [
      { sceneNo: 1, sourceRole: "user_talking_head" },
      { sceneNo: 2, sourceRole: "merchant_broll" },
    ],
  );
  assert.deepEqual(
    payload.materialContext.merchantMediaMatches.map((match) => ({
      sceneNo: match.sceneNo,
      clipIds: match.clipIds,
    })),
    [
      { sceneNo: 1, clipIds: [] },
      { sceneNo: 2, clipIds: ["merchant-clip-entrance"] },
    ],
  );
});

test("buildVideoEditJobInputPayload accepts Aliyun OSS input assets", () => {
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
        id: "asset-aliyun-1",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "jingjing-domestic-phase1-hz",
        storageKey: "draft-inputs/demo.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    now: "2026-05-18T00:00:00.000Z",
  });

  assert.equal(payload.input_assets[0]?.storage_provider, "aliyun_oss");
  assert.equal(payload.input_assets[0]?.bucket_name, "jingjing-domestic-phase1-hz");
  assert.equal(payload.render_mode, "asset_driven");
  assert.equal(payload.productionConfig.subtitles.talkingHeadSource, undefined);
  assert.equal(payload.productionConfig.render.includeOriginalAudio, false);
});

test("buildVideoEditJobInputPayload accepts Aliyun OSS user talking-head assets", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [
      {
        id: "asset-aliyun-head-1",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "jingjing-domestic-phase1-hz",
        storageKey: "draft-inputs/merchant-1/draft-1/opening-talking-head.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
      },
    ],
    requireUserTalkingHead: true,
    now: "2026-05-18T00:00:00.000Z",
  });

  assert.deepEqual(payload.materialContext.userTalkingHeadAssetIds, ["asset-aliyun-head-1"]);
  assert.equal(payload.input_assets[0]?.storage_provider, "aliyun_oss");
  assert.equal(payload.input_assets[0]?.role, "talking_head");
  assert.deepEqual(payload.input_assets[0]?.metadata, {
    content_type: "talking_head",
    audio_source: "original_video_audio",
    subtitle_source: "asr_original_audio",
  });
  assert.deepEqual(payload.productionConfig.subtitles, {
    enabled: true,
    style: "platform_default",
    talkingHeadSource: "asr_original_audio",
  });
  assert.deepEqual(payload.productionConfig.render, {
    aspectRatio: "9:16",
    includeOriginalAudio: true,
    preserveTalkingHeadOriginalAudio: true,
  });
});

test("buildVideoEditJobInputPayload defaults structured talking-head assets to original-audio ASR", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [
      {
        id: "asset-structured-head-1",
        assetType: "video",
        storageProvider: "aliyun_oss",
        bucketName: "jingjing-domestic-phase1-hz",
        storageKey: "source-assets/merchant-1/asset-structured-head-1/source.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123456,
        etag: "etag",
        sortOrder: 0,
        role: "talking_head",
      },
    ],
    now: "2026-05-18T00:00:00.000Z",
  });

  assert.deepEqual(payload.materialContext.userTalkingHeadAssetIds, ["asset-structured-head-1"]);
  assert.equal(payload.input_assets[0]?.role, "talking_head");
  assert.equal(payload.productionConfig.subtitles.talkingHeadSource, "asr_original_audio");
  assert.equal(payload.productionConfig.render.preserveTalkingHeadOriginalAudio, true);
  assert.equal(payload.productionConfig.render.includeOriginalAudio, true);
});

test("buildVideoEditJobInputPayload normalizes production config overrides", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    productionConfig: {
      voiceover: {
        provider: "minimax",
        voiceStyle: "warm_consultant",
        speed: 1.1,
      },
      bgm: {
        userRequest: "轻一点，不要压过人声",
        include: { mood: ["warm"], id: ["light_01"] },
        volume: 0.18,
      },
      render: {
        maxDurationSeconds: 45,
        includeOriginalAudio: true,
      },
    },
  });

  assert.deepEqual(payload.productionConfig, {
    voiceover: {
      enabled: true,
      mode: "system",
      provider: "minimax",
      voiceStyle: "warm_consultant",
      speed: 1.1,
      volume: 2,
    },
    bgm: {
      enabled: true,
      userRequest: "轻一点，不要压过人声",
      include: { mood: ["warm"], id: ["light_01"] },
      exclude: {},
      volume: 0.18,
    },
    subtitles: { enabled: true, style: "platform_default" },
    render: {
      aspectRatio: "9:16",
      maxDurationSeconds: 45,
      includeOriginalAudio: true,
    },
  });
});

test("buildVideoEditJobInputPayload normalizes cloned voice profile config", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: approvedVariant,
    materialReferences: [],
    assets: [],
    productionConfig: {
      voiceover: {
        enabled: true,
        mode: "voice_profile",
        voiceProfileId: "11111111-1111-4111-8111-111111111111",
        refAudioAssetId: "22222222-2222-4222-8222-222222222222",
        includeOriginalAudio: true,
      },
    },
  });

  assert.deepEqual(payload.productionConfig.voiceover, {
    enabled: true,
    mode: "voice_profile",
    voiceProfileId: "11111111-1111-4111-8111-111111111111",
    refAudioAssetId: "22222222-2222-4222-8222-222222222222",
    volume: 2,
  });
  assert.equal(payload.productionConfig.render.includeOriginalAudio, true);
});

test("buildVideoEditJobInputPayload rejects invalid production config provider", () => {
  assert.throws(
    () =>
      buildVideoEditJobInputPayload({
        draftId: "draft-1",
        variant: approvedVariant,
        materialReferences: [],
        assets: [],
        productionConfig: {
          voiceover: {
            provider: "azure",
          },
        } as never,
      }),
    (error) =>
      error instanceof VideoJobPayloadValidationError &&
      error.code === "VIDEO_PRODUCTION_CONFIG_INVALID" &&
      error.status === 400,
  );
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

test("buildVideoEditJobInputPayload rejects unsupported input asset providers", () => {
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

test("buildVideoEditJobInputPayload exposes missing video hints from scene asset queries", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: {
      ...approvedVariant,
      scriptText: "Scene 1\n画面：项目外立面远景\n台词：先看真实细节。",
    },
    materialReferences: [],
    assets: [],
  });

  assert.deepEqual(payload.materialContext.sceneAssetQueries, [
    {
      sceneNo: 1,
      timeRange: null,
      query: "项目外立面远景",
      visualRequirement: "项目外立面远景",
      fallbackShot: null,
      sourceRole: "merchant_broll",
    },
  ]);
  assert.deepEqual(payload.materialContext.assetMatchPlan, [
    {
      sceneNo: 1,
      query: "项目外立面远景",
      matchedAssetIds: [],
      missing: true,
      reason: "no_video_asset",
    },
  ]);
  assert.deepEqual(payload.materialContext.missingVideoAssetHints, ["项目外立面远景"]);
});

test("buildVideoEditJobInputPayload only sends video assets to worker and orders input assets", () => {
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
        storageKey: " draft-inputs/merchant-1/draft-1/cover.jpg ",
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
        storageKey: "draft-inputs/merchant-1/draft-1/demo.mp4",
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
        storage_key: "draft-inputs/merchant-1/draft-1/demo.mp4",
        sort_order: 1,
      },
    ],
  );
  assert.deepEqual(payload.materialContext.excludedAssetIds, ["asset-2"]);
});

test("buildVideoEditJobInputPayload builds scene asset queries from production scenes", () => {
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-1",
    variant: {
      ...approvedVariant,
      productionScenes: [
        {
          sceneNo: 2,
          timeRange: "00:05-00:10",
          shotRequirement: "样板间客厅横移",
          visual: "客厅空间感和采光",
          materials: ["样板间", "客厅"],
          fallbackShot: "用同户型空间细节替代",
        },
      ],
    },
    materialReferences: [],
    assets: [
      {
        id: "asset-living-room",
        assetType: "video",
        storageProvider: "tencent_cos",
        bucketName: "jj-content-staging-1341668543",
        storageKey: "draft-inputs/merchant-1/draft-1/样板间-客厅.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 123,
        etag: "etag",
        sortOrder: 0,
      },
    ],
  });

  assert.deepEqual(payload.materialContext.sceneAssetQueries, [
    {
      sceneNo: 2,
      timeRange: "00:05-00:10",
      query: "样板间客厅横移 客厅空间感和采光 样板间 客厅",
      visualRequirement: "样板间客厅横移",
      fallbackShot: "用同户型空间细节替代",
      sourceRole: "merchant_broll",
    },
  ]);
  assert.deepEqual(payload.materialContext.assetMatchPlan, [
    {
      sceneNo: 2,
      query: "样板间客厅横移 客厅空间感和采光 样板间 客厅",
      matchedAssetIds: [],
      missing: true,
      reason: "no_video_asset",
    },
  ]);
});

const merchantClip: PrivateMediaClipRecord = {
  id: "merchant-clip-entrance",
  assetId: "merchant-asset-1",
  merchantId: "merchant-1",
  mediaType: "video",
  status: "ready",
  clipIndex: 0,
  clipType: "segment",
  startTimeSeconds: 0,
  endTimeSeconds: 5,
  width: 1080,
  height: 1920,
  durationSeconds: 5,
  orientation: "portrait",
  description: "Project entrance with nearby shops.",
  tags: ["project", "entrance", "shops"],
  sceneTags: ["exterior"],
  shotTags: ["wide"],
  bucketName: "jj-private-bucket",
  cosKey: "merchant-media/merchant-1/clips/merchant-asset-1/entrance.mp4",
  thumbCosKey: "merchant-media/merchant-1/thumbs/merchant-asset-1/entrance.jpg",
  mimeType: "video/mp4",
  createdAt: "2026-05-15T00:00:00.000Z",
} as const;
