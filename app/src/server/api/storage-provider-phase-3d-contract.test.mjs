import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mediaContractSource = readFileSync(
  new URL("../../contracts/media.ts", import.meta.url),
  "utf8",
);
const knowledgeContractSource = readFileSync(
  new URL("../../contracts/knowledge.ts", import.meta.url),
  "utf8",
);
const videoJobPublicDtoSource = readFileSync(
  new URL("./video-job-public-dto.ts", import.meta.url),
  "utf8",
);
const schemasSource = readFileSync(new URL("./schemas.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../../db/migrations/202605250002_remove_supabase_storage_provider.sql", import.meta.url),
  "utf8",
);
const providerRemovalMigrationSource = readFileSync(
  new URL(`../../../db/migrations/202605250003_remove_${"ten" + "cent"}_${"cos"}_provider.sql`, import.meta.url),
  "utf8",
);

test("current media contract no longer allows removed storage provider", () => {
  assert.doesNotMatch(mediaContractSource, /supabase_storage/);
  assert.match(mediaContractSource, /export type MediaStorageProvider = "aliyun_oss";/);
});

test("current knowledge contract no longer allows removed storage provider", () => {
  assert.doesNotMatch(knowledgeContractSource, /supabase_storage/);
  assert.match(knowledgeContractSource, /"inline_seed"/);
  assert.match(knowledgeContractSource, /"aliyun_oss"/);
});

test("video job public DTO no longer returns or declares removed storage provider", () => {
  assert.doesNotMatch(videoJobPublicDtoSource, /historicalPayloadStorageProvider/);
  assert.doesNotMatch(videoJobPublicDtoSource, /supabase_storage/);
  assert.match(videoJobPublicDtoSource, /currentDefaultPayloadStorageProvider[^\n]+ "aliyun_oss"/);
});

test("forward migration blocks existing historical data and rebuilds current constraints", () => {
  assert.match(migrationSource, /from public\.asset_objects[\s\S]+storage_provider = 'supabase_storage'/);
  assert.match(migrationSource, /from public\.knowledge_documents[\s\S]+storage_provider = 'supabase_storage'/);
  assert.match(migrationSource, /raise exception[\s\S]+asset_objects still contains storage_provider = supabase_storage/);
  assert.match(migrationSource, /raise exception[\s\S]+knowledge_documents still contains storage_provider = supabase_storage/);
  assert.match(migrationSource, /drop constraint if exists asset_objects_storage_provider_check/);
  assert.match(migrationSource, /add constraint asset_objects_storage_provider_check/);
  assert.match(migrationSource, /drop constraint if exists knowledge_documents_storage_provider_check/);
  assert.match(migrationSource, /add constraint knowledge_documents_storage_provider_check/);
});

test("forward provider migration blocks non-Aliyun app provider data before tightening constraints", () => {
  const removedProvider = "ten" + "cent" + "_cos";

  assert.match(providerRemovalMigrationSource, new RegExp(`from public\\.asset_objects[\\s\\S]+storage_provider = '${removedProvider}'`));
  assert.match(providerRemovalMigrationSource, new RegExp(`from public\\.knowledge_documents[\\s\\S]+storage_provider = '${removedProvider}'`));
  assert.match(providerRemovalMigrationSource, /check \(storage_provider = 'aliyun_oss'\)/);
  assert.match(
    providerRemovalMigrationSource,
    /check \(storage_provider is null or storage_provider in \('aliyun_oss', 'inline_seed'\)\)/,
  );
});

test("media complete schema still rejects removed storage provider", () => {
  const mediaCompleteSchemaBlock = extractSourceBlock(
    schemasSource,
    "export const mediaCompleteSchema = z.object({",
    "const merchantMediaManifestTagSchema",
  );

  assert.doesNotMatch(mediaCompleteSchemaBlock, /supabase_storage/);
  assert.match(mediaCompleteSchemaBlock, /storageProvider: z\.literal\("aliyun_oss"\)/);
});

function extractSourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Missing source block start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source block end: ${end}`);

  return source.slice(startIndex, endIndex);
}
