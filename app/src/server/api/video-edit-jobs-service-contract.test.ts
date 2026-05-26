import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video-edit-jobs-service.ts", import.meta.url), "utf8");

test("video job creation auto-locks a non-empty script before building payload", () => {
  assert.match(
    source,
    /const executableVariant = await ensureVideoScriptApprovedForJob\([\s\S]*?variant,[\s\S]*?\);[\s\S]*?buildServerManagedInputPayload\([\s\S]*?variant: executableVariant,/,
  );
  assert.match(
    source,
    /function ensureVideoScriptApprovedForJob[\s\S]*?VIDEO_SCRIPT_TEXT_REQUIRED[\s\S]*?approveContentVariant\([\s\S]*?reviewStatus: approvedVariant\.reviewStatus/,
  );
  assert.doesNotMatch(
    source,
    /buildServerManagedInputPayload\([\s\S]*?variant: variant,/,
  );
});

test("video job payload uses structured scene upload signal and includes merchant clips", () => {
  assert.match(
    source,
    /getPrivateMediaRepository\(\)\.listClipsByMerchant\(\{ merchantId: input\.merchantId \}\)/,
  );
  assert.match(source, /merchantMediaClips,/);
  assert.match(source, /requireUserTalkingHead: variantRequiresUserTalkingHead\(input\.variant\)/);
  assert.match(
    source,
    /function variantRequiresUserTalkingHead[\s\S]*?productionScenes[\s\S]*?requiresUserUpload === true/,
  );
});

test("video job creation resolves dailyTaskId into material context", () => {
  assert.match(source, /requestDailyTaskId: input\.request\.dailyTaskId \?\? null/);
  assert.match(source, /payload\.materialContext\.dailyTaskId = input\.dailyTaskId/);
  assert.match(source, /getDailyContentTaskById\(\{/);
  assert.match(source, /VIDEO_DAILY_TASK_DRAFT_MISMATCH/);
  assert.match(source, /VIDEO_DAILY_TASK_VARIANT_MISMATCH/);
});

test("video job list supports member task restore filters", () => {
  assert.match(source, /state\?: "in_flight"/);
  assert.match(source, /dailyTaskId\?: string \| null/);
  assert.match(source, /contentVariantId\?: string \| null/);
  assert.match(source, /state: input\.state/);
  assert.match(source, /dailyTaskId: input\.dailyTaskId/);
  assert.match(source, /contentVariantId: input\.contentVariantId/);
});
