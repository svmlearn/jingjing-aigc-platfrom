import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const schemasSource = readFileSync(new URL("./schemas.ts", import.meta.url), "utf8");
const mediaCompleteSchemaBlock = extractSourceBlock(
  schemasSource,
  "export const mediaCompleteSchema = z.object({",
  "const merchantMediaManifestTagSchema",
);

test("mediaCompleteSchema accepts Aliyun OSS for current media complete requests", () => {
  assert.match(mediaCompleteSchemaBlock, /storageProvider: z\.literal\("aliyun_oss"\)/);
});

test("mediaCompleteSchema rejects historical removed storage for current media complete requests", () => {
  assert.doesNotMatch(mediaCompleteSchemaBlock, /supabase_storage/);
});

test("mediaCompleteSchema rejects non-Aliyun providers for current media complete requests", () => {
  assert.doesNotMatch(mediaCompleteSchemaBlock, /z\.enum\(\[/);
});

function extractSourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Missing source block start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source block end: ${end}`);

  return source.slice(startIndex, endIndex);
}
