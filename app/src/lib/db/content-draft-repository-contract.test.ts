import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("./content-draft-repository.ts", import.meta.url),
  "utf8",
);
const videoJobRepositorySource = readFileSync(
  new URL("./video-edit-job-repository.ts", import.meta.url),
  "utf8",
);
const postgresVideoChainRepositorySource = readFileSync(
  new URL("./postgres-video-chain-repository.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../../supabase/migrations/202605150003_content_variant_production_scenes.sql", import.meta.url),
  "utf8",
);

test("content variants persist Dify production scenes through Supabase rows", () => {
  assert.match(migrationSource, /production_scenes jsonb not null default '\[\]'::jsonb/);
  assert.match(repositorySource, /production_scenes: variant\.productionScenes \?\? \[\]/);
  assert.match(repositorySource, /production_scenes: input\.productionScenes \?\? \[\]/);
  assert.match(repositorySource, /"production_scenes"/);
  assert.match(repositorySource, /productionScenes: toProductionScenes\(row\.production_scenes\)/);
});

test("video edit jobs receive persisted production scenes instead of raw Dify JSON", () => {
  assert.match(videoJobRepositorySource, /production_scenes/);
  assert.match(
    videoJobRepositorySource,
    /productionScenes: toProductionScenes\(variant\.production_scenes\)/,
  );
  assert.match(
    postgresVideoChainRepositorySource,
    /productionScenes: variant\.productionScenes/,
  );
  assert.doesNotMatch(videoJobRepositorySource, /final_result_json/);
  assert.doesNotMatch(videoJobRepositorySource, /difyRawOutputs/);
});
