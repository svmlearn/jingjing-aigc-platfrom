import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./video-edit-jobs-service.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "isSupa\x62aseAdminConfigured",
  "createSupa\x62aseAdminClient",
  "@/lib/supa\u0062ase/admin",
  "supabase",
  "Supa\x62ase",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("video edit jobs service no longer imports or checks Supa\x62ase admin configuration", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }
  assert.doesNotMatch(source, /isPostgresVideoChainEnabled/);
});

test("server-managed payload defaults to app DB material, asset, and merchant media loading", () => {
  const body = extractFunctionBody("buildServerManagedInputPayload");
  const promiseAllIndex = body.indexOf("const [allAssets, materialReferences, merchantMediaClips] = await Promise.all");

  assert.notEqual(promiseAllIndex, -1, "payload builder should load app DB context with Promise.all.");
  assert.match(body, /listAssetObjectsByOwner\(\{\s*ownerType: "content_draft",\s*ownerId: input\.draftId,/);
  assert.match(body, /listMaterialWorkbenchReferencesByDraft\(\{\s*merchantId: input\.merchantId,\s*draftId: input\.draftId,\s*targetWorkbench: "video",/);
  assert.match(body, /getPrivateMediaRepository\(\)\.listClipsByMerchant\(\{ merchantId: input\.merchantId \}\)/);
  assert.match(body, /merchantMediaClips,/);
  assert.match(body, /requireUserTalkingHead: true/);
  assert.match(body, /filterVideoEditMaterialReferences\(\{\s*merchantId: input\.merchantId,\s*references: materialReferences,/);
});

test("local real-chain branch is controlled only by explicit local real-chain flag", () => {
  const body = extractFunctionBody("buildServerManagedInputPayload");
  const localGateIndex = body.indexOf("if (isLocalRealChainEnabled())");
  const localAssetIndex = body.indexOf("listLocalRealChainAssetObjectsByOwner");
  const appDbPromiseIndex = body.indexOf("const [allAssets, materialReferences, merchantMediaClips] = await Promise.all");

  assert.notEqual(localGateIndex, -1, "local real-chain gate should be explicit.");
  assert.notEqual(localAssetIndex, -1, "local real-chain branch should use local assets.");
  assert.notEqual(appDbPromiseIndex, -1, "non-local path should still load app DB context.");
  assert.ok(localGateIndex < localAssetIndex, "local real-chain asset load should be inside explicit gate.");
  assert.ok(localAssetIndex < appDbPromiseIndex, "app DB context load should remain the default non-local path.");
  assert.doesNotMatch(body, /isLocalRealChainEnabled\(\)[\s\S]*isSupa\x62aseAdminConfigured/);
  assert.doesNotMatch(body, /isSupa\x62aseAdminConfigured[\s\S]*listLocalRealChainAssetObjectsByOwner/);
});

function extractFunctionBody(functionName) {
  const signatureIndex = source.indexOf(`async function ${functionName}`);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
