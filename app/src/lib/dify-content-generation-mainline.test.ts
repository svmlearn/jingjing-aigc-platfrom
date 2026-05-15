import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDifyMainlineDraftInput,
  isDifyMainlineEnabled,
  readDifyFinalResultFixtureFromEnv,
} from "./dify-content-generation-mainline.ts";
import { buildVideoEditJobInputPayload } from "../server/api/video-job-payload.ts";

test("feature flag parser enables Dify mainline only for explicit on values", () => {
  assert.equal(isDifyMainlineEnabled({ DIFY_CONTENT_GENERATION_ENABLED: "1" }), true);
  assert.equal(isDifyMainlineEnabled({ DIFY_CONTENT_GENERATION_ENABLED: "true" }), true);
  assert.equal(isDifyMainlineEnabled({ CONTENT_GENERATION_USE_DIFY: "dify" }), true);
  assert.equal(isDifyMainlineEnabled({ DIFY_CONTENT_GENERATION_ENABLED: "0" }), false);
  assert.equal(isDifyMainlineEnabled({}), false);
});

test("Dify fixture env reader uses local final_result_json substitutes without real Dify keys", () => {
  assert.equal(readDifyFinalResultFixtureFromEnv({ DIFY_FINAL_RESULT_JSON_FIXTURE: "fixture" }), "fixture");
  assert.equal(readDifyFinalResultFixtureFromEnv({ DIFY_MOCK_FINAL_RESULT_JSON: "mock" }), "mock");
  assert.equal(readDifyFinalResultFixtureFromEnv({}), null);
});

test("Dify mainline builder creates one draft input with note and video_script variants", () => {
  const built = buildDifyMainlineDraftInput({
    source: "consultation_calendar",
    dailyTaskId: "task-1",
    consultationSessionId: "session-1",
    calendarItemId: "calendar-1",
    strategyTag: "project_walkthrough",
    rewriteGoal: "Show the project entrance.",
    finalResult: {
      outputs: {
        final_result_json: JSON.stringify(difyFixture),
      },
    },
  });

  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.draft.inputSnapshot.workflowProvider, "dify");
    assert.equal(built.draft.inputSnapshot.workflowVersion, "dify-v3.1");
    assert.deepEqual(
      built.draft.variants.map((variant) => variant.variantType),
      ["note", "video_script"],
    );
    assert.equal(built.draft.variants[1]?.productionScenes?.[0]?.materials.includes("project entrance shops"), true);
    assert.equal("finalResult" in built.draft.inputSnapshot, false);
    assert.equal(built.sourceItem.tracePayload.workflow_provider, "dify");
  }
});

test("Dify schema failure falls back before creating draft input", () => {
  const built = buildDifyMainlineDraftInput({
    source: "manual",
    finalResult: {
      ...difyFixture,
      video: {
        ...difyFixture.video,
        scenes: [],
      },
    },
  });

  assert.equal(built.ok, false);
  if (!built.ok) {
    assert.equal(built.status, "schema_failed");
  }
});

test("Dify quality blocked result does not create producible variants", () => {
  const built = buildDifyMainlineDraftInput({
    source: "manual",
    finalResult: {
      ...difyFixture,
      quality: {
        status: "blocked",
        pass: false,
        blockingReasons: ["missing licensed media"],
        missingInputs: ["project videos"],
      },
    },
  });

  assert.equal(built.ok, false);
  if (!built.ok) {
    assert.equal(built.status, "blocked");
    assert.deepEqual(built.mapping.variants, []);
  }
});

test("Dify mainline video_script still uses the shared video edit job payload builder", () => {
  const built = buildDifyMainlineDraftInput({
    source: "manual",
    finalResult: difyFixture,
  });

  assert.equal(built.ok, true);
  if (!built.ok) {
    return;
  }

  const videoVariant = built.draft.variants.find((variant) => variant.variantType === "video_script");
  assert.ok(videoVariant);
  const payload = buildVideoEditJobInputPayload({
    draftId: "draft-dify-mainline",
    variant: {
      contentVariantId: "variant-dify-mainline-video",
      draftId: "draft-dify-mainline",
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
  assert.equal(rawPayload.workflowVersion, undefined);
  assert.equal(rawPayload.outputs, undefined);
  assert.equal(rawPayload.article, undefined);
  assert.equal(rawPayload.video, undefined);
  assert.equal(rawPayload.quality, undefined);
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
