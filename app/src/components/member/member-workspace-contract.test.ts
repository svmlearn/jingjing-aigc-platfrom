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

test("member video draft prompt carries visual description without material slot wording", () => {
  const builderStart = source.indexOf("function buildVideoDraftPrompt");
  assert.notEqual(builderStart, -1);
  const builderSource = source.slice(builderStart, source.indexOf("function DailyTaskLink"));

  assert.match(builderSource, /画面：/);
  assert.doesNotMatch(builderSource, /素材：/);
  assert.doesNotMatch(builderSource, /materialSlot/);
});
