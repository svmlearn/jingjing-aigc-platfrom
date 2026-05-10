import assert from "node:assert/strict";
import test from "node:test";

import type { MaterialLibraryItemDto } from "@/contracts/material";
import {
  rankMaterialLibraryItemsForRetrieval,
  readMaterialRetrievalTrace,
  tokenizeMaterialRetrievalQuery,
} from "./material-retrieval.ts";

test("rankMaterialLibraryItemsForRetrieval filters by target before ranking", () => {
  const ranked = rankMaterialLibraryItemsForRetrieval({
    materials: [
      material({
        id: "viral-video",
        title: "刚需买房避坑爆款脚本",
        usageType: "viral_reference",
        retrievalTargets: ["copy_context", "script_context"],
        createdAt: "2026-05-10T00:00:00.000Z",
      }),
      material({
        id: "project-video",
        title: "刚需买房项目外立面远景",
        usageType: "video_asset",
        retrievalTargets: ["video_edit_asset"],
        createdAt: "2026-05-09T00:00:00.000Z",
      }),
    ],
    retrievalTarget: "script_context",
    query: "刚需买房 避坑 hook",
    now: new Date("2026-05-10T12:00:00.000Z"),
  });

  assert.deepEqual(ranked.map((item) => item.id), ["viral-video"]);
  assert.equal(readMaterialRetrievalTrace(ranked[0]!)?.retrievalTarget, "script_context");
});

test("rankMaterialLibraryItemsForRetrieval prioritizes query matches over plain recency", () => {
  const ranked = rankMaterialLibraryItemsForRetrieval({
    materials: [
      material({
        id: "recent-image",
        title: "项目外立面白天图",
        usageType: "image_asset",
        retrievalTargets: ["article_image_asset"],
        createdAt: "2026-05-10T09:00:00.000Z",
      }),
      material({
        id: "matched-image",
        title: "样板间客厅横移空间感",
        description: "适合做刚需买房避坑内页，展示客厅采光和动线。",
        usageType: "image_asset",
        retrievalTargets: ["article_image_asset"],
        createdAt: "2026-05-08T09:00:00.000Z",
      }),
    ],
    retrievalTarget: "article_image_asset",
    query: "样板间 客厅 空间感",
    now: new Date("2026-05-10T12:00:00.000Z"),
  });
  const trace = readMaterialRetrievalTrace(ranked[0]!);

  assert.equal(ranked[0]?.id, "matched-image");
  assert.ok(trace?.matchReasons.some((reason) => reason.code === "keyword_match"));
});

test("tokenizeMaterialRetrievalQuery expands Han text for fuzzy material recall", () => {
  const terms = tokenizeMaterialRetrievalQuery("刚需买房避坑");

  assert.ok(terms.includes("刚需买房避坑"));
  assert.ok(terms.includes("刚需"));
  assert.ok(terms.includes("买房"));
  assert.ok(terms.includes("避坑"));
});

function material(
  overrides: Partial<MaterialLibraryItemDto> & Pick<MaterialLibraryItemDto, "id" | "title">,
): MaterialLibraryItemDto {
  return {
    merchantId: "merchant-1",
    sourceItemId: overrides.id,
    platform: "xiaohongshu",
    materialType: "article",
    sourceKind: "uploaded",
    usageType: "viral_reference",
    retrievalTargets: ["copy_context", "script_context"],
    status: "ready",
    description: null,
    originalUrl: null,
    creatorName: null,
    engagementLabel: null,
    analysisPayload: {},
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}
