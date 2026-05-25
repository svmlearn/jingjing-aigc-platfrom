import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./content-generation-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupa\x62aseAdminClient",
  "isSupa\x62aseAdminConfigured",
  "@/lib/supa\u0062ase/admin",
  "supabase",
  "Supa\x62ase",
  ".from(",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "createContentGenerationBatch",
  "claimNextContentGenerationJob",
  "markContentGenerationJobSucceeded",
  "markContentGenerationJobFailed",
  "getContentGenerationBatchById",
  "listContentGenerationJobsByBatchId",
];

test("content generation repository does not contain legacy Supa\x62ase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyName of [
    "isPostgresContentGenerationEnabled",
    "isAppPostgresPreferred",
    "isAppPostgresConfigured",
    "content_generation_batches\")",
    "content_generation_jobs\")",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyName)), fallbackOnlyName);
  }
});

test("expected public content generation repository functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("PostgreSQL app database tables and primitives remain in use", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "public.content_generation_batches",
    "public.content_generation_jobs",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("batch creation keeps transaction and job insert semantics", () => {
  assertFunctionBody("createContentGenerationBatch", [
    "CONTENT_GENERATION_EMPTY_BATCH",
    "isLocalDemoRuntime()",
    "withAppDbTransaction(async (client)",
    "insert into public.content_generation_batches",
    "JSON.stringify(input.calendarSnapshot ?? {})",
    "JSON.stringify(input.memberScopeSnapshot ?? {})",
    "insert into public.content_generation_jobs",
    "idempotency_key",
    "JSON.stringify(job.inputSnapshot)",
    "current_stage",
    "return { batch, jobs }",
  ]);
});

test("claim path keeps PostgreSQL locking, attempt increment, and running state", () => {
  assertFunctionBody("claimNextContentGenerationJob", [
    "isLocalDemoRuntime()",
    "markLocalJobRunning(job)",
    "withAppDbTransaction(async (client)",
    "from public.content_generation_jobs",
    "status = 'pending'",
    "failed_retryable",
    "attempt_count < max_attempts",
    "for update skip locked",
    "set status = 'running'",
    "current_stage = 'calling_dify'",
    "attempt_count = attempt_count + 1",
    "started_at = coalesce(started_at, timezone('utc', now()))",
    "await recomputeContentGenerationBatch(updated.batchId)",
  ]);
});

test("job result paths keep PostgreSQL succeeded and failed updates", () => {
  assertFunctionBody("markContentGenerationJobSucceeded", [
    "isLocalDemoRuntime()",
    "status: \"succeeded\"",
    "update public.content_generation_jobs",
    "set status = 'succeeded'",
    "current_stage = 'persisted'",
    "output_json = $2::jsonb",
    "quality_review = $3::jsonb",
    "dify_workflow_run_id = $4",
    "CONTENT_GENERATION_JOB_SUCCEED_FAILED",
    "await recomputeContentGenerationBatch(job.batchId)",
  ]);

  assertFunctionBody("markContentGenerationJobFailed", [
    "isLocalDemoRuntime()",
    "const nextStatus: ContentGenerationJobStatus = input.retryable ? \"failed_retryable\" : \"failed_manual\"",
    "update public.content_generation_jobs",
    "set status = $2",
    "current_stage = 'failed'",
    "error_message = $3",
    "CONTENT_GENERATION_JOB_FAIL_FAILED",
    "await recomputeContentGenerationBatch(job.batchId)",
  ]);
});

test("batch lookup, job listing, and recompute use PostgreSQL tables", () => {
  assertFunctionBody("getContentGenerationBatchById", [
    "isLocalDemoRuntime()",
    "from public.content_generation_batches",
    "CONTENT_GENERATION_BATCH_NOT_FOUND",
  ]);
  assertFunctionBody("listContentGenerationJobsByBatchId", [
    "isLocalDemoRuntime()",
    "from public.content_generation_jobs",
    "order by task_date asc, created_at asc",
  ]);
  assertFunctionBody("recomputeContentGenerationBatch", [
    "isLocalDemoRuntime()",
    "select status",
    "from public.content_generation_jobs",
    "countJobStatuses(statuses)",
    "deriveBatchStatus(statuses)",
    "update public.content_generation_batches",
    "succeeded_jobs = $2",
    "failed_jobs = $3",
    "running_jobs = $4",
    "started_at = coalesce(started_at, $6::timestamptz)",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoStore/);
  assert.match(source, /markLocalJobRunning/);
  assert.match(source, /recomputeLocalBatch/);
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

  const bodyStart = source.indexOf("{\n", parameterEnd);
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
