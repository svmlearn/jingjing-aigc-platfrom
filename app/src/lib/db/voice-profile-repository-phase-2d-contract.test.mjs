import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./voice-profile-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupa\x62aseAdminClient",
  "isSupa\x62aseAdminConfigured",
  "@/lib/supa\u0062ase/admin",
  "supabase",
  "Supa\x62ase",
  ".from(",
  ".rpc(",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicOrKeyFunctions = [
  "listVoiceProfiles",
  "createVoiceProfile",
  "assertVoiceProfileAccess",
  "assertVoiceProfileAudioAsset",
  "attachVoiceProfileAssets",
];

test("voice profile repository does not contain legacy Supa\x62ase data access", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyName of [
    "replace_current_voice_profile",
    "isPostgresVideoChainEnabled",
    "isAppPostgresConfigured",
    "listAssetObjectsByOwner",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyName)), fallbackOnlyName);
  }
});

test("expected voice profile repository functions still exist", () => {
  for (const functionName of publicOrKeyFunctions) {
    assert.match(source, new RegExp(`(?:export async function|async function) ${functionName}`), functionName);
  }
});

test("list and access paths use PostgreSQL voice profile table", () => {
  assert.match(source, /queryAppDb/);
  assert.match(source, /withAppDbTransaction/);
  assert.match(source, /public\.voice_profiles/);
  assert.match(source, /public\.asset_objects/);

  assertFunctionBody("listVoiceProfiles", [
    "isLocalDemoRuntime()",
    "from public.voice_profiles",
    "status <> 'archived'",
    "return attachVoiceProfileAssets(result.rows.map(mapVoiceProfile))",
  ]);

  assertFunctionBody("assertVoiceProfileAccess", [
    "isLocalDemoRuntime()",
    "from public.voice_profiles",
    "and status = 'ready'",
    "VOICE_PROFILE_NOT_FOUND",
  ]);
});

test("create keeps authorization, ready-profile archive, and PostgreSQL insert semantics", () => {
  assertFunctionBody("createVoiceProfile", [
    "VOICE_PROFILE_AUTHORIZATION_REQUIRED",
    "isLocalDemoRuntime()",
    "createLocalDemoVoiceProfileAudioAsset({",
    "assertVoiceProfileAudioAsset({",
    "withAppDbTransaction(async (client)",
    "from public.voice_profiles",
    "for update",
    "update public.voice_profiles",
    "set status = 'archived'",
    "and status = 'ready'",
    "insert into public.voice_profiles",
    "values ($1, $2, $3, $4, 'ready', 'pixelle_clone', $5, timezone('utc', now()))",
    "return { ...profile, refAudioAsset }",
  ]);
});

test("local demo voice profile creation does not query app database before fallback", () => {
  const functionBody = extractFunctionBody("createVoiceProfile");
  const localDemoIndex = functionBody.indexOf("if (isLocalDemoRuntime())");
  const appDbAudioAssetIndex = functionBody.indexOf("const refAudioAsset = await assertVoiceProfileAudioAsset({");

  assert.notEqual(localDemoIndex, -1, "createVoiceProfile should keep a local demo branch.");
  assert.notEqual(appDbAudioAssetIndex, -1, "createVoiceProfile should still validate audio assets on the app DB path.");
  assert.ok(
    localDemoIndex < appDbAudioAssetIndex,
    "createVoiceProfile local demo branch should run before the app DB audio asset lookup.",
  );

  const localDemoBranch = functionBody.slice(localDemoIndex, appDbAudioAssetIndex);
  assert.match(localDemoBranch, /createLocalDemoVoiceProfileAudioAsset/);
  assert.match(localDemoBranch, /localVoiceProfileStore\.voiceProfiles\.set/);
  assert.match(localDemoBranch, /status: "ready"/);
  assert.doesNotMatch(localDemoBranch, /queryAppDb/);
  assert.doesNotMatch(localDemoBranch, /withAppDbTransaction/);
  assert.doesNotMatch(localDemoBranch, /assertVoiceProfileAudioAsset/);
});

test("audio asset lookup stays scoped to voice profile owner, audio type, and current providers", () => {
  assertFunctionBody("assertVoiceProfileAudioAsset", [
    "from public.asset_objects",
    "owner_type = 'voice_profile'",
    "owner_id = $2",
    "asset_type = 'audio'",
    "storage_provider = 'aliyun_oss'",
    "VOICE_PROFILE_AUDIO_ASSET_INVALID",
    "assertVoiceProfileAudioStorageKey(input, asset)",
  ]);

  assertFunctionBody("assertVoiceProfileAudioStorageKey", [
    "voice-profiles/${input.merchantId}/${input.voiceProfileId}/",
    "draft-inputs/${input.merchantId}/${input.voiceProfileId}/voice-profile-audio/",
    "Reference audio asset does not belong to this voice profile.",
  ]);

  assertFunctionBody("createLocalDemoVoiceProfileAudioAsset", [
    "id: input.assetId",
    "ownerType: \"voice_profile\"",
    "ownerId: input.voiceProfileId",
    "assetType: \"audio\"",
    "storageProvider: \"aliyun_oss\"",
    "voice-profiles/${input.merchantId}/${input.voiceProfileId}/local-demo-ref-audio.wav",
    "sortOrder: 0",
    "createdAt: input.now",
    "updatedAt: input.now",
    "assertVoiceProfileAudioStorageKey(input, asset)",
  ]);
});

test("attached ref audio asset path uses PostgreSQL asset objects", () => {
  assertFunctionBody("attachVoiceProfileAssets", [
    "from public.asset_objects",
    "id = any($1::uuid[])",
    "profiles.map((profile) => profile.refAudioAssetId)",
    "refAudioAsset: assetsById.get(profile.refAudioAssetId) ?? null",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /localVoiceProfileStore/);
  assert.doesNotMatch(source, /isSupa\x62aseAdminConfigured/);
});

function assertFunctionBody(functionName, expectedSnippets) {
  const functionBody = extractFunctionBody(functionName);
  for (const snippet of expectedSnippets) {
    assert.match(
      functionBody,
      new RegExp(escapeRegExp(snippet)),
      `${functionName} should include ${snippet}`,
    );
  }
}

function extractFunctionBody(functionName) {
  const exportAsyncSignatureIndex = source.indexOf(`export async function ${functionName}`);
  const asyncSignatureIndex = source.indexOf(`async function ${functionName}`);
  const regularSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportAsyncSignatureIndex !== -1
      ? exportAsyncSignatureIndex
      : asyncSignatureIndex !== -1
        ? asyncSignatureIndex
        : regularSignatureIndex;
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
