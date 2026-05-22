import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sources = new Map(
  [
    ["current-user", "./current-user.ts"],
    ["domestic-session", "./domestic-session.ts"],
    ["platform-admin-session", "./platform-admin-session.ts"],
    ["login-action", "../../app/(auth)/login/actions.ts"],
    ["logout-route", "../../app/(auth)/logout/route.ts"],
    ["merchant-login-route", "../../app/api/auth/merchant-login/route.ts"],
    ["owner-register-route", "../../app/api/auth/register-with-invite/route.ts"],
    ["member-login-route", "../../app/api/auth/member-login/route.ts"],
    ["member-register-route", "../../app/api/auth/member-register-with-invite/route.ts"],
    ["dashboard-layout", "../../app/dashboard/layout.tsx"],
    ["proxy", "../../proxy.ts"],
  ].map(([name, path]) => [
    name,
    readFileSync(new URL(path, import.meta.url), "utf8"),
  ]),
);

const forbiddenPatterns = [
  ["@", "supa", "base"].join(""),
  ["create", "Supa", "base"].join(""),
  ["is", "Supa", "base"].join(""),
  ["Supa", "base Auth"].join(""),
  ["supa", "base-not-configured"].join(""),
  ["SUPA", "BASE_NOT_CONFIGURED"].join(""),
  ["lib/", "supa", "base"].join(""),
  ["auth.", "getUser"].join(""),
  ["auth.", "signOut"].join(""),
  ["auth.", "signInWithPassword"].join(""),
  ["auth", ".admin.", "createUser"].join(""),
  ["auth", ".admin.", "deleteUser"].join(""),
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("auth entrypoints do not import or call the legacy session provider", () => {
  for (const [name, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${name} should not contain ${pattern.source}`);
    }
  }
});

test("current user only returns the app-owned authenticated user type", () => {
  const currentUserSource = sources.get("current-user") ?? "";
  assert.match(currentUserSource, /Promise<AuthenticatedUser>/);
  assert.match(currentUserSource, /getDomesticAuthenticatedUser/);
  assert.match(currentUserSource, /APP_DATABASE_NOT_CONFIGURED/);
  assert.match(currentUserSource, /APP_SESSION_NOT_CONFIGURED/);
});

test("domestic session maps database users with current project naming", () => {
  const domesticSessionSource = sources.get("domestic-session") ?? "";
  assert.match(domesticSessionSource, /AuthenticatedUser/);
  assert.match(domesticSessionSource, /toAuthenticatedUser/);
  assert.match(domesticSessionSource, /appMetadata/);
  assert.match(domesticSessionSource, /userMetadata/);
  assert.match(domesticSessionSource, /UNAUTHENTICATED/);
});

test("merchant and member auth routes fail closed when app-owned session is unavailable", () => {
  for (const name of [
    "login-action",
    "merchant-login-route",
    "owner-register-route",
    "member-login-route",
    "member-register-route",
  ]) {
    const source = sources.get(name) ?? "";
    assert.match(source, /isDomesticSessionEnabled/);
    assert.match(source, /AUTH_SERVICE_NOT_CONFIGURED|auth-not-configured/);
  }
});

test("merchant profile check failure revokes the newly-created domestic session", () => {
  for (const name of ["login-action", "merchant-login-route"]) {
    const source = sources.get(name) ?? "";
    assert.match(source, /signOutDomesticUser/);
    assert.match(
      source,
      /getOperationalMerchantProfileByOwnerUserId[\s\S]*catch[\s\S]*signOutDomesticUser[\s\S]*no-merchant-profile/,
      `${name} should revoke the domestic session and return no-merchant-profile after profile lookup failure.`,
    );
    assert.match(
      source,
      /signInDomesticUser[\s\S]*catch\(\(\) => null\)[\s\S]*invalid-credentials/,
      `${name} should keep password failures mapped to invalid-credentials.`,
    );
  }
});

test("proxy keeps host canonicalization without session refresh side effects", () => {
  const proxySource = sources.get("proxy") ?? "";
  assert.match(proxySource, /STAGING_CANONICAL_HOST/);
  assert.match(proxySource, /NextResponse\.redirect/);
  assert.match(proxySource, /NextResponse\.next/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
