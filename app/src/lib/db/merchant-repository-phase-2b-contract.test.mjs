import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const merchantRepositorySource = readFileSync(
  new URL("./merchant-repository.ts", import.meta.url),
  "utf8",
);

const postgresVideoChainSource = readFileSync(
  new URL("./postgres-video-chain-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupabaseAdminClient",
  "isSupabaseAdminConfigured",
  "cloudSupabaseRequiredError",
  "redeem_invitation_code",
  "supabase",
  "Supabase",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("merchant repository does not contain legacy admin fallback strings", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(merchantRepositorySource, pattern, pattern.source);
  }
});

test("owner invite and merchant profile functions delegate to PostgreSQL helpers", () => {
  assertFunctionReturns("createInvitationCode", "pgCreateInvitationCode(input)");
  assertFunctionReturns("redeemInvitationCode", "pgRedeemInvitationCode(input)");
  assertFunctionReturns("getMerchantProfileById", "pgGetMerchantProfileById(id)");
  assertFunctionReturns(
    "getMerchantProfileByOwnerUserId",
    "pgGetMerchantProfileByOwnerUserId(ownerUserId)",
  );
  assertFunctionReturns("updateMerchantProfile", "pgUpdateMerchantProfile(ownerUserId, input)");

  for (const helper of [
    "pgCreateInvitationCode",
    "pgRedeemInvitationCode",
    "pgGetMerchantProfileById",
    "pgGetMerchantProfileByOwnerUserId",
    "pgUpdateMerchantProfile",
  ]) {
    assert.match(postgresVideoChainSource, new RegExp(`export async function ${helper}`));
  }
});

test("team and member invitation functions delegate to PostgreSQL helpers", () => {
  assertFunctionReturns(
    "listActiveMerchantTeamMembersByMerchant",
    "pgListActiveMerchantTeamMembersByMerchant(merchantId)",
  );
  assertFunctionBody("getMerchantTeamManagementForOwner", [
    "getOperationalMerchantWorkspaceByUserId(ownerUserId)",
    "assertMerchantTeamOwner(workspace)",
    "listActiveMerchantTeamMembersByMerchant(merchantId)",
    "listMerchantTeamInvitationCodesByMerchant(merchantId)",
  ]);
  assertFunctionBody("createMemberInvitationCodeForOwner", [
    "getOperationalMerchantWorkspaceByUserId(input.ownerUserId)",
    "assertMerchantTeamOwner(workspace)",
    "pgCreateMemberInvitationCodeForOwner",
    "normalizeMemberInvitationCode(input.code ?? generateMemberInvitationCode())",
  ]);
  assertFunctionReturns(
    "listMerchantTeamInvitationCodesByMerchant",
    "pgListMerchantTeamInvitationCodesByMerchant(merchantId)",
  );
  assertFunctionReturns("acceptMemberInvitationCode", "pgAcceptMemberInvitationCode(input)");

  for (const helper of [
    "pgListActiveMerchantTeamMembersByMerchant",
    "pgListMerchantTeamInvitationCodesByMerchant",
    "pgCreateMemberInvitationCodeForOwner",
    "pgAcceptMemberInvitationCode",
  ]) {
    assert.match(postgresVideoChainSource, new RegExp(`export async function ${helper}`));
  }
});

test("workspace selection functions use PostgreSQL app DB helpers and operational guards", () => {
  assertFunctionReturns(
    "getMerchantWorkspaceByUserId",
    "pgGetMerchantWorkspaceByUserId(userId, merchantId)",
  );
  assertFunctionBody("listOperationalMerchantWorkspacesByUserId", [
    "pgListMerchantWorkspacesByUserId(userId)",
    'workspace.merchantProfile.status === "active"',
  ]);
  assertFunctionBody("selectOperationalMerchantWorkspaceForUser", [
    "pgSelectMerchantWorkspaceForUser(input)",
    "assertMerchantOperational(workspace.merchantProfile)",
  ]);
  assertFunctionBody("getOperationalMerchantProfileByOwnerUserId", [
    "getMerchantWorkspaceByUserId(ownerUserId)",
    "assertMerchantOperational(profile)",
  ]);
  assertFunctionBody("getOperationalMerchantWorkspaceByUserId", [
    "getMerchantWorkspaceByUserId(userId)",
    "assertMerchantOperational(workspace.merchantProfile)",
  ]);

  for (const helper of [
    "pgGetMerchantWorkspaceByUserId",
    "pgListMerchantWorkspacesByUserId",
    "pgSelectMerchantWorkspaceForUser",
  ]) {
    assert.match(postgresVideoChainSource, new RegExp(`export async function ${helper}`));
  }
});

test("kept local helpers are current app-owned helpers without legacy wording", () => {
  assert.match(merchantRepositorySource, /export function mapMerchantProfile/);
  assert.match(merchantRepositorySource, /function assertMerchantTeamOwner/);
  assert.match(merchantRepositorySource, /function normalizeMemberInvitationCode/);
  assert.doesNotMatch(merchantRepositorySource, /LEGACY_AUTH_FALLBACK_NOT_CONFIGURED/);
  assert.doesNotMatch(merchantRepositorySource, /not configured for this environment/);
});

function assertFunctionReturns(functionName, expression) {
  assertFunctionBody(functionName, [`return ${expression};`]);
}

function assertFunctionBody(functionName, expectedSnippets) {
  const functionBody = extractFunctionBody(merchantRepositorySource, functionName);
  for (const snippet of expectedSnippets) {
    assert.match(
      functionBody,
      new RegExp(escapeRegExp(snippet)),
      `${functionName} should include ${snippet}`,
    );
  }
}

function extractFunctionBody(source, functionName) {
  const exportSignatureIndex = source.indexOf(`export async function ${functionName}`);
  const exportRegularSignatureIndex = source.indexOf(`export function ${functionName}`);
  const regularSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportSignatureIndex !== -1
      ? exportSignatureIndex
      : exportRegularSignatureIndex !== -1
        ? exportRegularSignatureIndex
        : regularSignatureIndex;
  assert.notEqual(signatureIndex, -1, `${functionName} should exist.`);

  const returnTypeIndex = source.indexOf("):", signatureIndex);
  const bodyStart = source.indexOf("{", returnTypeIndex === -1 ? signatureIndex : returnTypeIndex);
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
