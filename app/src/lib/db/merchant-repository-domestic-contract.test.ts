import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("merchant team management read path does not require Cloud Supa\x62ase before repository dispatch", () => {
  const source = readFileSync(new URL("./merchant-repository.ts", import.meta.url), "utf8");
  const functionBody = extractFunctionBody(source, "getMerchantTeamManagementForOwner");

  assert.equal(
    functionBody.includes("if (!isSupa\x62aseAdminConfigured())"),
    false,
    "PostgreSQL/domestic team management should not be blocked by Cloud Supa\x62ase env guards.",
  );
});

test("PostgreSQL member invitation lookup preserves generated hyphenated team codes", () => {
  const source = readFileSync(
    new URL("./postgres-video-chain-repository.ts", import.meta.url),
    "utf8",
  );
  const functionBody = extractFunctionBody(source, "normalizeMemberInvitationCode");

  assert.equal(
    functionBody.includes('replace(/[^A-Z0-9]/g, "")'),
    false,
    "PostgreSQL member invite lookup must not strip hyphens from TEAM-... codes.",
  );
  assert.match(
    functionBody,
    /return code\.trim\(\)\.toUpperCase\(\);/,
    "PostgreSQL member invite lookup should match the stored hyphenated code format.",
  );
});

function extractFunctionBody(source: string, functionName: string) {
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
