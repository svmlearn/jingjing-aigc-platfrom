import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./knowledge-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupabaseAdminClient",
  "isSupabaseAdminConfigured",
  "@/lib/supabase",
  "supabase",
  "Supabase",
  '.from("knowledge_documents")',
  '.from("knowledge_chunks")',
  '.from("knowledge_ingestion_jobs")',
  '.rpc("match_knowledge_chunks"',
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "listKnowledgeDocuments",
  "getKnowledgeDocumentById",
  "createKnowledgeDocument",
  "updateKnowledgeDocument",
  "deleteKnowledgeDocument",
  "createKnowledgeIngestionJob",
  "updateKnowledgeIngestionJob",
  "replaceKnowledgeChunks",
  "listKnowledgeChunksByDocumentId",
  "searchKnowledgeChunks",
];

test("knowledge repository does not contain legacy Supabase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyName of [
    "KnowledgeVectorMatchRow",
    "toPgVector",
    "shouldUseAppPostgres",
    "shouldUseDemoFallback",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyName)), fallbackOnlyName);
  }
});

test("expected public knowledge repository functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("document repository operations use PostgreSQL app database tables", () => {
  assert.match(source, /queryAppDb/);
  assert.match(source, /withAppDbTransaction/);
  assert.match(source, /public\.knowledge_documents/);
  assert.match(source, /public\.knowledge_chunks/);
  assert.match(source, /public\.knowledge_ingestion_jobs/);

  assertFunctionBody("listKnowledgeDocuments", [
    "from public.knowledge_documents",
    "return attachKnowledgeDocumentStats(documents)",
    "input.merchantId === null",
  ]);
  assertFunctionBody("getKnowledgeDocumentById", [
    "from public.knowledge_documents",
    "attachKnowledgeDocumentStats([mapKnowledgeDocument(row)])",
  ]);
  assertFunctionBody("createKnowledgeDocument", [
    "insert into public.knowledge_documents",
    "JSON.stringify(input.metadata ?? {})",
  ]);
  assertFunctionBody("updateKnowledgeDocument", [
    "update public.knowledge_documents",
    "buildKnowledgeDocumentPostgresPatch(input)",
  ]);
  assertFunctionBody("deleteKnowledgeDocument", [
    "delete from public.knowledge_documents",
  ]);
});

test("ingestion job operations use PostgreSQL app database table", () => {
  assertFunctionBody("createKnowledgeIngestionJob", [
    "insert into public.knowledge_ingestion_jobs",
    "JSON.stringify(input.inputPayload ?? {})",
    "JSON.stringify(input.logPayload ?? {})",
  ]);
  assertFunctionBody("updateKnowledgeIngestionJob", [
    "update public.knowledge_ingestion_jobs",
    "buildKnowledgeIngestionJobPostgresPatch(input)",
    "updated_at = timezone('utc', now())",
  ]);
});

test("chunk replacement remains transactional and writes embedding_json", () => {
  assertFunctionBody("replaceKnowledgeChunks", [
    "withAppDbTransaction(async (client)",
    "delete from public.knowledge_chunks where document_id = $1",
    "insert into public.knowledge_chunks",
    "embedding_json",
    "chunk.embedding?.length ?? null",
    "chunk.embedding ?? null",
    "inserted.sort((a, b) => a.chunk_index - b.chunk_index).map(mapKnowledgeChunk)",
  ]);
  assertFunctionBody("listKnowledgeChunksByDocumentId", [
    "from public.knowledge_chunks",
    "order by chunk_index asc",
  ]);
});

test("search keeps PostgreSQL text scoring and no vector RPC fallback", () => {
  assertFunctionBody("searchKnowledgeChunks", [
    "from public.knowledge_chunks",
    "order by document_id, chunk_index asc",
    "const contentScore = scoreText(row.content, terms)",
    "const titleScore = scoreText(document.title, terms) * 0.5",
    "return rankKnowledgeMatches(matches, input.limit)",
  ]);
  assert.match(source, /function rankKnowledgeMatches/);
  assert.match(source, /function scoreText/);
});

test("stats helpers keep chunk count and latest job PostgreSQL paths", () => {
  assertFunctionBody("attachKnowledgeDocumentStats", [
    "countKnowledgeChunksByDocumentIds(documentIds)",
    "listLatestKnowledgeJobsByDocumentIds(documentIds)",
  ]);
  assertFunctionBody("countKnowledgeChunksByDocumentIds", [
    "select document_id, count(*)::text as count",
    "from public.knowledge_chunks",
    "group by document_id",
  ]);
  assertFunctionBody("listLatestKnowledgeJobsByDocumentIds", [
    "select distinct on (document_id)",
    "from public.knowledge_ingestion_jobs",
    "order by document_id, created_at desc, id desc",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoKnowledgeDocuments/);
  assert.match(source, /demoKnowledgeChunks/);
  assert.match(source, /demoKnowledgeJobs/);
  assert.doesNotMatch(source, /isSupabaseAdminConfigured/);
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
