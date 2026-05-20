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
const platformAdminRepositorySource = readFileSync(
  new URL("../../lib/db/platform-admin-repository.ts", import.meta.url),
  "utf8",
);
const consultationWorkspaceSource = readFileSync(
  new URL("../../components/merchant/consultation-workspace.tsx", import.meta.url),
  "utf8",
);
const consultationContractSource = readFileSync(
  new URL("../../contracts/consultation.ts", import.meta.url),
  "utf8",
);
const consultationRepositorySource = readFileSync(
  new URL("../../lib/db/consultation-repository.ts", import.meta.url),
  "utf8",
);
const strategySnapshotSource = readFileSync(
  new URL("../../lib/strategy-snapshot.ts", import.meta.url),
  "utf8",
);
const contentCalendarGuidanceSource = readFileSync(
  new URL("../../lib/content-calendar-guidance.ts", import.meta.url),
  "utf8",
);
const dailyContentTaskSource = readFileSync(
  new URL("./daily-content-task-service.ts", import.meta.url),
  "utf8",
);
const contentGenerationBatchSource = readFileSync(
  new URL("./content-generation-batch-service.ts", import.meta.url),
  "utf8",
);
const consultationMessagesRouteSource = readFileSync(
  new URL("../../app/api/consultation/sessions/[sessionId]/messages/route.ts", import.meta.url),
  "utf8",
);
const consultationPromptSoulMigrationSource = readFileSync(
  new URL("../../../supabase/migrations/202605070006_consultation_user_context_language.sql", import.meta.url),
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
  assert.match(consultationServiceAndRuntimeSource, /documentIds: expertKnowledgeDocumentIds/);
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

test("consultation context records replayable context boundary snapshots", () => {
  assert.match(consultationRuntimeSource, /buildContextBoundarySnapshot/);
  assert.match(consultationRuntimeSource, /consultation_context_boundary_v1/);
  assert.match(consultationRuntimeSource, /context_compact_boundary_v1/);
  assert.match(consultationRuntimeSource, /phase_3_snapshot_only_no_compaction_yet/);
  assert.match(consultationRuntimeSource, /state\.contextBoundary = contextBoundary/);
  assert.match(consultationRuntimeSource, /state\.contextBudget = contextBoundary\.budget/);
  assert.match(consultationRuntimeSource, /contextBoundary: state\.contextBoundary \?\? null/);
  assert.match(consultationServiceAndRuntimeSource, /recentConversation/);
  assert.match(consultationServiceAndRuntimeSource, /memoryMatchIds/);
  assert.match(serviceSource, /runtimeSnapshot\.toolCallSummary\.contextBoundary/);
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
  assert.match(consultationServiceAndRuntimeSource, /isRepeatableConsultationReadTool/);
  assert.match(consultationRuntimeSource, /!isRepeatableConsultationReadTool\(result\.toolName\)/);
  assert.match(consultationServiceAndRuntimeSource, /parseNativeConsultationToolCall/);
  assert.match(consultationServiceAndRuntimeSource, /toolChoice: getNativeToolChoice/);
  assert.match(consultationServiceAndRuntimeSource, /return "auto"/);
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

test("consultation runtime routes explicit knowledge reads through the retrieval tool", () => {
  assert.match(consultationServiceAndRuntimeSource, /retrieve_knowledge_base/);
  assert.match(consultationRuntimeSource, /shouldOpenWithKnowledgeBaseTool/);
  assert.match(consultationRuntimeSource, /isExplicitKnowledgeBaseReadRequest/);
  assert.match(consultationRuntimeSource, /name: "retrieve_knowledge_base"/);
  assert.match(serviceSource, /请先调用 retrieve_knowledge_base 获取资料/);
  assert.match(serviceSource, /用新的 query 再调用 retrieve_knowledge_base 深挖/);
  assert.match(serviceSource, /不要声称无法读取用户知识库/);
  assert.match(consultationRuntimeSource, /knowledgeMatches: \(result\.knowledgeMatches \?\? \[\]\)\.map/);
  assert.match(consultationRuntimeSource, /content: clipText\(match\.content, 1200\)/);
  assert.doesNotMatch(consultationRuntimeSource, /runtime_required_tool_contract/);
  assert.doesNotMatch(consultationRuntimeSource, /runRequiredNativeToolCall/);
  assert.doesNotMatch(serviceSource, /必须先调用 retrieve_knowledge_base/);
});

test("consultation-selected merchant knowledge flows into calendar tasks and Dify inputs", () => {
  assert.match(contentCalendarGuidanceSource, /buildMerchantKnowledgeCalendarGuidance/);
  assert.match(contentCalendarGuidanceSource, /source: "merchant_knowledge_base"/);
  assert.match(contentCalendarGuidanceSource, /assetCapabilityHints/);
  assert.match(contentCalendarGuidanceSource, /shotConstraints/);
  assert.match(contentCalendarGuidanceSource, /retrievalTrace/);
  assert.match(serviceSource, /buildMerchantKnowledgeCalendarGuidance/);
  assert.match(serviceSource, /attachGuidanceToContentCalendar/);
  assert.match(strategySnapshotSource, /normalizeContentCalendarGuidance/);
  assert.match(dailyContentTaskSource, /collectContentCalendarKnowledgeRefs/);
  assert.match(dailyContentTaskSource, /calendarGuidance/);
  assert.match(dailyContentTaskSource, /assetCapabilityHints: calendarGuidance\.assetCapabilityHints/);
  assert.match(dailyContentTaskSource, /shotConstraints: calendarGuidance\.shotConstraints/);
  assert.match(contentGenerationBatchSource, /formatKnowledgeRefForFallbackText/);
  assert.match(contentGenerationBatchSource, /chunkId: readString\(item\.chunkId\)/);
  assert.match(contentGenerationBatchSource, /listVideoAssetCapabilitiesForDify/);
  assert.match(contentGenerationBatchSource, /videoAssetCapabilities/);
  assert.match(contentGenerationBatchSource, /素材能力：/);
  assert.match(contentGenerationBatchSource, /镜头边界：/);
  assert.match(contentGenerationBatchSource, /fallback_knowledge_text/);
  assert.match(contentGenerationBatchSource, /calendar_task_json/);
  assert.doesNotMatch(contentGenerationBatchSource, /video_asset_capabilities_json/);
});

test("consultation runtime surfaces native tool call rejections as failed tool facts", () => {
  assert.match(consultationRuntimeSource, /buildNativeRejectedToolResult/);
  assert.match(consultationRuntimeSource, /native_tool_call_rejected/);
  assert.match(consultationRuntimeSource, /input\.toolResults\.push\(failedResult\)/);
  assert.match(consultationRuntimeSource, /emitRejectedNativeToolEvent/);
  assert.match(consultationRuntimeSource, /failedTools/);
  assert.match(consultationContractSource, /status: "completed" \| "skipped" \| "failed"/);
  assert.match(consultationRepositorySource, /function toToolCardStatus/);
  assert.match(consultationWorkspaceSource, /failedToolCardCount/);
  assert.match(consultationWorkspaceSource, /getToolCardStatusLabel/);
});

test("consultation runtime wraps tool execution exceptions as failed tool results", () => {
  assert.match(consultationRuntimeSource, /dispatchToolWithRuntimeSafety/);
  assert.match(consultationRuntimeSource, /buildToolRuntimeErrorResult/);
  assert.match(consultationRuntimeSource, /classifyToolRuntimeError/);
  assert.match(consultationRuntimeSource, /provider_error/);
  assert.match(consultationRuntimeSource, /runtime_error/);
  assert.match(consultationRuntimeSource, /status: "failed"/);
  assert.match(consultationRuntimeSource, /retryable: errorType === "provider_error" \|\| errorType === "runtime_error"/);
  assert.equal((consultationRuntimeSource.match(/input\.input\.dispatchTool\(/g) ?? []).length, 1);
  assert.match(consultationRuntimeSource, /result\.status !== "failed"/);
  assert.match(consultationRuntimeSource, /result\.status === "failed" \|\|/);
  assert.match(
    serviceSource,
    /result\.toolName === "retrieve_knowledge_base" && result\.status !== "failed"/,
  );
});

test("consultation runtime does not synthesize blocking clarification tool results", () => {
  assert.doesNotMatch(consultationRuntimeSource, /buildClarificationRequestResult/);
  assert.doesNotMatch(consultationRuntimeSource, /agent\.clarification\.requested/);
  assert.doesNotMatch(consultationRuntimeSource, /assistant_final_question/);
  assert.doesNotMatch(consultationRuntimeSource, /blocksAssetWrite: true/);
  assert.doesNotMatch(consultationRuntimeSource, /inferClarificationReasonCode/);
});

test("knowledge retrieval can directly surface indexed user documents", () => {
  assert.match(consultationRuntimeSource, /listMerchantKnowledgeDocumentMatches/);
  assert.match(consultationRuntimeSource, /listKnowledgeDocuments/);
  assert.match(consultationRuntimeSource, /listKnowledgeChunksByDocumentId/);
  assert.match(consultationRuntimeSource, /merchantKnowledgeDocumentIds/);
  assert.match(consultationRuntimeSource, /mergeKnowledgeMatches/);
  assert.match(consultationRuntimeSource, /consultation_hybrid_rag_v1/);
  assert.match(consultationRuntimeSource, /direct_merchant_document_scan/);
  assert.match(consultationRuntimeSource, /keyword_search/);
  assert.match(consultationRuntimeSource, /semantic_vector_search/);
  assert.match(consultationRuntimeSource, /sourceCounts/);
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

test("consultation code fallback only reports runtime errors instead of drafting strategy", () => {
  assert.match(serviceSource, /buildAssistantErrorReply/);
  assert.match(serviceSource, /AI 咨询服务暂时出现问题/);
  assert.match(serviceSource, /fallback_no_key/);
  assert.match(serviceSource, /fallback_error/);
  assert.match(serviceSource, /getConsultationToolDisplayLabel/);
  assert.match(serviceSource, /label: getConsultationToolDisplayLabel\(result\.toolName\)/);
  assert.doesNotMatch(serviceSource, /function buildAssistantReply\(/);
  assert.doesNotMatch(serviceSource, /buildFallbackPositioning/);
  assert.doesNotMatch(serviceSource, /buildFallbackCurrentSuggestion/);
  assert.doesNotMatch(serviceSource, /function buildContentCalendar/);
  assert.doesNotMatch(serviceSource, /引导用户私信咨询或预约下一步/);
  assert.doesNotMatch(serviceSource, /专业人设|场景种草|转化路径/);
  assert.doesNotMatch(serviceSource, /fallbackDraft/);
  assert.doesNotMatch(serviceSource, /真正的咨询应该先问实际情况/);
  assert.doesNotMatch(serviceSource, /商家资料/);
  assert.doesNotMatch(serviceSource, /商家上下文/);
  assert.doesNotMatch(serviceSource, /到店咨询/);
  assert.doesNotMatch(serviceSource, /到店转化主线/);
  assert.doesNotMatch(serviceSource, /到店咨询、私信转化、账号人设种草/);
  assert.doesNotMatch(
    serviceSource,
    /toolResults: \(input\.toolResults \?\? \[\]\)\.map\(\(result\) => \(\{\n\s*tool: result\.toolName/,
  );
  assert.equal(serviceSource.includes('join(" / ")'), false);
});

test("content generation does not return business draft fallbacks", () => {
  assert.match(contentGenerationSource, /ARTICLE_GENERATION_MODEL_UNAVAILABLE/);
  assert.match(contentGenerationSource, /ARTICLE_GENERATION_MODEL_FAILED/);
  assert.doesNotMatch(contentGenerationSource, /buildFallbackArticle/);
  assert.doesNotMatch(contentGenerationSource, /fallback_viral_generation|fallback_traffic_rewrite|fallback_compliance_safe|fallback_ip_persona/);
  assert.doesNotMatch(contentGenerationSource, /私信我领取|到店咨询|专业干货 \+ 场景/);
});

test("consultation visible tool language uses user context, not merchant context", () => {
  assert.match(consultationServiceAndRuntimeSource, /读取用户信息/);
  assert.match(consultationServiceAndRuntimeSource, /检索平台方法论与用户知识库/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /读取商家资料/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /检索平台方法论与商家上下文/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /商家画像读取/);
  assert.doesNotMatch(consultationServiceAndRuntimeSource, /到店咨询、私信转化、账号人设种草/);
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

test("consultation tool cards only render real executed tool results", () => {
  assert.match(serviceSource, /return \(input\.toolResults \?\? \[\]\)\.map/);
  assert.match(serviceSource, /summary: result\.summary/);
  assert.match(serviceSource, /status: result\.status/);
  assert.doesNotMatch(serviceSource, /本轮尚未写入策略资产/);
  assert.doesNotMatch(serviceSource, /策略资产确认前，本轮不生成内容日历/);
  assert.doesNotMatch(serviceSource, /策略资产确认前，本轮不生成图文任务草案/);
  assert.doesNotMatch(serviceSource, /策略资产确认前，本轮不生成视频任务草案/);
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
  assert.match(serviceSource, /strategySnapshot: finalizedStrategySnapshot/);
  assert.match(serviceSource, /strategyMarkdown: finalizedStrategyMarkdown/);
  assert.doesNotMatch(serviceSource, /previousSnapshot: null,\n\s*userMessages: \[\],\n\s*\}\);\n\s*const session = await createConsultationSession/);
});

test("empty merchant profiles do not seed local-service strategy assets", () => {
  assert.match(serviceSource, /buildInitialStrategySnapshot/);
  assert.match(serviceSource, /hasMerchantStrategySeedFacts/);
  assert.match(serviceSource, /createEmptyStrategySnapshot/);
  assert.match(serviceSource, /我不会先替你假设行业/);
  assert.doesNotMatch(serviceSource, /\?\? "本地服务"/);
  assert.doesNotMatch(serviceSource, /\?\? "本地生活服务"/);
  assert.doesNotMatch(serviceSource, /围绕 \$\{serviceAnchor\} 提供更适合/);
  assert.match(platformAdminRepositorySource, /当前用户或经营者/);
  assert.match(platformAdminRepositorySource, /资料不足时必须先追问/);
  assert.match(platformAdminRepositorySource, /不要替用户假设行业/);
  assert.doesNotMatch(platformAdminRepositorySource, /目标是帮助本地生活商家/);
});

test("initial consultation agent prompt and soul keep empty profile facts unknown", () => {
  assert.match(consultationPromptSoulMigrationSource, /初始咨询 Agent agent\.md v4/);
  assert.match(consultationPromptSoulMigrationSource, /初始咨询 Agent soul\.md v3/);
  assert.match(consultationPromptSoulMigrationSource, /agent_prompt_versions/);
  assert.match(consultationPromptSoulMigrationSource, /agent_soul_versions/);
  assert.match(consultationPromptSoulMigrationSource, /不要从用户名称、邮箱、账号名、空白资料、旧默认配置或平台业务推断行业/);
  assert.match(consultationPromptSoulMigrationSource, /区分“已确认事实 \/ 合理假设 \/ 待验证问题”/);
  assert.match(consultationPromptSoulMigrationSource, /一轮只问一个关键问题/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /目标是帮助本地生活商家/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /本地生活服务/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /高意向用户/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /到店/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /客流/);
  assert.doesNotMatch(consultationPromptSoulMigrationSource, /围绕本地生活服务 提供更适合/);
});

test("strategy asset markdown is the extensible primary document", () => {
  assert.match(serviceSource, /strategyMarkdown: state\.strategyMarkdown/);
  assert.match(serviceSource, /strategyMarkdownChars: finalizedStrategyMarkdown\.length/);
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
  assert.doesNotMatch(roundtableSource, /本地生活服务/);
  assert.doesNotMatch(roundtableSource, /提供本地化服务/);
  assert.doesNotMatch(roundtableSource, /商家资料/);
  assert.doesNotMatch(roundtableSource, /buildFieldItems/);
  assert.doesNotMatch(roundtableSource, /keywordHits/);
  assert.doesNotMatch(roundtableSource, /真实案例 \+ 方法说明 \+ 风险边界/);
});
