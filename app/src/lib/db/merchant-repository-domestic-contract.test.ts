import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("merchant team management read path does not require Cloud Supabase before repository dispatch", () => {
  const source = readFileSync(new URL("./merchant-repository.ts", import.meta.url), "utf8");
  const functionBody = extractFunctionBody(source, "getMerchantTeamManagementForOwner");

  assert.equal(
    functionBody.includes("if (!isSupabaseAdminConfigured())"),
    false,
    "PostgreSQL/domestic team management should not be blocked by Cloud Supabase env guards.",
  );
});

function extractFunctionBody(source: string, functionName: string) {
  const signatureIndex = source.indexOf(`export async function ${functionName}`);
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
