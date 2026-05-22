import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./merchant-strategy-asset-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupabaseAdminClient",
  "isSupabaseAdminConfigured",
  "@/lib/supabase",
  "supabase",
  "Supabase",
  '.from("merchant_strategy_assets")',
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("merchant strategy asset repository does not contain legacy Supabase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }
});

test("document get and upsert paths use PostgreSQL app database persistence", () => {
  assert.match(source, /queryAppDb/);
  assert.match(source, /from public\.merchant_strategy_assets/);
  assert.match(source, /insert into public\.merchant_strategy_assets/);
  assert.match(source, /JSON\.stringify\(input\.strategySnapshot\)/);
  assert.match(source, /canonical_snapshot/);
  assert.match(source, /compiled_context/);
  assert.match(source, /strategy_snapshot/);
  assert.match(source, /strategy_markdown/);
});

test("upsert preserves strategy markdown, canonical snapshot, and compiled context semantics", () => {
  const body = extractFunctionBody("upsertMerchantStrategyAssetDocument");

  for (const snippet of [
    "normalizeStrategyMarkdown(input.strategyMarkdown)",
    "existing?.strategyMarkdown",
    "buildStrategyAssetMarkdown(input.strategySnapshot)",
    "input.compiledContext ?? existing?.compiledContext ?? null",
    "JSON.stringify(input.canonicalSnapshot ?? input.strategySnapshot)",
    "compiledContext === null ? null : JSON.stringify(compiledContext)",
  ]) {
    assert.match(body, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("ensure helpers still read first and create fallback assets when absent", () => {
  assertReadThenUpsert("ensureMerchantStrategyAsset", "upsertMerchantStrategyAsset({");
  assertReadThenUpsert("ensureMerchantStrategyAssetDocument", "upsertMerchantStrategyAssetDocument({");
});

test("local demo fallback is explicit and independent of legacy storage configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoMerchantStrategyAssets/);
  assert.doesNotMatch(source, /shouldUseDemoFallback/);
  assert.doesNotMatch(source, /shouldUseAppPostgres/);
});

test("row mapper keeps current strategy asset document shape", () => {
  const body = extractFunctionBody("mapMerchantStrategyAsset");

  for (const snippet of [
    "toStrategySnapshot(row.strategy_snapshot)",
    "normalizeStrategyMarkdown(row.strategy_markdown)",
    "buildStrategyAssetMarkdown(strategySnapshot)",
    "canonicalSnapshot: row.canonical_snapshot ?? strategySnapshot",
    "compiledContext: row.compiled_context ?? null",
  ]) {
    assert.match(body, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

function assertReadThenUpsert(functionName, upsertSnippet) {
  const body = extractFunctionBody(functionName);
  const getIndex = body.indexOf("getMerchantStrategyAssetDocument(input.merchantId)");
  const upsertIndex = body.indexOf(upsertSnippet);

  assert.notEqual(getIndex, -1, `${functionName} should read current asset first.`);
  assert.notEqual(upsertIndex, -1, `${functionName} should upsert fallback when absent.`);
  assert.ok(getIndex < upsertIndex, `${functionName} should read before upsert.`);
}

function extractFunctionBody(functionName) {
  const exportAsyncSignatureIndex = source.indexOf(`export async function ${functionName}`);
  const exportRegularSignatureIndex = source.indexOf(`export function ${functionName}`);
  const regularSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportAsyncSignatureIndex !== -1
      ? exportAsyncSignatureIndex
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
