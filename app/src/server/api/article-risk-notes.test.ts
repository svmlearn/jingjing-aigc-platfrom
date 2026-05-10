import assert from "node:assert/strict";
import test from "node:test";

import { buildDeterministicArticleRiskNotes } from "./article-risk-notes.ts";

test("buildDeterministicArticleRiskNotes flags forbidden, high-risk, and missing material cases", () => {
  const notes = buildDeterministicArticleRiskNotes({
    variants: [
      {
        styleLabel: "seed",
        title: "保证上车的内部价小户型",
        bodyText: "这个项目不限购，适合预算有限客户。",
        hashtags: ["小户型"],
        ctaText: "私信了解",
        coverCopySuggestions: [],
        imageStructureSuggestions: [],
        rationale: "",
      },
    ],
    forbiddenWords: ["内部价"],
    materialRefs: [],
  });

  assert.ok(notes.some((note) => note.includes("命中商家违禁词")));
  assert.ok(notes.some((note) => note.includes("包含高风险表达")));
  assert.ok(notes.some((note) => note.includes("未匹配到真实项目图片素材")));
});
