import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync(new URL("./consultation-service.ts", import.meta.url), "utf8");
const aiRuntimeSource = readFileSync(new URL("./ai-runtime.ts", import.meta.url), "utf8");
const consultationRuntimeSource = [
  "context.ts",
  "events.ts",
  "experts.ts",
  "guards.ts",
  "planner.ts",
  "rag.ts",
  "runtime.ts",
  "skills.ts",
  "tools.ts",
  "types.ts",
  "utils.ts",
]
  .map((fileName) =>
    readFileSync(new URL(`./consultation-runtime/${fileName}`, import.meta.url), "utf8"),
  )
  .join("\n");
const consultationServiceAndRuntimeSource = `${serviceSource}\n${consultationRuntimeSource}`;
const roundtableSource = readFileSync(
  new URL("./roundtable-consultation-service.ts", import.meta.url),
  "utf8",
);
const contentGenerationSource = readFileSync(
  new URL("./content-generation-service.ts", import.meta.url),
  "utf8",
);
const agentConsoleRepositorySource = readFileSync(
  new URL("../../lib/db/agent-console-repository.ts", import.meta.url),
  "utf8",
);
const consultationWorkspaceSource = readFileSync(
  new URL("../../components/merchant/consultation-workspace.tsx", import.meta.url),
  "utf8",
);
const consultationMessagesRouteSource = readFileSync(
  new URL("../../app/api/consultation/sessions/[sessionId]/messages/route.ts", import.meta.url),
  "utf8",
);

test("consultation runtime resolves online agent prompt and skill bindings", () => {
  assert.match(consultationServiceAndRuntimeSource, /getConsultationDefaultRouteBinding/);
  assert.match(consultationServiceAndRuntimeSource, /getAgentConfigById/);
  assert.match(consultationServiceAndRuntimeSource, /resolveMentionedConsultationAgentRuntime/);
  assert.match(consultationServiceAndRuntimeSource, /parseLeadingAgentMention/);
  assert.match(consultationServiceAndRuntimeSource, /findMentionedAgent/);
  assert.match(consultationServiceAndRuntimeSource, /listAgentPromptVersions/);
  assert.match(consultationServiceAndRuntimeSource, /listAgentSkillBindings/);
  assert.match(consultationServiceAndRuntimeSource, /listAgentSkills/);
  assert.match(consultationServiceAndRuntimeSource, /agent\.serviceFlags\.skillsEnabled/);
});

test("consultation runtime injects soul.md and records asset versions", () => {
  assert.match(consultationServiceAndRuntimeSource, /listAgentSoulVersions/);
  assert.match(consultationServiceAndRuntimeSource, /buildAgentSoulPrompt/);
  assert.match(consultationServiceAndRuntimeSource, /activeSoulVersion/);
  assert.match(consultationServiceAndRuntimeSource, /soulPrompt/);
  assert.match(consultationServiceAndRuntimeSource, /soulVersionId/);
  assert.match(consultationServiceAndRuntimeSource, /agentAssetVersions/);
  assert.match(consultationServiceAndRuntimeSource, /memoryMdPolicy: "placeholder_not_injected"/);
});

test("merchant consultation UI exposes expert roster and inserts mentions", () => {
  assert.match(serviceSource, /listConsultationExpertsForUser/);
  assert.match(serviceSource, /ConsultationExpertRosterItemDto/);
  assert.match(consultationWorkspaceSource, new RegExp("/api/consultation/experts"));
  assert.match(consultationWorkspaceSource, /ExpertMentionBar/);
  assert.match(consultationWorkspaceSource, /insertExpertMention/);
  assert.match(consultationWorkspaceSource, /@ 专家/);
  assert.match(consultationWorkspaceSource, /getMessageAgentLoopMeta/);
});

test("merchant consultation UI keeps expert container as the only visible multi-expert entry", () => {
  assert.doesNotMatch(consultationWorkspaceSource, /圆桌咨询 Beta/);
  assert.doesNotMatch(consultationWorkspaceSource, /createSession\("roundtable"\)/);
  assert.doesNotMatch(consultationWorkspaceSource, /RoundtableProgressPanel/);
  assert.doesNotMatch(consultationWorkspaceSource, /RoundtableActionBar/);
  assert.match(consultationWorkspaceSource, /LegacyRoundtableNotice/);
});

test("consultation runtime treats expert as container and context as shared injection", () => {
  assert.match(consultationServiceAndRuntimeSource, /ConsultationMentionRouting/);
  assert.match(consultationServiceAndRuntimeSource, /buildExpertContainerPrompt/);
  assert.match(consultationServiceAndRuntimeSource, /buildConsultationContextInjection/);
  assert.match(consultationServiceAndRuntimeSource, /consultation_context_injector_v1/);
  assert.match(consultationServiceAndRuntimeSource, /@ 只切换目标专家，不清空历史与策略资产/);
  assert.match(consultationServiceAndRuntimeSource, /mentionRouting: routedRuntime\.routing/);
  assert.match(consultationServiceAndRuntimeSource, /contextInjection/);
});

test("consultation runtime injects short-term expert traffic handoff notes", () => {
  assert.match(consultationRuntimeSource, /short-term expert traffic/);
  assert.match(consultationRuntimeSource, /SharedConsultationState/);
  assert.match(consultationRuntimeSource, /ExpertTurnNote/);
  assert.match(consultationRuntimeSource, /buildSharedConsultationState/);
  assert.match(consultationRuntimeSource, /buildExpertTurnNotes/);
  assert.match(consultationRuntimeSource, /buildExpertTrafficContextBlock/);
  assert.match(consultationRuntimeSource, /handoffForNextExpert/);
  assert.match(consultationRuntimeSource, /short_term_expert_traffic_v1/);
  assert.match(consultationServiceAndRuntimeSource, /@ 只切换目标专家/);
  assert.match(serviceSource, /recentExpertTurnNotes/);
  assert.match(serviceSource, /latestExpertTurnNote/);
});

test("consultation runtime does not expose local reference source paths", () => {
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /references\/open-source/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /claude-code泄漏/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /hermes-agent/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /hermes_safe_context_block/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /systemPromptPreview/);
  assert.match(consultationServiceAndRuntimeSource, /bounded_business_tool_loop_v1/);
  assert.match(consultationServiceAndRuntimeSource, /controlled_context_chunks_only/);
});

test("expert container can scope knowledge and runtime tool policy", () => {
  assert.match(consultationServiceAndRuntimeSource, /listAgentKnowledgeSetBindings/);
  assert.match(consultationServiceAndRuntimeSource, /listKnowledgeSetDocuments/);
  assert.match(consultationServiceAndRuntimeSource, /knowledgeDocumentIds/);
  assert.match(consultationServiceAndRuntimeSource, /documentIds: toStringArrayValue\(input\.knowledgeDocumentIds\)/);
  assert.match(consultationServiceAndRuntimeSource, /resolveAgentRuntimeOverrides/);
  assert.match(consultationServiceAndRuntimeSource, /modelConfig\.enabledTools/);
  assert.match(consultationServiceAndRuntimeSource, /modelConfig\.retrievalTopK/);
});

test("consultation runtime uses progressive skill disclosure", () => {
  assert.match(consultationServiceAndRuntimeSource, /mode: "progressive_disclosure"/);
  assert.match(consultationServiceAndRuntimeSource, /buildSkillCatalogPrompt/);
  assert.match(consultationServiceAndRuntimeSource, /buildActiveSkillPrompt/);
  assert.match(consultationServiceAndRuntimeSource, /buildSkillReferencePrompt/);
  assert.match(consultationServiceAndRuntimeSource, /buildSkillDependencyWarnings/);
  assert.match(consultationServiceAndRuntimeSource, /skillDependencyWarnings/);
  assert.match(consultationServiceAndRuntimeSource, /候选 Skills：渐进式披露/);
  assert.match(consultationServiceAndRuntimeSource, /本轮激活 Skill/);
  assert.match(consultationServiceAndRuntimeSource, /本轮 Skill References/);
  assert.match(consultationServiceAndRuntimeSource, /selectActiveConsultationSkills/);
  assert.match(consultationServiceAndRuntimeSource, /scoreConsultationSkills/);
  assert.match(consultationServiceAndRuntimeSource, /triggerReasons/);
  assert.match(consultationServiceAndRuntimeSource, /usageSignal/);
  assert.match(consultationServiceAndRuntimeSource, /normalizeSkillMatchText/);
  assert.match(consultationServiceAndRuntimeSource, /metadata\.references/);
  assert.match(consultationServiceAndRuntimeSource, /activeSkillReferences/);
});

test("consultation context records budget and session summary", () => {
  assert.match(consultationServiceAndRuntimeSource, /ContextBudgetReport/);
  assert.match(consultationServiceAndRuntimeSource, /buildContextBudgetReport/);
  assert.match(consultationServiceAndRuntimeSource, /sessionSummary/);
  assert.match(consultationServiceAndRuntimeSource, /char_budget_v1/);
  assert.match(consultationServiceAndRuntimeSource, /contextBudget/);
});

test("consultation runtime exposes right panel assets through bounded business tools", () => {
  assert.match(consultationServiceAndRuntimeSource, /getConsultationBusinessToolCatalog/);
  assert.match(consultationServiceAndRuntimeSource, /update_strategy_snapshot/);
  assert.match(consultationServiceAndRuntimeSource, /策略资产 Editor/);
  assert.match(consultationServiceAndRuntimeSource, /update_strategy_asset_editor/);
  assert.match(consultationServiceAndRuntimeSource, /resolveStrategyAssetEditorPatch/);
  assert.match(consultationServiceAndRuntimeSource, /toolChoice/);
  assert.match(consultationServiceAndRuntimeSource, /update_content_calendar/);
  assert.match(consultationServiceAndRuntimeSource, /generate_article_brief/);
  assert.match(consultationServiceAndRuntimeSource, /generate_video_brief/);
  assert.match(
    consultationServiceAndRuntimeSource,
    /strategySnapshot as one editor document: positioning \/ coreSellingPoints \/ targetAudiences \/ keyScenes \/ currentSuggestion/,
  );
  assert.match(consultationServiceAndRuntimeSource, /strategySnapshot\.contentCalendarDraft/);
});

test("consultation planner supports native tool calling with deterministic fallback", () => {
  assert.match(consultationServiceAndRuntimeSource, /plannerMode: "native_tool_calling"/);
  assert.match(consultationServiceAndRuntimeSource, /native_tool_calling_loop_v1/);
  assert.match(consultationServiceAndRuntimeSource, /buildNativeToolCallingMessages/);
  assert.match(consultationServiceAndRuntimeSource, /buildConsultationAiRuntimeTools/);
  assert.match(consultationServiceAndRuntimeSource, /parseNativeConsultationToolCall/);
  assert.match(consultationServiceAndRuntimeSource, /toolChoice: "auto"/);
  assert.match(consultationServiceAndRuntimeSource, /agent\.tool\.requested/);
  assert.match(consultationServiceAndRuntimeSource, /source: "model_tool_calls"/);
  assert.match(consultationServiceAndRuntimeSource, /native_tool_calling_fallback/);
  assert.match(consultationServiceAndRuntimeSource, /fallback_deterministic/);
  assert.match(consultationServiceAndRuntimeSource, /tool_arguments_validation_failed/);
  assert.match(consultationServiceAndRuntimeSource, /planNextConsultationToolCall/);
  assert.match(consultationServiceAndRuntimeSource, /responseFormat: "json_object"/);
  assert.match(consultationServiceAndRuntimeSource, /plannerDecisionSchema/);
  assert.match(consultationServiceAndRuntimeSource, /model_json_planner/);
  assert.match(consultationServiceAndRuntimeSource, /getReadyToolNames/);
  assert.match(consultationServiceAndRuntimeSource, /getToolDependencies/);
  assert.match(consultationServiceAndRuntimeSource, /mergePlannerToolArgs/);
  assert.match(consultationServiceAndRuntimeSource, /模型 planner 选择了不可执行工具/);
  assert.match(consultationServiceAndRuntimeSource, /plannerTrace/);
});

test("AI runtime preserves native tool call/result pairs when trimming messages", () => {
  assert.match(aiRuntimeSource, /selectMessagesForChatCompletion/);
  assert.match(aiRuntimeSource, /assistant\.toolCalls/);
  assert.match(aiRuntimeSource, /role: "tool"/);
  assert.match(aiRuntimeSource, /tool_call_id/);
  assert.match(aiRuntimeSource, /tool_calls: message\.toolCalls/);
  assert.doesNotMatch(aiRuntimeSource, /messages: input\.messages\.slice\(0, 20\)/);
});

test("consultation runtime does not treat skipped strategy writes as completed dependencies", () => {
  assert.match(consultationRuntimeSource, /getPlannerCompletedToolNames/);
  assert.match(
    consultationRuntimeSource,
    /result\.toolName !== "update_strategy_snapshot" \|\| result\.status === "completed"/,
  );
  assert.match(consultationRuntimeSource, /shouldStopAfterToolResult/);
  assert.match(
    consultationRuntimeSource,
    /result\.toolName === "update_strategy_snapshot" && result\.status !== "completed"/,
  );
});

test("consultation fallback replies hide internal tool keys and avoid false write claims", () => {
  assert.match(serviceSource, /isLowInformationConsultationTurn/);
  assert.match(serviceSource, /isConsultationProcessQuestion/);
  assert.match(serviceSource, /真正的咨询应该先问实际情况/);
  assert.match(serviceSource, /我先不改右侧策略资产/);
  assert.match(serviceSource, /为了避免套模板/);
  assert.match(serviceSource, /hasCompletedConsultationTool/);
  assert.match(serviceSource, /strategyWriteCompleted/);
  assert.match(serviceSource, /getConsultationToolDisplayLabel/);
  assert.match(serviceSource, /label: getConsultationToolDisplayLabel\(result\.toolName\)/);
  assert.doesNotMatch(
    serviceSource,
    /toolResults: \(input\.toolResults \?\? \[\]\)\.map\(\(result\) => \(\{\n\s*tool: result\.toolName/,
  );
  assert.equal(serviceSource.includes('join(" / ")'), false);
});

test("consultation stage label follows completed tools instead of message count", () => {
  assert.match(serviceSource, /resolveConsultationStageLabel/);
  assert.match(serviceSource, /initialStage = "咨询诊断中"/);
  assert.match(serviceSource, /stageLabel: initialStage/);
  assert.match(serviceSource, /state\.nextStage = nextStage/);
  assert.match(serviceSource, /"实际情况确认中"/);
  assert.match(serviceSource, /"策略资产待确认"/);
  assert.match(serviceSource, /"策略沉淀完成"/);
  assert.doesNotMatch(serviceSource, /nextRound >= Math\.min\(3, maxConversationRounds\)/);
  assert.doesNotMatch(serviceSource, /nextRound === 2/);
});

test("consultation tool cards do not mark unexecuted writer tools as completed", () => {
  assert.match(serviceSource, /本轮尚未写入策略资产/);
  assert.match(serviceSource, /策略资产确认前，本轮不生成内容日历/);
  assert.match(serviceSource, /策略资产确认前，本轮不生成图文任务草案/);
  assert.match(serviceSource, /策略资产确认前，本轮不生成视频任务草案/);
  assert.doesNotMatch(serviceSource, /summary: "已生成图文与视频混合的一周内容草案。",\n\s*status: "completed"/);
  assert.doesNotMatch(serviceSource, /summary: "已准备好图文工作台的默认选题与标题方向。",\n\s*status: "completed"/);
  assert.doesNotMatch(serviceSource, /summary: "已准备好视频钩子、脚本方向和保底输出目标。",\n\s*status: "completed"/);
});

test("strategy assets are merchant-level and stable across consultation sessions", () => {
  assert.match(serviceSource, /getMerchantStrategyAssetDocument/);
  assert.match(serviceSource, /ensureMerchantStrategyAssetDocument/);
  assert.match(serviceSource, /upsertMerchantStrategyAssetDocument/);
  assert.match(serviceSource, /existingMerchantStrategyAsset\?\.strategySnapshot \?\? session\.strategySnapshot/);
  assert.match(serviceSource, /strategyAsset: merchantStrategyAsset/);
  assert.match(serviceSource, /strategySnapshot: loopResult\.strategySnapshot/);
  assert.match(serviceSource, /strategyMarkdown: loopResult\.strategyMarkdown/);
  assert.doesNotMatch(serviceSource, /previousSnapshot: null,\n\s*userMessages: \[\],\n\s*\}\);\n\s*const session = await createConsultationSession/);
});

test("strategy asset markdown is the extensible primary document", () => {
  assert.match(serviceSource, /strategyMarkdown: state\.strategyMarkdown/);
  assert.match(serviceSource, /strategyMarkdownChars: loopResult\.strategyMarkdown\.length/);
  assert.match(serviceSource, /strategyAsset 必须包含 positioning、coreSellingPoints、targetAudiences、keyScenes、currentSuggestion、strategyMarkdown 六个字段/);
  assert.match(serviceSource, /strategyMarkdown 是右侧策略资产的主文档/);
  assert.match(serviceSource, /strategyMarkdown 写完整 Markdown 策略资产文档/);
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

test("strategy asset editor uses guardrails before writing merchant assets", () => {
  assert.match(consultationServiceAndRuntimeSource, /guardStrategyAssetEditorPatch/);
  assert.match(consultationServiceAndRuntimeSource, /StrategyAssetGuardDecision/);
  assert.match(consultationServiceAndRuntimeSource, /source: "tool_not_called"/);
  assert.match(consultationServiceAndRuntimeSource, /source: "validation_failed"/);
  assert.match(consultationServiceAndRuntimeSource, /source: "runtime_error"/);
  assert.match(consultationServiceAndRuntimeSource, /low_confidence_user_intent/);
  assert.match(consultationServiceAndRuntimeSource, /unsafe_editor_content/);
  assert.match(serviceSource, /strategyWriteApplied/);
  assert.match(serviceSource, /status: strategyWriteApplied \? "completed" : "skipped"/);
  assert.match(serviceSource, /guardrail: \{/);
});

test("consultation runtime records replayable snapshots without blocking replies", () => {
  assert.match(serviceSource, /recordConsultationRuntimeSnapshotSafely/);
  assert.match(consultationRuntimeSource, /buildConsultationRuntimeSnapshotRecord/);
  assert.match(serviceSource, /agent\.runtime_snapshot\.failed/);
  assert.match(serviceSource, /Snapshot telemetry must never block/);
  assert.match(serviceSource, /candidateSkillIds/);
  assert.match(serviceSource, /actualSkillIds/);
  assert.match(serviceSource, /knowledgeMatchIds/);
  assert.match(serviceSource, /toolCallSummary/);
  assert.match(consultationRuntimeSource, /memoryMatches/);
  assert.match(consultationRuntimeSource, /contentKind === "merchant_memory"/);
  assert.match(agentConsoleRepositorySource, /recordAgentRuntimeSnapshot/);
  assert.match(agentConsoleRepositorySource, /agent_runtime_snapshots/);
  assert.match(agentConsoleRepositorySource, /tool_call_summary/);
  assert.match(agentConsoleRepositorySource, /mapAgentRuntimeSnapshot/);
});

test("consultation message send is queued and completed in the background", () => {
  assert.match(serviceSource, /enqueueConsultationMessageForUser/);
  assert.match(serviceSource, /processQueuedConsultationMessageForUser/);
  assert.match(serviceSource, /agent\.loop\.queued/);
  assert.match(serviceSource, /hasPendingAssistantReply/);
  assert.match(consultationMessagesRouteSource, /after\(\(\) =>/);
  assert.match(consultationMessagesRouteSource, /status: queued\.processing \? 202 : 200/);
  assert.match(consultationWorkspaceSource, /AssistantThinkingBubble/);
  assert.match(consultationWorkspaceSource, /isConsultationAssistantPending/);
  assert.match(consultationWorkspaceSource, /refreshPendingSession/);
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
  assert.match(roundtableSource, /RoundtableExpertContainer/);
  assert.match(roundtableSource, /expertContainers/);
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
