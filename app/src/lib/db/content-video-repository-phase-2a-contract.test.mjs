import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = new Map(
  [
    ["content-draft", "./content-draft-repository.ts"],
    ["video-edit-job", "./video-edit-job-repository.ts"],
    ["media", "./media-repository.ts"],
    ["daily-content-task", "./daily-content-task-repository.ts"],
    ["postgres-video-chain", "./postgres-video-chain-repository.ts"],
  ].map(([name, path]) => [name, readFileSync(new URL(path, import.meta.url), "utf8")]),
);

const phase2aRepositoryNames = [
  "content-draft",
  "video-edit-job",
  "media",
  "daily-content-task",
];

const forbiddenFallbackPatterns = [
  ["create", "Supabase", "AdminClient"].join(""),
  ["is", "Supabase", "AdminConfigured"].join(""),
  ["cloud", "Supabase", "RequiredError"].join(""),
  "requireCloudSupabaseAdmin",
  ["@/lib/", "supabase"].join(""),
  ["Supabase"].join(""),
  ["supabase"].join(""),
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("phase 2a content/video repositories do not contain legacy admin fallback", () => {
  for (const name of phase2aRepositoryNames) {
    const source = sources.get(name) ?? "";
    for (const pattern of forbiddenFallbackPatterns) {
      assert.doesNotMatch(source, pattern, `${name} should not contain ${pattern.source}`);
    }
  }
});

test("content draft repository delegates public operations to PostgreSQL helpers", () => {
  const source = sources.get("content-draft") ?? "";
  const expectations = [
    ["createManualSourceItem", "pgCreateManualSourceItem"],
    ["createDraftWithVariants", "pgCreateDraftWithVariants"],
    ["listDraftBundlesByMerchant", "pgListDraftBundlesByMerchant"],
    ["getDraftBundleByMerchant", "pgGetDraftBundleByMerchant"],
    ["approveContentVariant", "pgApproveContentVariant"],
    ["appendContentVariantToDraft", "pgAppendContentVariantToDraft"],
    ["updateContentVariantScript", "pgUpdateContentVariantScript"],
    ["assertContentVariantAccess", "pgAssertContentVariantAccess"],
    ["appendContentDraftRevisionTrace", "pgAppendContentDraftRevisionTrace"],
  ];

  for (const [exportedName, helperName] of expectations) {
    assert.match(source, new RegExp(`export async function ${exportedName}`));
    assert.match(source, new RegExp(`return ${helperName}\\(input\\);`));
  }
});

test("video edit job repository keeps PostgreSQL dedupe and state-machine helpers", () => {
  const source = sources.get("video-edit-job") ?? "";
  assert.match(source, /const existingInFlightJob = await findInFlightVideoEditJobForScope/);
  assert.match(source, /return pgFindInFlightVideoEditJobForScope\(input\);/);
  assert.match(source, /return pgCreateVideoEditJob\(input\);/);
  assert.match(source, /return pgRetryVideoEditJob\(input\);/);
  assert.match(source, /return pgCancelVideoEditJob\(input\);/);
  assert.match(source, /return pgListVideoEditJobs\(merchantId, filters\);/);
  assert.match(source, /return pgGetVideoEditJobById\(input\);/);
});

test("media repository delegates owner access and asset persistence to PostgreSQL helpers", () => {
  const source = sources.get("media") ?? "";
  const postgresVideoChainSource = sources.get("postgres-video-chain") ?? "";

  assert.match(source, /return pgAssertMediaOwnerAccess\(input\);/);
  assert.match(source, /return pgCreateAssetObject\(input\);/);
  assert.match(source, /return pgListAssetObjectsByOwner\(input\);/);

  assert.match(postgresVideoChainSource, /input\.ownerType === "source_item"/);
  assert.match(postgresVideoChainSource, /input\.ownerType === "content_draft"/);
  assert.match(postgresVideoChainSource, /input\.ownerType === "voice_profile"/);
  assert.match(postgresVideoChainSource, /pgAssertContentVariantAccess/);
});

test("daily content task repository public functions use app database queries", () => {
  const source = sources.get("daily-content-task") ?? "";
  for (const functionName of [
    "getDailyContentTask",
    "upsertDailyContentTask",
    "getDailyContentTaskById",
    "updateDailyContentTaskGeneratedContent",
  ]) {
    assert.match(source, new RegExp(`export async function ${functionName}[\\s\\S]*queryAppDb<DailyContentTaskRow>`));
  }
  assert.match(source, /from public\.daily_content_tasks/);
  assert.match(source, /insert into public\.daily_content_tasks/);
  assert.match(source, /update public\.daily_content_tasks/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
