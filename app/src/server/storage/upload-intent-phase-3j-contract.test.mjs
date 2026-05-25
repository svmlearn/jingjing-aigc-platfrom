import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mediaContractSource = readSource("../../contracts/media.ts");
const objectStorageSource = readSource("./object-storage.ts");
const aliyunProviderSource = readSource("./aliyun-oss-provider.ts");

test("MediaUploadIntentDto uses storageKey/uploadKey as required current fields", () => {
  const dtoBody = extractTypeBody(mediaContractSource, "MediaUploadIntentDto");

  assert.match(dtoBody, /storageKey:\s*string;/);
  assert.match(dtoBody, /uploadKey:\s*string;/);
  assert.doesNotMatch(dtoBody, /storageKey\?:/);
  assert.doesNotMatch(dtoBody, /uploadKey\?:/);
  assert.match(dtoBody, /@deprecated Legacy client alias only\. Use storageKey\/uploadKey/);
  assert.match(dtoBody, /cosKey\?:\s*string;/);
});

test("object-storage facade builds current key fields plus deprecated alias from one storage key", () => {
  const helperBody = extractFunctionBody(objectStorageSource, "buildBrowserUploadIntentStorageKeys");

  assert.match(helperBody, /storageKey,/);
  assert.match(helperBody, /uploadKey:\s*storageKey/);
  assert.match(helperBody, /cosKey:\s*storageKey/);
});

test("Aliyun upload intent uses storageKey/uploadKey-first alias helper", () => {
  const body = extractMethodBody(aliyunProviderSource, "issueBrowserUploadIntent");

  assert.match(body, /\.\.\.buildBrowserUploadIntentStorageKeys\(input\.storageKey\)/);
  assert.doesNotMatch(body, /cosKey:\s*input\.storageKey/);
  assert.match(body, /provider:\s*"aliyun_oss"/);
  assert.match(body, /uploadUrl/);
});

test("Aliyun provider cannot return a current browser upload intent with only legacy cosKey", () => {
  const body = extractMethodBody(aliyunProviderSource, "issueBrowserUploadIntent");

  assert.match(
    body,
    /buildBrowserUploadIntentStorageKeys\(input\.storageKey\)/,
    "Aliyun provider should include required storageKey/uploadKey fields via the shared helper.",
  );
  assert.doesNotMatch(
    body,
    /return\s*{[\s\S]*cosKey:\s*input\.storageKey[\s\S]*}/,
    "Aliyun provider should not hand-roll a legacy-only cosKey response.",
  );
});

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function extractTypeBody(source, typeName) {
  const start = source.indexOf(`export type ${typeName} = {`);
  assert.notEqual(start, -1, `${typeName} should exist.`);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${typeName} should have a body.`);

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

  throw new Error(`${typeName} body is not closed.`);
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist.`);

  return extractBodyAfterParameters(source, functionName, start);
}

function extractMethodBody(source, methodName) {
  const start = source.indexOf(`${methodName}(input)`);
  assert.notEqual(start, -1, `${methodName} should exist.`);

  return extractBodyAfterParameters(source, methodName, start);
}

function extractBodyAfterParameters(source, name, start) {
  const parameterStart = source.indexOf("(", start);
  assert.notEqual(parameterStart, -1, `${name} should have parameters.`);

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

  assert.notEqual(parameterEnd, -1, `${name} parameters should be closed.`);

  const bodyStart = source.indexOf("{", parameterEnd);
  assert.notEqual(bodyStart, -1, `${name} should have a body.`);

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

  throw new Error(`${name} body is not closed.`);
}
