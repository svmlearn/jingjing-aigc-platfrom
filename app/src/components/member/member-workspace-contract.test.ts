import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./member-workspace.tsx", import.meta.url), "utf8");

test("member video job config does not turn script target duration into render cap", () => {
  const builderStart = source.indexOf("function buildMemberVideoProductionConfig");
  assert.notEqual(builderStart, -1);
  const builderSource = source.slice(builderStart, source.indexOf("function readRecommendedBgmConfig"));

  assert.doesNotMatch(builderSource, /maxDurationSeconds/);
  assert.doesNotMatch(builderSource, /targetDurationSeconds/);
});
