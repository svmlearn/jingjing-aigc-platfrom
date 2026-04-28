import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoChainTestDraftFixture,
  isVideoChainTestDraftEnabled,
} from "./video-chain-test-draft.ts";

test("isVideoChainTestDraftEnabled allows local development and explicit staging opt-in", () => {
  assert.equal(isVideoChainTestDraftEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isVideoChainTestDraftEnabled({ NODE_ENV: "test" }), true);
  assert.equal(isVideoChainTestDraftEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    isVideoChainTestDraftEnabled({
      NODE_ENV: "production",
      VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    isVideoChainTestDraftEnabled({
      NODE_ENV: "production",
      VIDEO_CHAIN_TEST_ENTRYPOINT_ENABLED: "false",
    }),
    false,
  );
});

test("buildVideoChainTestDraftFixture creates an approved placeholder video script", () => {
  const fixture = buildVideoChainTestDraftFixture({
    merchantName: "静境普拉提",
    serviceItems: ["普拉提私教", "体态评估"],
    defaultCta: ["预约 1 次到店体验课"],
    forbiddenWords: ["包瘦"],
    now: "2026-04-28T08:00:00.000Z",
  });

  assert.equal(fixture.sourceItem.platform, "douyin");
  assert.equal(fixture.sourceItem.tracePayload.test_mode, "video_chain_bypass_script");
  assert.equal(fixture.draft.inputSnapshot.generationMode, "video_chain_test_bypass");
  assert.equal(fixture.variant.variantType, "video_script");
  assert.equal(fixture.variant.reviewStatus, "approved");
  assert.equal(fixture.variant.ctaText, "预约 1 次到店体验课");
  assert.deepEqual(fixture.variant.hashtags, ["视频链路测试", "素材上传测试"]);
  assert.match(fixture.variant.title, /链路验证/);
  assert.match(fixture.variant.scriptText, /链路测试占位脚本/);
  assert.match(fixture.variant.scriptText, /Scene 1 \| 00:00-00:05/);
  assert.match(fixture.variant.scriptText, /Scene 2 \| 00:05-00:18/);
  assert.match(fixture.variant.scriptText, /Scene 3 \| 00:18-00:35/);
  assert.equal(fixture.variant.productionScenes.length, 3);
});
