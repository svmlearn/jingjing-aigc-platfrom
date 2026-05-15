import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDifyFinalResultJson,
  mapDifyFinalResultToVariants,
} from "./dify-final-result-adapter.ts";
import { buildVideoEditJobInputPayload } from "../server/api/video-job-payload.ts";

test("mapDifyFinalResultToVariants maps final_result_json fixture to note and video_script variants", () => {
  const mapping = mapDifyFinalResultToVariants(difyFixture);

  assert.equal(mapping.status, "ready");
  assert.equal(mapping.workflowVersion, "dify-v3.1");
  assert.deepEqual(
    mapping.variants.map((variant) => variant.variantType),
    ["note", "video_script"],
  );
  assert.equal(mapping.variants[0]?.title, difyFixture.article.title);
  assert.equal(mapping.variants[0]?.bodyText, difyFixture.article.copyText);
  assert.match(mapping.variants[1]?.scriptText ?? "", /Scene 1/);
  assert.equal(mapping.variants[1]?.productionScenes?.[0]?.visual, "Show the project entrance and nearby shops.");
  assert.equal(mapping.draftInputSnapshot.workflowProvider, "dify");
  assert.equal(mapping.draftInputSnapshot.workflowVersion, "dify-v3.1");
});

test("mapDifyFinalResultToVariants rejects missing video scenes before creating variants", () => {
  const mapping = mapDifyFinalResultToVariants({
    ...difyFixture,
    video: {
      ...difyFixture.video,
      scenes: [],
    },
  });

  assert.equal(mapping.status, "schema_failed");
  assert.deepEqual(mapping.variants, []);
  assert.ok(mapping.schemaErrors.some((error) => error.includes("video.scenes[]")));
});

test("mapDifyFinalResultToVariants blocks producible variants when quality is blocked", () => {
  const mapping = mapDifyFinalResultToVariants({
    ...difyFixture,
    quality: {
      status: "blocked",
      pass: false,
      blockingReasons: ["missing licensed project images"],
      missingInputs: ["project images"],
    },
  });

  assert.equal(mapping.status, "blocked");
  assert.deepEqual(mapping.variants, []);
});

test("extractDifyFinalResultJson reads outputs.final_result_json string fixtures", () => {
  const extracted = extractDifyFinalResultJson({
    outputs: {
      final_result_json: JSON.stringify(difyFixture),
    },
  });

  assert.deepEqual(extracted, difyFixture);
});

test("Dify video_script variants still use the shared video_edit_jobs input payload builder", () => {
  const mapping = mapDifyFinalResultToVariants(difyFixture);
  const videoVariant = mapping.variants.find((variant) => variant.variantType === "video_script");

  assert.ok(videoVariant);
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-dify",
    variant: {
      contentVariantId: "variant-dify-video",
      draftId: "draft-dify",
      scriptText: videoVariant.scriptText,
      productionScenes: videoVariant.productionScenes,
      reviewStatus: "approved",
    },
    materialReferences: [],
    assets: [],
    now: "2026-05-15T00:00:00.000Z",
  });
  const rawPayload = payload as Record<string, unknown>;

  assert.equal(payload.source, "video_workbench");
  assert.equal(payload.script.locked, true);
  assert.equal(rawPayload.workflowVersion, undefined);
  assert.equal(rawPayload.outputs, undefined);
  assert.equal(rawPayload.article, undefined);
  assert.equal(rawPayload.video, undefined);
  assert.equal(rawPayload.quality, undefined);
  assert.equal(rawPayload.debug, undefined);
  assert.equal(payload.materialContext.sceneAssetQueries[0]?.query.includes("project entrance"), true);
});

const difyFixture = {
  workflowVersion: "dify-v3.1",
  status: "succeeded",
  article: {
    title: "Compact home with a real community scene",
    coverCopy: "70 sqm, high ceiling",
    images: [
      {
        cosPath: "cos://jj-content-staging/project/article-cover.jpg",
        role: "cover",
      },
    ],
    copyText: "A practical home-buying note with realistic project details.",
    hashtags: ["#home", "#project"],
    ctaText: "Message us for the floor plan.",
  },
  video: {
    title: "Project walkthrough script",
    storyOutline: "Open with the buyer pain point, then show the real project scene.",
    estimatedDuration: 60,
    scenes: [
      {
        sceneNo: 1,
        timeRange: "00:00-00:08",
        durationSec: 8,
        sceneType: "talking_head",
        title: "Opening",
        purpose: "Hook the viewer with the project's practical value.",
        requiresUserUpload: true,
        taskDescription: "Record at the project entrance with the storefront visible.",
        visualDescription: "Show the project entrance and nearby shops.",
        voiceover: "Start with what buyers can verify on site.",
        subtitle: "Verify the real scene first.",
        filmingGuide: {
          method: "handheld",
          location: "project entrance",
          posture: "standing",
          props: ["badge"],
          tips: ["keep the sign visible"],
        },
        shotLanguage: {
          framing: "medium",
          cameraMovement: "slow push",
          orientation: "vertical",
          composition: "speaker left, project sign right",
        },
        editGuide: {
          transition: "cut",
          pacing: "normal",
          minUsableSeconds: 4,
        },
        assetQuery: "project entrance shops",
        fallbackVisual: "Use a wide shot of the gate if the storefront is unavailable.",
      },
    ],
    ctaText: "Ask for the viewing route.",
  },
  quality: {
    status: "passed",
    pass: true,
    blockingReasons: [],
    missingInputs: [],
  },
  debug: {
    usedKnowledgeRefs: ["knowledge-1"],
  },
};
