import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const knowledgeServiceSource = readFileSync(
  new URL("./knowledge-service.ts", import.meta.url),
  "utf8",
);
const videoJobPublicDtoSource = readFileSync(
  new URL("./video-job-public-dto.ts", import.meta.url),
  "utf8",
);
const knowledgeSmokeSource = readFileSync(
  new URL("../../../scripts/check-domestic-knowledge-repository-smoke.mjs", import.meta.url),
  "utf8",
);

test("merchant memory uses inline seed provider for text-only knowledge records", () => {
  const functionBody = extractFunctionBody(knowledgeServiceSource, "createMerchantMemoryForMerchant");

  assert.match(functionBody, /storageProvider: "inline_seed"/);
  assert.match(functionBody, /bucketName: null/);
  assert.match(functionBody, /storageKey: null/);
  assert.match(functionBody, /sourceType: "memory"/);
  assert.match(functionBody, /contentKind: "merchant_memory"/);
  assert.match(functionBody, /chunkPolicy: "single"/);
  assert.match(functionBody, /sourceText: text/);
  assert.doesNotMatch(functionBody, /storageProvider: "supabase_storage"/);
});

test("knowledge repository smoke inserts inline seed provider for text fixtures", () => {
  assert.match(knowledgeSmokeSource, /'inline_seed'/);
  assert.doesNotMatch(knowledgeSmokeSource, /'supabase_storage'/);
});

test("video job public DTO does not default unknown providers to historical removed storage", () => {
  const functionBody = extractFunctionBody(videoJobPublicDtoSource, "normalizePayloadStorageProvider");

  assert.match(videoJobPublicDtoSource, /currentDefaultPayloadStorageProvider[^\n]+ "aliyun_oss"/);
  assert.match(videoJobPublicDtoSource, /historicalPayloadStorageProvider[^\n]+ "supabase_storage"/);
  assert.match(functionBody, /storageProvider === historicalPayloadStorageProvider/);
  assert.match(functionBody, /return historicalPayloadStorageProvider/);
  assert.match(functionBody, /return currentDefaultPayloadStorageProvider/);
  assert.doesNotMatch(functionBody, /return "supabase_storage"/);
});

function extractFunctionBody(source, functionName) {
  const exportAsyncSignatureIndex = source.indexOf(`export async function ${functionName}`);
  const exportSignatureIndex = source.indexOf(`export function ${functionName}`);
  const functionSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportAsyncSignatureIndex !== -1
      ? exportAsyncSignatureIndex
      : exportSignatureIndex !== -1
        ? exportSignatureIndex
        : functionSignatureIndex;

  assert.notEqual(signatureIndex, -1, `${functionName} should exist.`);

  const parameterStart = source.indexOf("(", signatureIndex);
  assert.notEqual(parameterStart, -1, `${functionName} should have parameters.`);

  let parenthesisDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
      if (parenthesisDepth === 0) {
        parameterEnd = index;
        break;
      }
    }
  }

  assert.notEqual(parameterEnd, -1, `${functionName} parameters should be closed.`);

  const bodyStart = source.indexOf(" {\n", parameterEnd);
  assert.notEqual(bodyStart, -1, `${functionName} should have a body.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body is not closed.`);
}
