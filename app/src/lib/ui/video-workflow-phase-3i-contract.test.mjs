import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video-workflow.ts", import.meta.url), "utf8");
const removedLegacyKeyField = "cos" + "Key";
const removedLegacySnakeField = "cos" + "_key";

test("upload intent resolves object keys only from storageKey and uploadKey", () => {
  const createUploadIntentBody = extractFunctionBody("createUploadIntent");
  const objectKeyFields = extractReadStringFields(createUploadIntentBody, "objectKey");

  assert.deepEqual(
    objectKeyFields,
    ["storageKey", "storage_key", "uploadKey", "upload_key"],
    "createUploadIntent should resolve a provider-neutral object key from current upload intent fields.",
  );
  assert.match(createUploadIntentBody, /const storageKey = objectKey;/);
  assert.match(createUploadIntentBody, /const uploadKey = objectKey;/);
  assert.doesNotMatch(createUploadIntentBody, new RegExp(removedLegacyKeyField));
  assert.doesNotMatch(createUploadIntentBody, new RegExp(removedLegacySnakeField));
});

test("removed legacy-only upload intent responses no longer populate key fields", () => {
  const createUploadIntentBody = extractFunctionBody("createUploadIntent");
  const objectKeyFields = extractReadStringFields(createUploadIntentBody, "objectKey");
  const responseFields = {
    [removedLegacyKeyField]: "legacy-object-key",
    [removedLegacySnakeField]: "legacy-object-key",
  };
  const resolvedObjectKey = readStringFromFields(responseFields, objectKeyFields);

  assert.equal(resolvedObjectKey, null);
});

test("Aliyun OSS upload path only uses current object key fields", () => {
  const aliyunBody = extractFunctionBody("uploadToAliyunOss");

  assert.doesNotMatch(aliyunBody, new RegExp(removedLegacyKeyField));
  assert.match(aliyunBody, /params\.intent\.storageKey/);
  assert.match(aliyunBody, /uploadUrl/);
});

test("upload errors use object storage wording only", () => {
  const legacyStorageName = "CO" + "S";
  for (const forbidden of [
    `上传到 ${legacyStorageName}`,
    `${legacyStorageName} 临时凭证`,
    `${legacyStorageName} SDK 不支持`,
    `${legacyStorageName} 超时`,
    `legacy ${"Ten" + "cent"}`,
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(forbidden)));
  }

  assert.match(source, /上传意图返回了暂不支持的存储 provider/);
});

function extractFunctionBody(functionName) {
  const startIndex = [
    source.indexOf(`function ${functionName}`),
    source.indexOf(`async function ${functionName}`),
  ]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  assert.notEqual(startIndex, undefined, `${functionName} should exist.`);

  const parameterStart = source.indexOf("(", startIndex);
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

  const bodyStart = source.indexOf("{", parameterEnd);
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

function extractReadStringFields(functionBody, variableName) {
  const expressionPattern = new RegExp(
    `const\\s+${variableName}\\s*=\\s*readString\\(source,\\s*([^;]+)\\);`,
  );
  const match = functionBody.match(expressionPattern);

  assert.ok(match, `${variableName} should be assigned from readString(source, ...).`);

  return Array.from(match[1].matchAll(/"([^"]+)"/g), (fieldMatch) => fieldMatch[1]);
}

function readStringFromFields(input, fields) {
  for (const field of fields) {
    const value = input[field];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
