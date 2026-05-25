import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./video-workflow.ts", import.meta.url), "utf8");

test("upload intent resolves object keys from storageKey and uploadKey before legacy cosKey", () => {
  const createUploadIntentBody = extractFunctionBody("createUploadIntent");
  const storageKeyIndex = createUploadIntentBody.indexOf('readString(source, "storageKey", "storage_key", "uploadKey", "upload_key", "key", "cosKey", "cos_key")');
  const uploadKeyIndex = createUploadIntentBody.indexOf('readString(source, "uploadKey", "upload_key", "storageKey", "storage_key", "key", "cosKey", "cos_key")');
  const cosKeyIndex = createUploadIntentBody.indexOf('readString(source, "cosKey", "cos_key", "storageKey", "storage_key", "uploadKey", "upload_key", "key")');

  assert.ok(storageKeyIndex >= 0, "createUploadIntent should read storageKey first.");
  assert.ok(uploadKeyIndex > storageKeyIndex, "createUploadIntent should read uploadKey after storageKey.");
  assert.ok(cosKeyIndex > uploadKeyIndex, "createUploadIntent should keep cosKey as a later legacy alias.");
  assert.match(createUploadIntentBody, /cosKey,/);
  assert.match(source, /Legacy alias retained for older callers while the current upload path uses storageKey\/uploadKey/);
});

test("Aliyun OSS upload path does not depend on legacy cosKey", () => {
  const aliyunBody = extractFunctionBody("uploadToAliyunOss");

  assert.doesNotMatch(aliyunBody, /cosKey/);
  assert.match(aliyunBody, /params\.intent\.storageKey/);
  assert.match(aliyunBody, /uploadUrl/);
});

test("Tencent compatibility upload path passes provider-neutral object key into the SDK", () => {
  const uploadBody = extractFunctionBody("uploadToTencentCompatibleObjectStorage");

  assert.match(uploadBody, /const uploadKey = getUploadObjectKey\(params\.intent\)/);
  assert.match(uploadBody, /Key: uploadKey/);
  assert.match(uploadBody, /\$\{uploadKey\}-\$\{params\.file\.size\}/);
  assert.doesNotMatch(source, /function uploadToCos/);
});

test("upload errors use object storage or explicit legacy Tencent wording", () => {
  for (const forbidden of [
    "上传到 COS",
    "COS 临时凭证",
    "COS SDK 不支持",
    "COS 超时",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(forbidden)));
  }

  assert.match(source, /上传到对象存储/);
  assert.match(source, /legacy Tencent 对象存储临时凭证/);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
