import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(new URL("./consultation-service.ts", import.meta.url), "utf8");
const roundtableSource = readFileSync(
  new URL("./roundtable-consultation-service.ts", import.meta.url),
  "utf8",
);
const contentGenerationSource = readFileSync(
  new URL("./content-generation-service.ts", import.meta.url),
  "utf8",
);

test("consultation runtime resolves online agent prompt and skill bindings", () => {
  assert.match(serviceSource, /getConsultationDefaultRouteBinding/);
  assert.match(serviceSource, /getAgentConfigById/);
  assert.match(serviceSource, /listAgentPromptVersions/);
  assert.match(serviceSource, /listAgentSkillBindings/);
  assert.match(serviceSource, /listAgentSkills/);
  assert.match(serviceSource, /agent\.serviceFlags\.skillsEnabled/);
});

test("consultation runtime uses progressive skill disclosure", () => {
  assert.match(serviceSource, /mode: "progressive_disclosure"/);
  assert.match(serviceSource, /buildSkillCatalogPrompt/);
  assert.match(serviceSource, /buildActiveSkillPrompt/);
  assert.match(serviceSource, /候选 Skills：渐进式披露/);
  assert.match(serviceSource, /本轮激活 Skill/);
  assert.match(serviceSource, /selectActiveConsultationSkills/);
  assert.match(serviceSource, /normalizeSkillMatchText/);
});

test("consultation runtime exposes right panel assets through bounded business tools", () => {
  assert.match(serviceSource, /getConsultationBusinessToolCatalog/);
  assert.match(serviceSource, /update_strategy_snapshot/);
  assert.match(serviceSource, /策略资产 Editor/);
  assert.match(serviceSource, /update_strategy_asset_editor/);
  assert.match(serviceSource, /resolveStrategyAssetEditorPatch/);
  assert.match(serviceSource, /toolChoice/);
  assert.match(serviceSource, /update_content_calendar/);
  assert.match(serviceSource, /generate_article_brief/);
  assert.match(serviceSource, /generate_video_brief/);
  assert.match(
    serviceSource,
    /strategySnapshot as one editor document: positioning \/ coreSellingPoints \/ targetAudiences \/ keyScenes \/ currentSuggestion/,
  );
  assert.match(serviceSource, /strategySnapshot\.contentCalendarDraft/);
});

test("strategy assets are merchant-level and stable across consultation sessions", () => {
  assert.match(serviceSource, /getMerchantStrategyAsset/);
  assert.match(serviceSource, /ensureMerchantStrategyAsset/);
  assert.match(serviceSource, /upsertMerchantStrategyAsset/);
  assert.match(serviceSource, /existingMerchantStrategyAsset \?\? session\.strategySnapshot/);
  assert.match(serviceSource, /strategySnapshot: merchantStrategyAsset/);
  assert.match(serviceSource, /strategySnapshot: loopResult\.strategySnapshot/);
  assert.doesNotMatch(serviceSource, /previousSnapshot: null,\n\s*userMessages: \[\],\n\s*\}\);\n\s*const session = await createConsultationSession/);
});

test("strategy asset editor validates model tool arguments before applying them", () => {
  assert.match(serviceSource, /import \{ z \} from "zod"/);
  assert.match(serviceSource, /strategyAssetDocumentSchema = z/);
  assert.match(serviceSource, /strategyAssetEditorToolArgsSchema = z/);
  assert.match(serviceSource, /z\.enum\(strategyAssetFieldKeys\)/);
  assert.match(serviceSource, /strategyAsset: strategyAssetDocumentSchema/);
  assert.match(serviceSource, /\.strict\(\)/);
  assert.match(serviceSource, /strategyAssetEditorToolArgsSchema\.safeParse/);
  assert.match(serviceSource, /formatStrategyAssetEditorSchemaError/);
});

test("strategy asset editor returns validation errors as tool results and retries once", () => {
  assert.match(serviceSource, /tool_arguments_validation_failed/);
  assert.match(serviceSource, /role: "tool"/);
  assert.match(serviceSource, /toolCallId: toolCall\.id/);
  assert.match(serviceSource, /buildStrategyAssetEditorValidationToolResult/);
  assert.match(serviceSource, /retryInstruction/);
  assert.match(serviceSource, /retryParsed\.ok/);
});

test("strategy asset editor is a full-document tool call, not runtime semantic parsing", () => {
  assert.match(serviceSource, /传入完整 strategyAsset 文档/);
  assert.match(serviceSource, /currentStrategySnapshot/);
  assert.match(serviceSource, /conversationMessages/);
  assert.match(serviceSource, /recentConversation: state\.conversationMessages\.slice\(-8\)/);
  assert.match(serviceSource, /runtime 不会替你解析中文指代/);
  assert.match(serviceSource, /buildStrategyAssetSnapshotPatch/);
  assert.doesNotMatch(serviceSource, /buildStrategyAssetEditorPatch/);
  assert.doesNotMatch(serviceSource, /extractStrategyAssetFieldValue/);
  assert.doesNotMatch(serviceSource, /extractReferencedTargetAudiences/);
  assert.doesNotMatch(serviceSource, /shouldResolveReferencedTargetAudiences/);
  assert.doesNotMatch(serviceSource, /completeStrategyAssetEditorPatch/);
  assert.doesNotMatch(serviceSource, /isAllowedStrategyAssetListItem/);
  assert.doesNotMatch(serviceSource, /splitTargetAudience/);
  assert.doesNotMatch(serviceSource, /splitOnDunhao/);
  assert.doesNotMatch(serviceSource, /门店\\s\*3\\s\*公里内高意向到店人群/);
});

test("roundtable consultation uses fixed phase handoff instead of free swarm", () => {
  assert.match(serviceSource, /createRoundtableConsultationSessionForUser/);
  assert.match(serviceSource, /resolveRoundtableState\(effectiveSession\)/);
  assert.match(roundtableSource, /roundtablePhaseOrder: RoundtableInterviewPhaseKey\[\] = \["asset", "skill", "marketing"\]/);
  assert.match(roundtableSource, /phase_summary_confirmed/);
  assert.match(roundtableSource, /第一版只传阶段结构化摘要，不默认传全量 transcript/);
  assert.match(roundtableSource, /roundtableQuestionSchema/);
  assert.match(roundtableSource, /responseFormat: "json_object"/);
  assert.doesNotMatch(roundtableSource, /swarm/i);
});

test("roundtable strategy writes only after synthesis confirmation and is snapshotted downstream", () => {
  assert.match(roundtableSource, /saveRoundtableStrategyCandidate/);
  assert.match(roundtableSource, /status !== "synthesis_review" \|\| !input\.state\.strategyCandidate/);
  assert.match(roundtableSource, /upsertMerchantStrategyAsset/);
  assert.match(roundtableSource, /strategySnapshot: input\.state\.strategyCandidate/);
  assert.match(contentGenerationSource, /buildRoundtableSnapshotForInput/);
  assert.match(contentGenerationSource, /roundtableContext/);
});

test("roundtable phase outputs are model structured, not keyword matched placeholders", () => {
  assert.match(roundtableSource, /roundtablePhaseSummarySchema/);
  assert.match(roundtableSource, /strategyCandidateSchema/);
  assert.match(roundtableSource, /阶段摘要模型输出不可用或结构化校验失败/);
  assert.match(roundtableSource, /用户说「没懂」「什么意思」「不知道」这类内容/);
  assert.doesNotMatch(roundtableSource, /buildFallbackQuestion/);
  assert.doesNotMatch(roundtableSource, /buildFieldItems/);
  assert.doesNotMatch(roundtableSource, /keywordHits/);
  assert.doesNotMatch(roundtableSource, /真实案例 \+ 方法说明 \+ 风险边界/);
});
