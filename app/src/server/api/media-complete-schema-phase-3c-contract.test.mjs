import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { z } from "zod";

const schemasSource = readFileSync(new URL("./schemas.ts", import.meta.url), "utf8");
const mediaCompleteSchemaBlock = extractSourceBlock(
  schemasSource,
  "export const mediaCompleteSchema = z.object({",
  "const merchantMediaManifestTagSchema",
);
const providerValues = extractStorageProviderEnumValues(mediaCompleteSchemaBlock);
const storageProviderSchema = z.enum(providerValues);

test("mediaCompleteSchema accepts Aliyun OSS for current media complete requests", () => {
  assert.equal(storageProviderSchema.safeParse("aliyun_oss").success, true);
});

test("mediaCompleteSchema rejects historical Supabase storage for current media complete requests", () => {
  assert.equal(storageProviderSchema.safeParse("supabase_storage").success, false);
  assert.doesNotMatch(mediaCompleteSchemaBlock, /supabase_storage/);
});

test("mediaCompleteSchema keeps Tencent COS only as schema-level compatibility", () => {
  assert.equal(storageProviderSchema.safeParse("tencent_cos").success, true);
});

function extractStorageProviderEnumValues(source) {
  const match = source.match(/storageProvider:\s*z\.enum\((\[[^\]]+\])\)/);
  assert.ok(match, "mediaCompleteSchema should define storageProvider with z.enum.");
  return JSON.parse(match[1]);
}

function extractSourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Missing source block start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source block end: ${end}`);

  return source.slice(startIndex, endIndex);
}
