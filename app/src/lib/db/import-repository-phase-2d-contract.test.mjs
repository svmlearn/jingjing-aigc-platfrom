import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./import-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupa\x62aseAdminClient",
  "@/lib/supa\u0062ase/admin",
  "supabase",
  "Supa\x62ase",
  ".from(",
  "isAppPostgresConfigured",
  "isAppPostgresPreferred",
  "shouldUseAppPostgres",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "createImportJob",
  "getImportJobById",
  "listImportJobs",
  "countRunningImportJobs",
  "updateImportJob",
  "upsertSourceItems",
  "ensureSourceItemForComments",
  "upsertImportedComments",
  "listSourceItems",
  "getSourceItemById",
  "listImportedComments",
];

test("import repository does not contain legacy Supa\x62ase fallback or PostgreSQL gate", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }
});

test("expected public import repository functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("PostgreSQL app database tables and primitives remain in use", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "public.import_jobs",
    "public.source_items",
    "public.imported_comments",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("import job create, get, list, count, and update stay PostgreSQL-only", () => {
  assertFunctionBody("createImportJob", [
    "insert into public.import_jobs",
    "input_payload",
    "JSON.stringify({",
    "options: input.request.options ?? {}",
  ]);
  assertFunctionBody("pgGetImportJobById", [
    "from public.import_jobs",
    "where id = $1 and merchant_id = $2",
    "IMPORT_JOB_NOT_FOUND",
  ]);
  assertFunctionBody("listImportJobs", [
    "from public.import_jobs",
    "where merchant_id = $1",
    "order by created_at desc",
    "limit 50",
  ]);
  assertFunctionBody("countRunningImportJobs", [
    "count(*) filter (",
    "where merchant_id = $1 and status = 'running'",
    "where status = 'running'",
    "from public.import_jobs",
  ]);
  assertFunctionBody("updateImportJob", [
    "const hasUpdate =",
    "return mapImportJob(await pgGetImportJobByIdOnly(input.jobId))",
    "update public.import_jobs",
    "status = case when $2::boolean then $3 else status end",
    "log_payload = case when $10::boolean then $11::jsonb else log_payload end",
    "finished_at = case when $12::boolean then timezone('utc', now()) else finished_at end",
    "IMPORT_JOB_NOT_FOUND",
  ]);
});

test("source item upsert keeps both PostgreSQL conflict paths", () => {
  assertFunctionBody("upsertSourceItems", [
    "withAppDbTransaction(async (client)",
    "row.external_item_id",
    "pgUpsertSourceItemWithExternalId(client, row)",
    "pgUpsertSourceItemWithSourceUrl(client, row)",
  ]);
  assertFunctionBody("pgUpsertSourceItemWithExternalId", [
    "insert into public.source_items",
    "on conflict (merchant_id, platform, external_item_id) where external_item_id is not null",
    "do update set",
    "trace_payload = excluded.trace_payload",
  ]);
  assertFunctionBody("pgUpsertSourceItemWithSourceUrl", [
    "insert into public.source_items",
    "on conflict (merchant_id, source_url) where source_url is not null",
    "do update set",
    "platform = excluded.platform",
    "trace_payload = excluded.trace_payload",
  ]);
  assertFunctionBody("ensureSourceItemForComments", [
    "createdFrom: \"comments_import\"",
    "SOURCE_ITEM_SAVE_FAILED",
  ]);
});

test("imported comments keep transaction, upsert, and plain insert paths", () => {
  assertFunctionBody("upsertImportedComments", [
    "withAppDbTransaction(async (client)",
    "row.external_comment_id",
    "pgUpsertImportedCommentWithExternalId(client, row)",
    "pgInsertImportedComment(client, row)",
  ]);
  assertFunctionBody("pgUpsertImportedCommentWithExternalId", [
    "insert into public.imported_comments",
    "on conflict (source_item_id, external_comment_id)",
    "do update set",
    "trace_payload = excluded.trace_payload",
  ]);
  assertFunctionBody("pgInsertImportedComment", [
    "insert into public.imported_comments",
    "returning ${commentSelect}",
  ]);
});

test("source item and comment readers keep merchant ownership and sorting", () => {
  assertFunctionBody("pgListSourceItems", [
    "from public.source_items",
    "where merchant_id = $1",
    "order by created_at desc",
    "limit $2",
  ]);
  assertFunctionBody("pgGetSourceItemById", [
    "from public.source_items",
    "where id = $1 and merchant_id = $2",
    "SOURCE_ITEM_NOT_FOUND",
  ]);
  assertFunctionBody("pgListImportedComments", [
    "await pgGetSourceItemById({",
    "merchantId: input.merchantId",
    "sourceItemId: input.sourceItemId",
    "from public.imported_comments",
    "where source_item_id = $1",
    "order by sort_score desc nulls last, created_at asc",
    "limit $2",
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
  const exportRegularSignatureIndex = source.indexOf(`export function ${functionName}`);
  const asyncSignatureIndex = source.indexOf(`async function ${functionName}`);
  const regularSignatureIndex = source.indexOf(`function ${functionName}`);
  const signatureIndex =
    exportAsyncSignatureIndex !== -1
      ? exportAsyncSignatureIndex
      : exportRegularSignatureIndex !== -1
        ? exportRegularSignatureIndex
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
