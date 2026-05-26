import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./consultation-repository.ts", import.meta.url),
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
  "listConsultationSessions",
  "createConsultationSession",
  "getConsultationSessionDetail",
  "createConsultationMessage",
  "createConsultationEvent",
  "updateConsultationSession",
  "deleteConsultationSession",
];

test("consultation repository does not contain legacy Supa\x62ase fallback", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }

  for (const fallbackOnlyName of [
    "shouldUseAppPostgres",
    "shouldUseDemoFallback",
    "isAppPostgresPreferred",
    "isAppPostgresConfigured",
    "consultation_sessions\")",
    "consultation_messages\")",
    "consultation_events\")",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(fallbackOnlyName)), fallbackOnlyName);
  }
});

test("expected public consultation repository functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("PostgreSQL app database tables and primitives remain in use", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "public.consultation_sessions",
    "public.consultation_messages",
    "public.consultation_events",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("session list, create, and detail use PostgreSQL and keep previews", () => {
  assertFunctionBody("listConsultationSessions", [
    "isLocalDemoRuntime()",
    "from public.consultation_sessions",
    "order by last_message_at desc, created_at desc",
    "listLatestMessagePreviewBySessionIds",
    "latestMessagePreview: previews.get(session.id) ?? null",
  ]);
  assertFunctionBody("createConsultationSession", [
    "isLocalDemoRuntime()",
    "insert into public.consultation_sessions",
    "status",
    "current_stage",
    "strategy_snapshot",
    "summary_text",
    "JSON.stringify(input.strategySnapshot ?? emptyStrategySnapshot)",
  ]);
  assertFunctionBody("getConsultationSessionDetail", [
    "isLocalDemoRuntime()",
    "from public.consultation_sessions",
    "listConsultationMessages(input.sessionId)",
    "listConsultationEvents(input.sessionId)",
    "latestMessagePreview: messages.at(-1)?.content ?? null",
  ]);
});

test("message insert keeps transaction and touches session summary fields", () => {
  assertFunctionBody("createConsultationMessage", [
    "isLocalDemoRuntime()",
    "withAppDbTransaction(async (client)",
    "insert into public.consultation_messages",
    "JSON.stringify(input.toolCards ?? [])",
    "JSON.stringify(input.visibleSummary ?? {})",
    "buildConsultationMessageSessionTouchPostgresPatch({",
    "lastMessageAt: touchedAt",
    "currentStage: input.currentStage",
    "strategySnapshot: input.strategySnapshot",
    "summaryText: input.summaryText",
    "update public.consultation_sessions",
    "updated_at = timezone('utc', now())",
    "CONSULTATION_SESSION_NOT_FOUND",
  ]);
  assertFunctionBody("buildConsultationMessageSessionTouchPostgresPatch", [
    "last_message_at = $1",
    "current_stage",
    "strategy_snapshot",
    "JSON.stringify(input.strategySnapshot)",
    "summary_text",
  ]);
});

test("event creation, partial update, and delete stay PostgreSQL-only", () => {
  assertFunctionBody("createConsultationEvent", [
    "isLocalDemoRuntime()",
    "insert into public.consultation_events",
    "event_type",
    "payload",
    "JSON.stringify(input.payload ?? {})",
  ]);
  assertFunctionBody("updateConsultationSession", [
    "isLocalDemoRuntime()",
    "buildConsultationSessionPostgresPatch(input)",
    "patch.assignments.length === 0",
    "update public.consultation_sessions",
    "where id = $",
    "and merchant_id = $",
    "CONSULTATION_SESSION_NOT_FOUND",
  ]);
  assertFunctionBody("buildConsultationSessionPostgresPatch", [
    "if (input.title !== undefined) add(\"title\", input.title)",
    "if (input.status !== undefined) add(\"status\", input.status)",
    "if (input.currentStage !== undefined) add(\"current_stage\", input.currentStage)",
    "JSON.stringify(input.strategySnapshot)",
    "if (input.summaryText !== undefined) add(\"summary_text\", input.summaryText)",
    "if (input.lastMessageAt !== undefined) add(\"last_message_at\", input.lastMessageAt)",
  ]);
  assertFunctionBody("deleteConsultationSession", [
    "isLocalDemoRuntime()",
    "delete from public.consultation_sessions",
    "returning id",
    "CONSULTATION_SESSION_NOT_FOUND",
  ]);
});

test("detail helpers and latest preview use PostgreSQL ordering", () => {
  assertFunctionBody("listConsultationMessages", [
    "from public.consultation_messages",
    "order by created_at asc, id asc",
  ]);
  assertFunctionBody("listConsultationEvents", [
    "from public.consultation_events",
    "order by created_at asc, id asc",
  ]);
  assertFunctionBody("listLatestMessagePreviewBySessionIds", [
    "select distinct on (session_id)",
    "from public.consultation_messages",
    "where session_id = any($1::uuid[])",
    "order by session_id, created_at desc, id desc",
    "previews.set(row.session_id, row.content)",
  ]);
});

test("local demo fallback is explicit and independent of legacy configuration", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.match(source, /demoConsultationSessions/);
  assert.match(source, /demoConsultationMessages/);
  assert.match(source, /demoConsultationEvents/);
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
