import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SCRIPT_PRODUCTION_AGENT_MAX_STEPS,
  SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED_MESSAGE,
  buildScriptProductionAgentMessages,
  classifyVideoScriptRevisionIntent,
  isScriptProductionModelConfigured,
  parseScriptProductionAgentResponse,
  validateScriptProductionBrief,
  type ScriptProductionBrief,
} from "./video-script-production-agent.ts";

const completeBrief: ScriptProductionBrief = {
  platform: "douyin",
  contentForm: "video",
  topicDirection: "第一次到店前，先看这 3 个细节",
  targetAudiences: ["首次咨询前还在比较的用户"],
  accountPositioning: "专业可信的本地门店",
  businessScope: "本地生活 / 普拉提门店",
  contentScope: "门店信任感短视频",
  productOrServiceInfo: ["普拉提私教"],
  customerAdvantages: ["真实环境", "稳定交付"],
  ctaOptions: ["私信预约体验"],
  forbiddenExpressions: ["包瘦"],
  brandTone: "专业、温柔、可信",
  availableMaterials: [
    {
      title: "门店环境视频",
      description: "真实门店环境、老师讲解和器械细节。",
    },
  ],
  availableScenes: ["到店前决策"],
  customerRequirement: "更强调专业信任感",
  consultationConclusion: {
    summaryText: "用户希望提高首次咨询前的信任感。",
    currentSuggestion: "先建立信任，再引导私信。",
    videoHook: "不知道怎么判断一家店靠不靠谱？",
    videoOutcome: "私信预约体验",
    contentCalendarTag: "信任建立",
  },
  evidenceReferences: [
    {
      title: "平台短视频拍摄规则",
      content: "门店类短视频优先使用真实环境和服务动作，不使用无依据效果承诺。",
      source: "knowledge_base",
    },
  ],
};

const agentSource = readFileSync(
  new URL("./video-script-production-agent.ts", import.meta.url),
  "utf8",
);

function userPayloadFrom(messages: ReturnType<typeof buildScriptProductionAgentMessages>) {
  return JSON.parse(messages[1].content);
}

function activePromptCard(
  messages: ReturnType<typeof buildScriptProductionAgentMessages>,
  cardId: string,
) {
  const userPayload = userPayloadFrom(messages);
  const card = userPayload.activePromptCards.find(
    (candidate: { id: string }) => candidate.id === cardId,
  );

  assert.ok(card, `Missing active prompt card: ${cardId}`);

  return card;
}

function activePromptCardText(
  messages: ReturnType<typeof buildScriptProductionAgentMessages>,
  cardId: string,
) {
  const card = activePromptCard(messages, cardId);

  return [card.title, card.useWhen, ...(card.rules ?? [])].join("\n");
}

function outputSchemaFrom(messages: ReturnType<typeof buildScriptProductionAgentMessages>) {
  const outputContract = activePromptCard(messages, "output_contract");
  assert.ok(outputContract.schema, "Missing output schema in output_contract card");

  return outputContract.schema;
}

test("video workbench agent prompt frames script production as a gated tool", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const systemPrompt = messages[0].content;

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(systemPrompt, /Prompt 目录/);
  assert.match(systemPrompt, /规则目录/);
  assert.match(systemPrompt, /activePromptCards/);
  assert.match(systemPrompt, /role_boundary/);
  assert.match(systemPrompt, /sufficiency_threshold/);
  assert.match(systemPrompt, /source_priority/);
  assert.match(systemPrompt, /output_contract/);
  assert.match(systemPrompt, /格式骨架见该卡 schema/);
  assert.doesNotMatch(systemPrompt, /你是「短视频脚本设计大师」/);
  assert.doesNotMatch(systemPrompt, /你是「脚本设计大师」/);
  assert.doesNotMatch(systemPrompt, /视频工作台创作 Agent/);
  assert.doesNotMatch(systemPrompt, /咨询台已确认信息最高优先级/);
  assert.doesNotMatch(systemPrompt, /脚本制作 tool/);
  assert.doesNotMatch(systemPrompt, /modify_script/);
  assert.doesNotMatch(systemPrompt, /视频制作 tool/);
  assert.doesNotMatch(systemPrompt, /抖音竖版/);
  assert.doesNotMatch(systemPrompt, /只输出 JSON/);
  assert.doesNotMatch(systemPrompt, /ready、needs_more_info 或 tool_failed/);
  assert.doesNotMatch(systemPrompt, /增长/);
  assert.doesNotMatch(systemPrompt, /账号\/业务定位指/);
  assert.doesNotMatch(systemPrompt, /productionGoal 用一句话说明/);
  assert.ok(systemPrompt.split("\n").filter((line) => /^\d{2}\.\s/.test(line)).length <= 8);

  const userPayload = userPayloadFrom(messages);
  assert.equal(userPayload.task, "generate_video_script_version");
  assert.equal(userPayload.maxSteps, SCRIPT_PRODUCTION_AGENT_MAX_STEPS);
  assert.ok(Array.isArray(userPayload.activePromptCards));
  assert.ok(userPayload.activePromptCards.length > 0);
  const roleBoundary = activePromptCardText(messages, "role_boundary");
  assert.match(roleBoundary, /短视频脚本设计大师/);
  assert.match(roleBoundary, /咨询台已确认信息最高优先级/);
  assert.match(roleBoundary, /没有外部工具调用/);
  assert.equal(userPayload.outputSchema, undefined);
  const outputSchema = outputSchemaFrom(messages);
  assert.equal(outputSchema.status, "ready | needs_more_info");
  assert.equal("toolName" in outputSchema, false);
  assert.equal(outputSchema.version.script.title, "string");
  assert.equal(userPayload.expectedCandidateTypes, undefined);
  assert.deepEqual(userPayload.scriptProductionBrief, completeBrief);
});

test("script production detailed prompt rules live outside the agent system prompt module", () => {
  assert.match(
    agentSource,
    /from "\.\/video-script-production-agent-prompt-doc\.ts"/,
  );
  assert.doesNotMatch(agentSource, /const SCRIPT_PRODUCTION_AGENT_OUTPUT_SCHEMA/);
  assert.doesNotMatch(agentSource, /const SCRIPT_PRODUCTION_AGENT_PROMPT_CARDS/);
  assert.doesNotMatch(agentSource, /function buildActiveScriptProductionPromptCards/);
});

test("script production agent entry module stays small", () => {
  assert.ok(agentSource.split("\n").length <= 130);
});

test("script production agent prompt requires structured script version scenes", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const outputSchema = outputSchemaFrom(messages);
  const sceneSchema = outputSchema.version.script.scenes[0];

  assert.equal(outputSchema.version.changeSummary, "string");
  assert.match(sceneSchema.timeRange, /00:00/);
  assert.match(sceneSchema.shotRequirement, /string/i);
  assert.match(sceneSchema.voiceover, /string/i);
});

test("script production prompt numbers every concrete design line", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const concreteLines = messages[0].content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^【[^】]+】$/.test(line) && !/^〔[^〕]+〕$/.test(line));

  assert.ok(concreteLines.length > 0);

  concreteLines.forEach((line, index) => {
    const expectedNumber = String(index + 1).padStart(2, "0");
    assert.match(line, new RegExp(`^${expectedNumber}\\.\\s`));
  });
});

test("script production system prompt stays directory-only", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const systemPrompt = messages[0].content;

  [
    "role_boundary",
    "sufficiency_threshold",
    "source_priority",
    "initial_generation",
    "versioning",
    "output_contract",
    "tool_and_failure",
  ].forEach((cardId) => {
    assert.match(systemPrompt, new RegExp(cardId));
  });

  assert.doesNotMatch(systemPrompt, /〔/);
  assert.doesNotMatch(systemPrompt, /已确认信息最高优先级/);
  assert.doesNotMatch(systemPrompt, /不得生成默认脚本/);
});

test("script production prompt explains output fields by workflow purpose", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const outputContract = activePromptCardText(messages, "output_contract");

  assert.match(outputContract, /本卡 schema/);
  assert.match(outputContract, /ready 时返回 productionGoal、evidenceSummary、version、riskNotes、confirmQuestions/);
  assert.match(outputContract, /version 必须包含 baseVersionId、versionNo、changeSummary、script/);
  assert.match(outputContract, /script 必须包含 title、hook、whyThisWorks、ctaText、scriptText、scenes/);
  assert.match(outputContract, /scenes 每段必须包含 timeRange、purpose、shotRequirement/);
  assert.match(outputContract, /riskNotes 没有明显风险时返回空数组/);
  assert.match(outputContract, /confirmQuestions.*影响脚本确认或制作执行/);
  assert.match(outputContract, /needs_more_info 时只返回 missingFields、questions、reason/);
  assert.match(outputContract, /不得返回旧工具失败状态/);
  assert.doesNotMatch(outputContract, /方便用户判断|用来说明|用来定位/);
});

test("script production prompt keeps consultation facts as the highest priority", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const sourcePriority = activePromptCardText(messages, "source_priority");

  assert.doesNotMatch(messages[0].content, /咨询台已确认信息最高优先级/);
  assert.match(sourcePriority, /冲突.*回到咨询台更改/);
  assert.doesNotMatch(sourcePriority, /按视频工作台最新确认的信息执行/);
});

test("script production prompt sends missing business facts back to consultation", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const sourcePriority = activePromptCardText(messages, "source_priority");
  const threshold = activePromptCardText(messages, "sufficiency_threshold");

  assert.match(threshold, /业务事实缺失.*回到咨询台补齐并确认/);
  assert.match(threshold, /视频工作台.*脚本表达、素材和拍摄限制/);
  assert.match(sourcePriority, /素材约束.*不得改写业务事实/);
  assert.match(sourcePriority, /用户修改要求.*不得改变咨询台事实/);
});

test("script production prompt defines the minimum sufficient information threshold", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const threshold = activePromptCardText(messages, "sufficiency_threshold");

  assert.match(threshold, /必须具备/);
  assert.match(threshold, /账号\/业务定位/);
  assert.match(threshold, /目标受众/);
  assert.match(threshold, /主卖点或主场景/);
  assert.match(threshold, /产品\/服务细节/);
  assert.match(threshold, /口吻/);
  assert.match(threshold, /CTA/);
  assert.match(threshold, /禁用表达或.*无禁用表达/);
  assert.match(threshold, /至少.*一类可制作条件/);
});

test("script production active prompt cards stay agent-facing", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });
  const threshold = activePromptCardText(messages, "sufficiency_threshold");
  const outputContract = activePromptCardText(messages, "output_contract");

  assert.doesNotMatch(threshold, /账号\/业务定位指/);
  assert.doesNotMatch(threshold, /目标受众指/);
  assert.doesNotMatch(threshold, /主卖点或主场景指/);
  assert.doesNotMatch(threshold, /产品\/服务细节指/);
  assert.doesNotMatch(threshold, /口吻指/);
  assert.doesNotMatch(threshold, /CTA 指/);
  assert.doesNotMatch(outputContract, /productionGoal 用一句话说明/);
});

test("script production agent always uses the canonical prompt and supports revision context", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
    revisionContext: {
      currentVariantId: "variant-1",
      currentScriptText: "Scene 1 | 00:00-00:05\n旧脚本",
      revisionInstruction: "开头更温柔一点，CTA 不变",
      revisionIntent: "semantic",
    },
  });
  const userPayload = JSON.parse(messages[1].content);
  const versioning = activePromptCardText(messages, "versioning");

  assert.match(messages[0].content, /短视频脚本设计大师/);
  assert.doesNotMatch(messages[0].content, /你是「脚本设计大师」/);
  assert.doesNotMatch(messages[0].content, /视频工作台创作 Agent/);
  assert.match(versioning, /新增一个脚本版本/);
  assert.doesNotMatch(messages[0].content, /门店视频脚本制作 Agent/);
  assert.deepEqual(userPayload.revisionContext, {
    currentVariantId: "variant-1",
    currentScriptText: "Scene 1 | 00:00-00:05\n旧脚本",
    revisionInstruction: "开头更温柔一点，CTA 不变",
    revisionIntent: "semantic",
  });
  assert.equal(userPayload.task, "revise_video_script_version");
});

test("classifyVideoScriptRevisionIntent splits semantic and production revisions", () => {
  assert.equal(classifyVideoScriptRevisionIntent("开头话术更温柔一点，CTA 保持不变"), "semantic");
  assert.equal(classifyVideoScriptRevisionIntent("字幕位置上移，音乐节奏更快一点"), "production");
});

test("validateScriptProductionBrief blocks incomplete confirmed information", () => {
  const validation = validateScriptProductionBrief({
    ...completeBrief,
    targetAudiences: [],
    availableMaterials: [],
    availableScenes: [],
  });

  assert.equal(validation.ready, false);
  assert.deepEqual(validation.missingFields.sort(), [
    "available_material_or_scene",
    "target_audiences",
  ]);
  assert.ok(validation.questions.length >= 2);
  assert.ok(validation.questions.some((question) => question.includes("咨询台上下文")));
  assert.ok(validation.questions.some((question) => question.includes("视频工作台")));
  assert.doesNotMatch(validation.questions.join("\n"), /这条视频主要面向哪类用户/);
});

test("validateScriptProductionBrief requires a confirmed CTA", () => {
  const validation = validateScriptProductionBrief({
    ...completeBrief,
    ctaOptions: [],
    customerRequirement: null,
  });

  assert.equal(validation.ready, false);
  assert.ok(validation.missingFields.includes("cta"));
  assert.ok(validation.questions.some((question) => question.includes("CTA")));
});

test("script production model configuration helper blocks empty api keys", () => {
  assert.equal(isScriptProductionModelConfigured("sk-test"), true);
  assert.equal(isScriptProductionModelConfigured("  "), false);
  assert.equal(isScriptProductionModelConfigured(null), false);
  assert.equal(
    SCRIPT_PRODUCTION_MODEL_NOT_CONFIGURED_MESSAGE,
    "未接入大模型，请检查是否接入大模型后再生成脚本。",
  );
});

test("agent test case: simple question returns needs_more_info with no script version", () => {
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "needs_more_info",
      missingFields: ["customer_requirement"],
      questions: ["你希望这版脚本更偏专业解释，还是更偏到店体验感？"],
      reason: "用户只提出了模糊偏好，还没有形成可执行脚本要求。",
    }),
  );

  assert.equal(result.mode, "needs_more_info");
  assert.equal(result.version, null);
  assert.deepEqual(result.missingFields, ["customer_requirement"]);
  assert.deepEqual(result.questions, ["你希望这版脚本更偏专业解释，还是更偏到店体验感？"]);
  assert.match(result.reason ?? "", /模糊偏好/);
});

test("agent test case: tool-backed script generation returns one usable version", () => {
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      productionGoal: "把咨询台结论转成一版可确认的视频脚本。",
      evidenceSummary: ["咨询台已确认目标用户", "素材可用于门店环境证明"],
      version: {
        baseVersionId: null,
        versionNo: 1,
        changeSummary: "生成初版脚本",
        script: {
          title: "先别急着看价格",
          hook: "到店前先看三个细节。",
          whyThisWorks: "降低决策压力，适合稳妥承接咨询。",
          ctaText: "私信预约体验",
          scriptText: "Scene 1 | 00:00-00:05\n画面：门店环境。\n台词：先看三个细节。",
          scenes: [buildScene("00:00-00:05")],
        },
      },
      riskNotes: ["避免包瘦等禁用表达"],
      confirmQuestions: ["是否确认使用门店环境视频作为主素材？"],
    }),
  );

  assert.equal(result.mode, "llm");
  assert.equal(result.version.title, "先别急着看价格");
  assert.equal(result.version.baseVersionId, null);
  assert.equal(result.version.versionNo, 1);
  assert.equal(result.version.changeSummary, "生成初版脚本");
  assert.equal(result.version.scenes[0].sceneNo, 1);
  assert.equal(result.version.scenes[0].timeRange, "00:00-00:05");
});

test("parseScriptProductionAgentResponse accepts common DeepSeek field aliases", () => {
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      productionGoal: "生成可确认的普拉提私教视频脚本",
      evidenceSummary: ["咨询台已确认普拉提私教和私信预约体验 CTA"],
      version: {
        baseVersionId: null,
        versionNo: 1,
        changeSummary: "初版",
        title: "普拉提私教到店前先看这三点",
        hook: "第一次选普拉提私教，先别只看价格。",
        rationale: "用真实门店场景降低到店前顾虑。",
        cta: "私信预约体验",
        fullScript: "Scene 1 | 00:00-00:05\n画面：门店真实环境\n台词：第一次选普拉提私教，先别只看价格。",
        scenes: [
          {
            sceneNo: 1,
            timeRange: "00:00-00:05",
            scenePlan: "用门店真实环境建立信任",
            picture: "教室、器械、老师示范动作",
            dialog: "第一次选普拉提私教，先别只看价格。",
            caption: "先看真实环境和老师状态",
            assets: ["门店环境", "老师示范"],
            shotPurpose: "建立信任",
            fallback: "使用门店近景替代",
          },
        ],
      },
      riskNotes: [],
      confirmQuestions: [],
    }),
    {
      brief: completeBrief,
    },
  );

  assert.equal(result.mode, "llm");
  assert.equal(result.version.ctaText, "私信预约体验");
  assert.equal(result.version.whyThisWorks, "用真实门店场景降低到店前顾虑。");
  assert.equal(result.version.scenes[0].shotRequirement, "用门店真实环境建立信任");
  assert.deepEqual(result.version.scenes[0].materials, ["门店环境", "老师示范"]);
});

test("parseScriptProductionAgentResponse reports parse errors without default script versions", () => {
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      version: {
        script: {
          title: "错误版本",
          scriptText: "不可用",
        },
      },
    }),
  );

  assert.equal(result.mode, "parse_error");
  assert.equal(result.version, null);
  assert.match(result.error, /script production version/i);
});

test("parseScriptProductionAgentResponse does not treat brief paraphrases as parse errors", () => {
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      version: {
        baseVersionId: null,
        versionNo: 1,
        changeSummary: "同业务语义改写",
        script: {
          title: "到店前先确认这三件事",
          hook: "第一次体验课程，别急着只问价格。",
          whyThisWorks: "用空间、老师和流程细节降低首次决策压力。",
          ctaText: "私信预约体验",
          scriptText: "画面：展示教室入口、老师整理器械、沟通体验目标。台词：先看空间、老师和流程，再决定要不要约一次。",
          scenes: [buildScene("00:00-00:05")],
        },
      },
    }),
    {
      brief: completeBrief,
    },
  );

  assert.equal(result.mode, "llm");
  assert.equal(result.version.title, "到店前先确认这三件事");
});

function buildScene(timeRange: string) {
  return {
    sceneNo: 1,
    timeRange,
    shotRequirement: "建立开头钩子并交代画面任务",
    visual: "门店真实环境和人物动作",
    voiceover: "先看三个细节，再决定要不要预约体验。",
    subtitle: "先看三个细节",
    materials: ["门店环境", "人物动作"],
    cameraMovement: "固定机位",
    purpose: "建立信任",
    fallbackShot: "没有人物时使用门店细节特写",
  };
}
