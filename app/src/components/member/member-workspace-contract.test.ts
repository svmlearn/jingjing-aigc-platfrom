import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./member-workspace.tsx", import.meta.url), "utf8");

test("member video job config does not turn script target duration into render cap", () => {
  const builderStart = source.indexOf("function buildMemberVideoProductionConfig");
  assert.notEqual(builderStart, -1);
  const builderSource = source.slice(builderStart, source.indexOf("function readRecommendedBgmConfig"));

  assert.match(builderSource, /maxDurationSeconds: memberVideoRenderMaxDurationSeconds/);
  assert.doesNotMatch(builderSource, /targetDurationSeconds/);
});

test("member video draft prompt carries visual description without material slot wording", () => {
  const builderStart = source.indexOf("function buildVideoDraftPrompt");
  assert.notEqual(builderStart, -1);
  const builderSource = source.slice(builderStart, source.indexOf("function buildVideoScriptFromVariant"));

  assert.match(builderSource, /画面：/);
  assert.doesNotMatch(builderSource, /素材：/);
  assert.doesNotMatch(builderSource, /materialSlot/);
});

test("member video page restores only in-flight jobs from calendar entry", () => {
  assert.match(source, /listVideoEditJobsByQuery/);
  assert.match(source, /state: "in_flight"/);
  assert.match(source, /contentVariantId: difyDraftReference\.contentVariantId/);
  assert.match(source, /setRestoredJobMode\("in_flight"\)/);
});

test("member video history mode restores exact job and disables re-edit", () => {
  assert.match(source, /getVideoEditJobDetail\(jobId\)/);
  assert.match(source, /setRestoredJobMode\("history"\)/);
  assert.match(source, /const jobReviewMode = restoredJobMode === "history" && Boolean\(job\)/);
  assert.match(source, /jobReviewMode \|\|/);
  assert.match(source, /只读回看/);
});

test("member history links video jobs back to task page with job id", () => {
  assert.match(source, /function HistoryVideoJobCard/);
  assert.match(source, /\/member\/video\/\$\{encodeURIComponent\(job\.dailyTaskId\)\}\?jobId=\$\{encodeURIComponent\(job\.id\)\}/);
});
