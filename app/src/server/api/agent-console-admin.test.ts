import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentConsolePageSource = readFileSync(
  new URL("../../components/platform-admin/agent-console-pages.tsx", import.meta.url),
  "utf8",
);
const agentRoutesSource = [
  "../../app/api/platform-admin/agents/route.ts",
  "../../app/api/platform-admin/agents/[agentId]/route.ts",
  "../../app/api/platform-admin/agents/[agentId]/copy/route.ts",
  "../../app/api/platform-admin/agents/[agentId]/set-online/route.ts",
  "../../app/api/platform-admin/skills/route.ts",
  "../../app/api/platform-admin/skills/[skillId]/route.ts",
  "../../app/api/platform-admin/knowledge/documents/route.ts",
  "../../app/api/platform-admin/knowledge/sets/route.ts",
  "../../app/api/platform-admin/agents/test-runs/route.ts",
  "../../app/api/consultation/experts/route.ts",
]
  .map((fileName) => readFileSync(new URL(fileName, import.meta.url), "utf8"))
  .join("\n");
const consultationServiceSource = readFileSync(
  new URL("./consultation-service.ts", import.meta.url),
  "utf8",
);
const agentConsoleRepositorySource = readFileSync(
  new URL("../../lib/db/agent-console-repository.ts", import.meta.url),
  "utf8",
);
const knowledgeRepositorySource = readFileSync(
  new URL("../../lib/db/knowledge-repository.ts", import.meta.url),
  "utf8",
);
const platformKnowledgeManagerSource = readFileSync(
  new URL("../../components/platform-admin/platform-knowledge-manager.tsx", import.meta.url),
  "utf8",
);

test("agent console can create copy save and set online agents", () => {
  assert.match(agentConsolePageSource, /新建 Agent/);
  assert.match(agentConsolePageSource, /createAgent/);
  assert.match(agentConsolePageSource, /copyAgent/);
  assert.match(agentConsolePageSource, /saveAgentConfig/);
  assert.match(agentConsolePageSource, /setAgentOnline/);
  assert.match(agentConsolePageSource, /\/api\/platform-admin\/agents/);
  assert.match(agentConsolePageSource, /\/copy/);
  assert.match(agentConsolePageSource, /\/set-online/);
  assert.match(agentConsolePageSource, /serviceStatus: "enabled"/);
});

test("enabled agents are surfaced as consultation mention experts", () => {
  assert.match(agentRoutesSource, /createAgentConfig/);
  assert.match(agentRoutesSource, /updateAgentConfig/);
  assert.match(agentRoutesSource, /setConsultationDefaultAgent/);
  assert.match(agentRoutesSource, /listConsultationExpertsForUser/);
  assert.match(consultationServiceSource, /agent\.serviceStatus === "enabled"/);
  assert.match(consultationServiceSource, /mentionLabel: agent\.displayName\.replace/);
});

test("skill management can create edit and toggle skills", () => {
  assert.match(agentConsolePageSource, /createSkill/);
  assert.match(agentConsolePageSource, /saveSkill/);
  assert.match(agentConsolePageSource, /toggleSkillStatus/);
  assert.match(agentConsolePageSource, /\/api\/platform-admin\/skills/);
  assert.match(agentRoutesSource, /createAgentSkill/);
  assert.match(agentRoutesSource, /updateAgentSkill/);
  assert.doesNotMatch(agentConsolePageSource, /当前为只读结构/);
});

test("knowledge manager requires knowledge set membership on upload", () => {
  assert.match(platformKnowledgeManagerSource, /createKnowledgeSet/);
  assert.match(platformKnowledgeManagerSource, /selectedUploadSetIds\.length === 0/);
  assert.match(platformKnowledgeManagerSource, /knowledgeSetIds/);
  assert.match(agentRoutesSource, /replaceKnowledgeDocumentSets/);
  assert.match(agentRoutesSource, /KNOWLEDGE_SET_REQUIRED/);
  assert.doesNotMatch(platformKnowledgeManagerSource, /等待 Knowledge Set 写入 API/);
});

test("agent prompt draft publishing gates online visibility", () => {
  assert.match(agentConsolePageSource, /savePromptDraft/);
  assert.match(agentConsolePageSource, /publishPromptDraft/);
  assert.match(agentConsolePageSource, /\/prompt-draft/);
  assert.match(agentConsolePageSource, /\/publish-prompt/);
  assert.match(agentConsoleRepositorySource, /assertAgentHasActivePrompt/);
  assert.match(agentConsoleRepositorySource, /AGENT_ACTIVE_PROMPT_REQUIRED/);
  assert.match(agentConsoleRepositorySource, /AGENT_DEFAULT_DISABLE_BLOCKED/);
  assert.match(agentConsoleRepositorySource, /请先创建并发布 System Prompt，再启用 Agent/);
});

test("agent debug runs are saved without real consultation sessions", () => {
  assert.match(agentConsolePageSource, /runAgentDebugTest/);
  assert.match(agentConsolePageSource, /\/api\/platform-admin\/agents\/test-runs/);
  assert.match(agentRoutesSource, /runAgentDebugTest/);
  assert.match(consultationServiceSource, /recordAgentTestRun/);
  assert.match(consultationServiceSource, /Admin debug runs must not write real consultation sessions or events/);
  assert.match(agentConsoleRepositorySource, /agent_test_runs/);
  assert.match(agentConsolePageSource, /实际加载 Skills/);
  assert.match(agentConsolePageSource, /Memory 调用情况/);
  assert.match(agentConsolePageSource, /skillDependencyWarnings/);
  assert.doesNotMatch(agentConsolePageSource, /当前禁用运行/);
  assert.doesNotMatch(agentConsolePageSource, /等待 runtime 接入/);
});

test("consultation calls reserve credit gate evidence and usage events", () => {
  assert.match(consultationServiceSource, /checkConsultationEntitlement/);
  assert.match(consultationServiceSource, /recordConsultationUsageSafely/);
  assert.match(consultationServiceSource, /AGENT_USAGE_CONSULTATION_MESSAGE/);
  assert.match(consultationServiceSource, /credit_reserved_before_runtime/);
  assert.match(consultationServiceSource, /updateMerchantUsageEvent/);
  assert.match(consultationServiceSource, /usage_compensation_required/);
  assert.match(agentConsoleRepositorySource, /ensureMerchantCreditAccount/);
  assert.match(agentConsoleRepositorySource, /recordMerchantUsageEvent/);
  assert.match(agentConsoleRepositorySource, /MERCHANT_USAGE_EVENT_UPDATE_FAILED/);
  assert.match(agentConsoleRepositorySource, /merchant_usage_events/);
  assert.match(agentConsoleRepositorySource, /merchant_credit_ledger/);
});

test("merchant consultation blocks missing default agent instead of silently using fallback", () => {
  assert.match(consultationServiceSource, /assertConsultationAgentAvailable/);
  assert.match(consultationServiceSource, /CONSULTATION_AGENT_REQUIRED/);
  assert.match(consultationServiceSource, /CONSULTATION_AGENT_UNCONFIGURED/);
  assert.match(consultationServiceSource, /请选择一个专家开始咨询。/);
  assert.match(consultationServiceSource, /咨询服务暂未配置，请联系平台管理员。/);
  assert.match(agentConsolePageSource, /默认 Agent 未正确配置/);
});

test("knowledge set empty scope blocks platform retrieval and surfaces ingestion failures", () => {
  assert.match(knowledgeRepositorySource, /requestedDocumentIds = input\.documentIds \? new Set\(input\.documentIds\) : null/);
  assert.match(knowledgeRepositorySource, /document\.scope === "platform"/);
  assert.match(knowledgeRepositorySource, /requestedDocumentIds === null \|\| requestedDocumentIds\.has\(document\.id\)/);
  assert.match(platformKnowledgeManagerSource, /失败原因：/);
  assert.match(platformKnowledgeManagerSource, /document\.latestJob\.errorSummary/);
});

test("skill dependency warnings are visible in agent config and debug", () => {
  assert.match(agentConsolePageSource, /buildLocalSkillDependencyWarnings/);
  assert.match(agentConsolePageSource, /knowledge_retrieval/);
  assert.match(agentConsolePageSource, /依赖 Knowledge 检索/);
  assert.match(consultationServiceSource, /buildSkillDependencyWarnings/);
});
