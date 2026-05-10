import assert from "node:assert/strict";
import test from "node:test";

import {
  materialMatchesRetrievalTarget,
  normalizeMaterialRouting,
} from "./material-routing.ts";

test("benchmark videos are viral references, not worker video assets", () => {
  const routing = normalizeMaterialRouting({
    materialType: "video",
    sourceKind: "benchmark",
    status: "ready",
    analysisPayload: {
      provider: "tikhub",
    },
  });

  assert.equal(routing.usageType, "viral_reference");
  assert.deepEqual(routing.retrievalTargets, ["copy_context", "script_context"]);
  assert.equal(
    materialMatchesRetrievalTarget(
      { status: "ready", retrievalTargets: routing.retrievalTargets },
      "video_edit_asset",
    ),
    false,
  );
});

test("project images only route to article image retrieval", () => {
  const routing = normalizeMaterialRouting({
    materialType: "article",
    sourceKind: "uploaded",
    status: "ready",
    analysisPayload: {
      materialCategory: "project_media_asset",
      assetType: "image",
    },
  });

  assert.equal(routing.usageType, "image_asset");
  assert.deepEqual(routing.retrievalTargets, ["article_image_asset"]);
  assert.equal(
    materialMatchesRetrievalTarget(
      { status: "ready", retrievalTargets: routing.retrievalTargets },
      "script_context",
    ),
    false,
  );
});

test("project videos wait for multimodal indexing before video edit retrieval", () => {
  const parsingRouting = normalizeMaterialRouting({
    materialType: "video",
    sourceKind: "uploaded",
    status: "parsing",
    analysisPayload: {
      materialCategory: "project_media_asset",
      assetType: "video",
      retrievalTargets: ["video_edit_asset"],
    },
  });
  const readyRouting = normalizeMaterialRouting({
    materialType: "video",
    sourceKind: "uploaded",
    status: "ready",
    analysisPayload: {
      materialCategory: "project_media_asset",
      assetType: "video",
    },
  });

  assert.equal(parsingRouting.usageType, "video_asset");
  assert.deepEqual(parsingRouting.retrievalTargets, []);
  assert.deepEqual(readyRouting.retrievalTargets, ["video_edit_asset"]);
});
