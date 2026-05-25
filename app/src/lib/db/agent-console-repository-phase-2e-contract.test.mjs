import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./agent-console-repository.ts", import.meta.url),
  "utf8",
);

const forbiddenPatterns = [
  "createSupabaseAdminClient",
  "isSupabaseAdminConfigured",
  "@/lib/supabase/admin",
  "supabase",
  "Supabase",
  ".from(",
  ".rpc(",
  "requireSupabaseAdmin",
  "isAppPostgresConfigured",
  "isAppPostgresPreferred",
  "shouldUseAppPostgres",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

const publicFunctions = [
  "getAgentConsoleFoundationState",
  "createAgentConfig",
  "getAgentConfigById",
  "getAgentConfigDetail",
  "updateAgentConfig",
  "copyAgentConfig",
  "listAgentConfigs",
  "listAgentPromptVersions",
  "getActiveAgentPromptVersion",
  "saveAgentPromptDraft",
  "publishAgentPromptDraft",
  "rollbackAgentPromptVersion",
  "listAgentSoulVersions",
  "getActiveAgentSoulVersion",
  "saveAgentSoulDraft",
  "publishAgentSoulDraft",
  "rollbackAgentSoulVersion",
  "createAgentSkill",
  "getAgentSkillById",
  "updateAgentSkill",
  "listAgentSkills",
  "listAgentSkillBindings",
  "replaceAgentSkillBindings",
  "createKnowledgeSet",
  "getKnowledgeSetById",
  "getKnowledgeSetDetail",
  "updateKnowledgeSet",
  "listKnowledgeSets",
  "listKnowledgeSetDocuments",
  "replaceKnowledgeSetDocuments",
  "replaceKnowledgeDocumentSets",
  "listAgentKnowledgeSetBindings",
  "replaceAgentKnowledgeSetBindings",
  "listAgentRouteBindings",
  "getAgentRouteBinding",
  "getConsultationDefaultRouteBinding",
  "setConsultationDefaultAgent",
  "recordAgentRuntimeSnapshot",
  "recordAgentTestRun",
  "ensureMerchantCreditAccount",
  "recordMerchantUsageEvent",
  "updateMerchantUsageEvent",
  "consumeMerchantCredits",
];

test("agent console repository has no Supabase/admin fallback strings", () => {
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, pattern.source);
  }
});

test("expected public Agent Console functions still exist", () => {
  for (const functionName of publicFunctions) {
    assert.match(source, new RegExp(`export async function ${functionName}`), functionName);
  }
});

test("local demo fallback is explicitly controlled by isLocalDemoRuntime", () => {
  assert.match(source, /import \{ isLocalDemoRuntime \} from "@\/lib\/demo\/local-demo-runtime";/);
  assert.match(source, /if \(isLocalDemoRuntime\(\)\)/);
  assert.doesNotMatch(source, /shouldUseDemoFallback/);
  assert.doesNotMatch(source, /database.*Supabase|Supabase.*database/i);
});

test("PostgreSQL app database primitives and tables remain in use", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "recordAgentConsoleAdminEventWithClient",
    "mapPostgresError",
    "public.agent_configs",
    "public.agent_prompt_versions",
    "public.agent_soul_versions",
    "public.agent_skills",
    "public.agent_skill_bindings",
    "public.knowledge_sets",
    "public.knowledge_set_documents",
    "public.agent_knowledge_set_bindings",
    "public.agent_route_bindings",
    "public.agent_runtime_snapshots",
    "public.agent_test_runs",
    "public.merchant_credit_accounts",
    "public.merchant_usage_events",
    "public.merchant_credit_ledger",
    "public.platform_admin_events",
  ]) {
    assert.match(source, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("Agent config create, update, and copy keep PostgreSQL behavior", () => {
  assertFunctionBody("createAgentConfig", [
    "withAppDbTransaction(async (client)",
    "assertAgentDisplayNameAvailableInPostgres(client, input.displayName)",
    "insert into public.agent_configs",
    "recordAgentConsoleAdminEventWithClient(client",
    "AGENT_ACTIVE_PROMPT_REQUIRED",
  ]);
  assertFunctionBody("updateAgentConfig", [
    "getAgentConfigByIdFromPostgres(client, agentId)",
    "assertAgentHasActivePromptInPostgres(client, agentId)",
    "from public.agent_route_bindings",
    "update public.agent_configs",
    "recordAgentConsoleAdminEventWithClient(client",
  ]);
  assertFunctionBody("copyAgentConfig", [
    "getAgentConfigByIdFromPostgres(client, agentId)",
    "assertAgentDisplayNameAvailableInPostgres(client, input.displayName)",
    "insert into public.agent_configs",
    "from public.agent_prompt_versions",
    "from public.agent_soul_versions",
    "from public.agent_skill_bindings",
    "from public.agent_knowledge_set_bindings",
  ]);
});

test("prompt and soul version workflows keep PostgreSQL version/status semantics", () => {
  for (const functionName of [
    "saveAgentPromptDraft",
    "publishAgentPromptDraft",
    "rollbackAgentPromptVersion",
    "saveAgentSoulDraft",
    "publishAgentSoulDraft",
    "rollbackAgentSoulVersion",
  ]) {
    assertFunctionBody(functionName, [
      "withAppDbTransaction(async (client)",
      "recordAgentConsoleAdminEventWithClient(client",
    ]);
  }
  assertFunctionBody("publishAgentPromptDraft", [
    "status = 'archived'",
    "status = 'active'",
    "AGENT_PROMPT_EMPTY",
  ]);
  assertFunctionBody("rollbackAgentPromptVersion", [
    "Only archived prompts can be rolled back.",
    "status = 'archived'",
    "status = 'active'",
  ]);
  assertFunctionBody("publishAgentSoulDraft", [
    "status = 'archived'",
    "status = 'active'",
    "AGENT_SOUL_EMPTY",
  ]);
  assertFunctionBody("rollbackAgentSoulVersion", [
    "Only archived soul.md versions can be rolled back.",
    "status = 'archived'",
    "status = 'active'",
  ]);
});

test("skill and knowledge binding helpers use PostgreSQL-only helpers", () => {
  assert.doesNotMatch(source, /async function assertAgentDisplayNameAvailable\(/);
  assert.doesNotMatch(source, /async function getAgentSkillsByIds\(/);
  assert.doesNotMatch(source, /async function getKnowledgeSetsByIds\(/);
  assert.doesNotMatch(source, /async function assertKnowledgeDocumentsExist\(/);
  assert.match(source, /async function assertAgentDisplayNameAvailableInPostgres\(/);
  assert.match(source, /async function getAgentSkillsByIdsFromPostgres\(/);
  assert.match(source, /async function getKnowledgeSetsByIdsFromPostgres\(/);
  assert.match(source, /async function assertKnowledgeDocumentsExistInPostgres\(/);
  assertFunctionBody("replaceAgentSkillBindings", [
    "getAgentSkillsByIdsFromPostgres(client, desiredSkillIds)",
    "listAgentSkillBindingsFromPostgres(client, input.agentId)",
    "insert into public.agent_skill_bindings",
  ]);
  assertFunctionBody("replaceAgentKnowledgeSetBindings", [
    "getKnowledgeSetsByIdsFromPostgres(client, desiredKnowledgeSetIds)",
    "listAgentKnowledgeSetBindingsFromPostgres(client, input.agentId)",
    "insert into public.agent_knowledge_set_bindings",
  ]);
});

test("knowledge set and route binding paths stay on PostgreSQL tables", () => {
  assertFunctionBody("replaceKnowledgeSetDocuments", [
    "assertKnowledgeDocumentsExistInPostgres(client, documentIds)",
    "delete from public.knowledge_set_documents",
    "insert into public.knowledge_set_documents",
  ]);
  assertFunctionBody("replaceKnowledgeDocumentSets", [
    "assertKnowledgeDocumentsExistInPostgres(client, [input.documentId])",
    "getKnowledgeSetsByIdsFromPostgres(client, knowledgeSetIds)",
    "delete from public.knowledge_set_documents",
  ]);
  assertFunctionBody("setConsultationDefaultAgent", [
    "getAgentConfigByIdFromPostgres(client, input.agentId)",
    "assertAgentHasActivePromptInPostgres(client, agent.id)",
    "insert into public.agent_route_bindings",
    "consultation_default",
  ]);
});

test("runtime, test run, credit, usage, ledger, and audit paths stay PostgreSQL", () => {
  assertFunctionBody("recordAgentRuntimeSnapshot", [
    "insert into public.agent_runtime_snapshots",
    "JSON.stringify(input.candidateSkillIds ?? [])",
  ]);
  assertFunctionBody("recordAgentTestRun", [
    "insert into public.agent_test_runs",
    "insert into public.platform_admin_events",
    "agent_test_run.created",
  ]);
  assertFunctionBody("ensureMerchantCreditAccount", [
    "insert into public.merchant_credit_accounts",
    "on conflict (merchant_id) do nothing",
    "recordMerchantCreditLedger(",
  ]);
  assertFunctionBody("recordMerchantUsageEvent", [
    "insert into public.merchant_usage_events",
    "returning ${merchantUsageEventSelect}",
  ]);
  assertFunctionBody("updateMerchantUsageEvent", [
    "update public.merchant_usage_events",
    "actual_cost = case when $3::boolean",
  ]);
  assertFunctionBody("consumeMerchantCredits", [
    "from public.merchant_credit_accounts",
    "for update",
    "update public.merchant_credit_accounts",
    "recordMerchantCreditLedger(",
  ]);
  assertFunctionBody("recordMerchantCreditLedger", [
    "insert into public.merchant_credit_ledger",
    "client ?? { query: queryAppDb }",
  ]);
  assertFunctionBody("recordAgentConsoleAdminEvent", [
    "queryAppDb(",
    "insert into public.platform_admin_events",
    "mapPostgresError(error, \"PLATFORM_ADMIN_EVENT_CREATE_FAILED\")",
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
