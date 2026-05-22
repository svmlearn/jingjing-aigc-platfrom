import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./material-library-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupabaseAdminClient",
  "isSupabaseAdminConfigured",
  "@/lib/supabase",
  "supabase",
  "Supabase",
  '.from("source_items")',
  '.from("material_workbench_references")',
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "listMaterialLibraryItems",
  "getMaterialLibraryItemById",
  "createMaterialLibraryItem",
  "listCachedMaterialProviderItems",
  "upsertMaterialLibraryItemsFromProvider",
  "createMaterialWorkbenchReference",
  "getMaterialWorkbenchReference",
  "listMaterialWorkbenchReferencesByDraft",
  "consumeMaterialWorkbenchReference",
];

test("material library repository does not contain legacy Supabase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyHelper of [
    "shouldUseDemoFallback",
    "shouldUseAppPostgres",
    "isMissingMaterialReferenceTable",
    "createTracePayloadWorkbenchReference",
    "appendTracePayloadReferenceConsumption",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyHelper)), fallbackOnlyHelper);
  }
});

test("expected public material library functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("PostgreSQL app database path still covers material item list, get, and create", () => {
  assert.match(source, /queryAppDb/);
  assert.match(source, /withAppDbTransaction/);
  assert.match(source, /from public\.source_items/);
  assert.match(source, /insert into public\.source_items/);
  assert.match(source, /trace_payload @>/);

  assertFunctionBody("listMaterialLibraryItems", [
    "rankMaterialLibraryItemsForRetrieval",
    "from public.source_items",
    "trace_payload @> $2::jsonb",
  ]);
  assertFunctionBody("getMaterialLibraryItemById", [
    "pgGetMaterialLibraryItemRow(input)",
    "mapSourceItemToMaterial(row)",
  ]);
  assertFunctionBody("createMaterialLibraryItem", [
    "pgInsertMaterialLibraryItem(insertPayload)",
    "findExistingMaterialByUrl({",
    "originalUrl: input.originalUrl",
  ]);
});

test("provider cache and provider upsert keep dedupe and comments persistence", () => {
  assertFunctionBody("listCachedMaterialProviderItems", [
    "materialProvider: input.provider",
    "materialProviderCacheKey: input.cacheKey",
    "return result.rows.map(rowToProviderInput)",
  ]);
  assertFunctionBody("upsertMaterialLibraryItemsFromProvider", [
    "withAppDbTransaction(async (client)",
    "pgFindExistingProviderMaterialId(client, row)",
    "pgUpdateMaterialLibraryItem(client, existingId, row)",
    "pgInsertMaterialLibraryItem(row, client)",
    "await persistProviderComments(savedWithComments)",
  ]);
  assertFunctionBody("pgFindExistingProviderMaterialId", [
    "row.external_item_id",
    "and external_item_id = $3",
    "row.source_url",
    "and source_url = $2",
  ]);
});

test("workbench reference functions use the PostgreSQL table and scoped consumption", () => {
  assert.match(source, /public\.material_workbench_references/);
  assert.match(source, /insert into public\.material_workbench_references/);
  assert.match(source, /update public\.material_workbench_references/);

  assertFunctionBody("createMaterialWorkbenchReference", [
    "withAppDbTransaction(async (client)",
    "pgGetMaterialLibraryItemRow(input, client)",
    "insert into public.material_workbench_references",
    "pgMarkMaterialSelectedForRewrite(client",
  ]);
  assertFunctionBody("getMaterialWorkbenchReference", [
    "from public.material_workbench_references",
    "and merchant_id = $2",
    "and target_workbench",
  ]);
  assertFunctionBody("listMaterialWorkbenchReferencesByDraft", [
    "from public.material_workbench_references",
    "and draft_id = $2",
    "order by created_at asc",
  ]);
  assertFunctionBody("consumeMaterialWorkbenchReference", [
    "update public.material_workbench_references",
    "and merchant_id = $4",
    "and target_workbench = $5",
    "const materialSql = input.materialItemId",
    "and material_item_id = $",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoMaterialItems/);
  assert.match(source, /demoWorkbenchReferences/);
  assert.doesNotMatch(source, /isSupabaseAdminConfigured/);
});

test("originalUrl duplicate handling remains visible in PostgreSQL source path", () => {
  assertFunctionBody("pgInsertMaterialLibraryItem", [
    "on conflict (merchant_id, source_url) where source_url is not null",
    "do nothing",
  ]);
  assertFunctionBody("findExistingMaterialByUrl", [
    "source_url = $2",
    "trace_payload @> $3::jsonb",
    "mapSourceItemToMaterial(result.rows[0])",
  ]);
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
