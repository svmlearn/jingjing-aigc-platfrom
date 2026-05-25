import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./platform-admin-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupa\x62aseAdminClient",
  "isSupa\x62aseAdminConfigured",
  "@/lib/supa\u0062ase",
  "supabase",
  "Supa\x62ase",
  ".from(",
  "auth.admin",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "listPlatformAdminUsers",
  "createPlatformAdminUser",
  "updatePlatformAdminUser",
  "listPlatformInvitationCodes",
  "createPlatformInvitationCode",
  "updatePlatformInvitationCode",
  "listPlatformMerchants",
  "getPlatformMerchantById",
  "updatePlatformMerchant",
  "getPlatformSettings",
  "updatePlatformSettings",
];

test("platform admin repository does not contain legacy Supa\x62ase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyName of [
    "shouldUseAppPostgres",
    "shouldUseDemoFallback",
    "platformAdminAuthNotConfiguredError",
    "recordPlatformAdminEvent",
    "getPlatformAdminUserById",
    "countActiveSuperAdmins",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyName)), fallbackOnlyName);
  }
});

test("expected platform admin repository functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("PostgreSQL app database primitives and tables remain in use", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "public.platform_admin_users",
    "public.invitation_codes",
    "public.merchant_profiles",
    "public.platform_settings",
    "public.platform_admin_events",
    "insertPlatformAdminEvent",
    "insertAppOwnedInvitationCode",
    "isPostgresUniqueViolation",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("platform admin users stay app-owned and preserve super admin protection", () => {
  assertFunctionBody("listPlatformAdminUsers", [
    "from public.platform_admin_users",
    "return result.rows.map(mapPlatformAdminUser)",
  ]);
  assertFunctionBody("createPlatformAdminUser", [
    "withAppDbTransaction(async (client)",
    "insertAppOwnedPlatformAdminUser(client",
    "insertPlatformAdminEvent(client",
    "platform_admin_user.created",
  ]);
  assertFunctionBody("insertAppOwnedPlatformAdminUser", [
    "insert into public.platform_admin_users",
    "password_hash",
    "createPlatformAdminPasswordHash(input.password)",
    "isPostgresUniqueViolation(error)",
    "PLATFORM_ADMIN_USER_EXISTS",
  ]);
  assertFunctionBody("updatePlatformAdminUser", [
    "current.role === \"super_admin\"",
    "countAppOwnedActiveSuperAdmins(client)",
    "LAST_SUPER_ADMIN_REQUIRED",
    "update public.platform_admin_users",
    "update public.platform_admin_sessions",
    "platform_admin_user.updated",
  ]);
  assertFunctionBody("countAppOwnedActiveSuperAdmins", [
    "from public.platform_admin_users",
    "where role = 'super_admin'",
    "and status = 'active'",
  ]);
});

test("invitation code paths use app-owned PostgreSQL helpers and audit events", () => {
  assertFunctionBody("listPlatformInvitationCodes", [
    "from public.invitation_codes",
    "filterPlatformInvitationCodes",
  ]);
  assertFunctionBody("createPlatformInvitationCode", [
    "insertAppOwnedInvitationCode(client",
    "insertPlatformAdminEvent(client",
    "invitation_code.created",
  ]);
  assertFunctionBody("insertAppOwnedInvitationCode", [
    "insert into public.invitation_codes",
    "isPostgresUniqueViolation(error)",
    "INVITATION_CODE_EXISTS",
  ]);
  assertFunctionBody("updatePlatformInvitationCode", [
    "getAppOwnedPlatformInvitationCodeById(",
    "assertInvitationCodeStatusTransition",
    "update public.invitation_codes",
    "insertPlatformAdminEvent(client",
    "invitation_code.updated",
  ]);
});

test("merchant admin paths use PostgreSQL counts and write audit events", () => {
  assertFunctionBody("listPlatformMerchants", [
    "from public.merchant_profiles",
    "countByMerchant(\"import_jobs\")",
    "countByMerchant(\"content_drafts\")",
  ]);
  assertFunctionBody("getPlatformMerchantById", [
    "from public.merchant_profiles",
    "countMerchantRows(\"import_jobs\", merchantId)",
    "countMerchantRows(\"content_drafts\", merchantId)",
  ]);
  assertFunctionBody("updatePlatformMerchant", [
    "update public.merchant_profiles",
    "insertPlatformAdminEvent(client",
    "merchant.updated",
  ]);
  assertFunctionBody("countByMerchant", [
    "select merchant_id, count(*)::text as count",
    "from public.${table}",
    "group by merchant_id",
  ]);
  assertFunctionBody("countMerchantRows", [
    "select count(*)::text as count",
    "from public.${table}",
    "where merchant_id = $1",
  ]);
});

test("platform settings paths batch upsert settings and write audit events", () => {
  assertFunctionBody("getPlatformSettings", [
    "isLocalDemoRuntime()",
    "from public.platform_settings",
    "mapPlatformSettingsRows(rows)",
  ]);
  assertFunctionBody("updatePlatformSettings", [
    "isLocalDemoRuntime()",
    "for (const row of buildPlatformSettingsRows(next))",
    "insert into public.platform_settings",
    "on conflict (key) do update",
    "insert into public.platform_admin_events",
    "settings.updated",
  ]);
  assertFunctionBody("insertPlatformAdminEvent", [
    "insert into public.platform_admin_events",
    "JSON.stringify(input.details ?? {})",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoPlatformSettings/);
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
