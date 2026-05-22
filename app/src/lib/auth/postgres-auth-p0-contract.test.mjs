import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerWithInviteRouteSource = readFileSync(
  new URL("../../app/api/auth/register-with-invite/route.ts", import.meta.url),
  "utf8",
);
const merchantLoginActionSource = readFileSync(
  new URL("../../app/(auth)/login/actions.ts", import.meta.url),
  "utf8",
);
const merchantLoginRouteSource = readFileSync(
  new URL("../../app/api/auth/merchant-login/route.ts", import.meta.url),
  "utf8",
);
const merchantOnboardingPageSource = readFileSync(
  new URL("../../app/(auth)/merchant/onboarding/page.tsx", import.meta.url),
  "utf8",
);
const currentUserSource = readFileSync(new URL("./current-user.ts", import.meta.url), "utf8");

test("merchant owner invite registration is PostgreSQL-first before legacy Supabase auth", () => {
  const postBody = extractFunctionBody(registerWithInviteRouteSource, "POST");
  const domesticIndex = postBody.indexOf("if (isDomesticSessionEnabled())");
  const legacySupabaseIndex = postBody.indexOf("createSupabaseAdminClient()");

  assert.notEqual(domesticIndex, -1, "register route should have a domestic session branch.");
  assert.notEqual(
    legacySupabaseIndex,
    -1,
    "register route may keep legacy Supabase after domestic dispatch.",
  );
  assert.ok(
    domesticIndex < legacySupabaseIndex,
    "domestic PostgreSQL registration must run before any legacy Supabase admin call.",
  );
  assert.match(registerWithInviteRouteSource, /insert into public\.app_users/);
  assert.match(registerWithInviteRouteSource, /'merchant_owner', 'active'/);
  assert.match(postBody, /createDomesticOwnerUser/);
  assert.match(postBody, /redeemInvitationCode/);
  assert.match(postBody, /signInDomesticUser/);
  assert.match(postBody, /sessionEstablished: true/);
  assert.match(registerWithInviteRouteSource, /INVITATION_CODE_NOT_ACTIVE/);
  assert.match(registerWithInviteRouteSource, /INVITATION_CODE_REDEEMED/);
  assert.match(registerWithInviteRouteSource, /INVITATION_CODE_UNAVAILABLE/);
});

test("merchant login entrypoints no longer redirect to supabase-not-configured", () => {
  const actionBody = extractFunctionBody(merchantLoginActionSource, "signInToMerchant");
  const domesticIndex = actionBody.indexOf("if (isDomesticSessionEnabled())");
  const legacyConfigIndex = actionBody.indexOf("if (!isSupabasePublicConfigured())");

  assert.notEqual(domesticIndex, -1, "merchant login action should keep domestic auth.");
  assert.notEqual(legacyConfigIndex, -1, "merchant login action should keep legacy guard.");
  assert.ok(
    domesticIndex < legacyConfigIndex,
    "merchant login action must try domestic auth before legacy Supabase config guards.",
  );
  assert.doesNotMatch(merchantLoginActionSource, /supabase-not-configured/);
  assert.doesNotMatch(merchantLoginRouteSource, /supabase-not-configured/);
  assert.match(merchantLoginActionSource, /auth-not-configured/);
  assert.match(merchantLoginRouteSource, /auth-not-configured/);
});

test("merchant onboarding uses current user helper instead of direct Supabase session", () => {
  assert.match(merchantOnboardingPageSource, /getAuthenticatedUser/);
  assert.doesNotMatch(merchantOnboardingPageSource, /createSupabaseServerClient/);
  assert.doesNotMatch(merchantOnboardingPageSource, /isSupabasePublicConfigured/);
  assert.doesNotMatch(merchantOnboardingPageSource, /supabase-not-configured/);
});

test("current user fallback errors use app database and session wording", () => {
  assert.match(currentUserSource, /APP_DATABASE_NOT_CONFIGURED/);
  assert.match(currentUserSource, /APP_SESSION_NOT_CONFIGURED/);
  assert.match(currentUserSource, /UNAUTHENTICATED/);
  assert.doesNotMatch(currentUserSource, /SUPABASE_NOT_CONFIGURED/);
  assert.doesNotMatch(currentUserSource, /Cloud Supabase environment variables are required/);
});

test("current user checks PostgreSQL preference before legacy Supabase fallback", () => {
  const functionBody = extractFunctionBody(currentUserSource, "getAuthenticatedUser");
  const domesticIndex = functionBody.indexOf("if (isDomesticSessionEnabled())");
  const postgresPreferredIndex = functionBody.indexOf("if (isAppPostgresPreferred())");
  const legacySupabaseIndex = functionBody.indexOf("if (!isSupabasePublicConfigured())");
  const createSupabaseIndex = functionBody.indexOf("createSupabaseServerClient()");

  assert.notEqual(domesticIndex, -1, "current user should check domestic session first.");
  assert.notEqual(
    postgresPreferredIndex,
    -1,
    "current user should explicitly branch on PostgreSQL preference.",
  );
  assert.notEqual(
    legacySupabaseIndex,
    -1,
    "current user may keep legacy Supabase after PostgreSQL guards.",
  );
  assert.notEqual(createSupabaseIndex, -1, "current user should retain legacy Supabase client.");
  assert.ok(
    domesticIndex < postgresPreferredIndex,
    "domestic session check must happen before PostgreSQL fallback errors.",
  );
  assert.ok(
    postgresPreferredIndex < legacySupabaseIndex,
    "PostgreSQL preferred mode must not fall through to Supabase config fallback.",
  );
  assert.ok(
    postgresPreferredIndex < createSupabaseIndex,
    "PostgreSQL preferred mode must not reach legacy Supabase client creation.",
  );
});

function extractFunctionBody(source, functionName) {
  const exportSignatureIndex = source.indexOf(`export async function ${functionName}`);
  const functionSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportSignatureIndex === -1 ? functionSignatureIndex : exportSignatureIndex;
  assert.notEqual(signatureIndex, -1, `${functionName} should exist.`);

  const bodyStart = source.indexOf("{", signatureIndex);
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
