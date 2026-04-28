import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScriptProductionAgentMessages,
  classifyVideoScriptRevisionIntent,
  parseScriptProductionAgentResponse,
  validateScriptProductionBrief,
  type ScriptProductionBrief,
} from "./video-script-production-agent.ts";
import type { VideoScriptCandidate } from "./video-growth-context.ts";

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

test("script production agent prompt is bounded to consultation brief and JSON output", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /脚本制作 Agent/);
  assert.match(messages[0].content, /咨询台/);
  assert.match(messages[0].content, /JSON/);
  assert.doesNotMatch(messages[0].content, /增长/);

  const userPayload = JSON.parse(messages[1].content);
  assert.equal(userPayload.task, "generate_video_script_candidates");
  assert.deepEqual(userPayload.expectedCandidateTypes, [
    "safe_conversion",
    "strong_hook",
    "trust_expert",
  ]);
  assert.deepEqual(userPayload.scriptProductionBrief, completeBrief);
});

test("script production agent supports configurable prompt and revision context", () => {
  const messages = buildScriptProductionAgentMessages({
    brief: completeBrief,
    systemPrompt: "你是门店视频脚本制作 Agent，只输出 JSON。",
    revisionContext: {
      currentVariantId: "variant-1",
      currentScriptText: "Scene 1 | 00:00-00:05\n旧脚本",
      revisionInstruction: "开头更温柔一点，CTA 不变",
      revisionIntent: "semantic",
    },
  });
  const userPayload = JSON.parse(messages[1].content);

  assert.equal(messages[0].content, "你是门店视频脚本制作 Agent，只输出 JSON。");
  assert.deepEqual(userPayload.revisionContext, {
    currentVariantId: "variant-1",
    currentScriptText: "Scene 1 | 00:00-00:05\n旧脚本",
    revisionInstruction: "开头更温柔一点，CTA 不变",
    revisionIntent: "semantic",
  });
  assert.equal(userPayload.task, "revise_video_script_candidates");
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
});

test("parseScriptProductionAgentResponse normalizes ready JSON into traceable candidates", () => {
  const fallbackCandidates = buildFallbackCandidates();
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      productionGoal: "把咨询台结论转成三条可确认的视频脚本。",
      evidenceSummary: ["咨询台已确认目标用户", "素材可用于门店环境证明"],
      candidates: [
        {
          candidateType: "safe_conversion",
          title: "先别急着看价格",
          hook: "到店前先看三个细节。",
          whyThisWorks: "降低决策压力，适合稳妥承接咨询。",
          ctaText: "私信预约体验",
          scriptText: "Scene 1 | 00:00-00:05\n画面：门店环境。\n台词：先看三个细节。",
        },
        {
          candidateType: "strong_hook",
          title: "别被宣传词带偏",
          hook: "别只听宣传词。",
          whyThisWorks: "前三秒冲突更强。",
          ctaText: "私信预约体验",
          scriptText: "Scene 1 | 00:00-00:04\n画面：快速切细节。\n台词：别只听宣传词。",
        },
        {
          candidateType: "trust_expert",
          title: "专业信任拆解",
          hook: "不知道怎么判断就看这三点。",
          whyThisWorks: "专家式拆解承接高意向咨询。",
          ctaText: "私信预约体验",
          scriptText: "Scene 1 | 00:00-00:05\n画面：老师讲解。\n台词：先判断是否理解你的问题。",
        },
      ],
      riskNotes: ["避免包瘦等禁用表达"],
      confirmQuestions: ["是否确认使用门店环境视频作为主素材？"],
    }),
    fallbackCandidates,
  );

  assert.equal(result.mode, "llm");
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.candidateType),
    ["safe_conversion", "strong_hook", "trust_expert"],
  );
  assert.equal(result.candidates[0].title, "先别急着看价格");
  assert.equal(
    result.candidates[0].strategyTrace.acquisitionGoal,
    fallbackCandidates[0].strategyTrace.acquisitionGoal,
  );
});

test("parseScriptProductionAgentResponse falls back when JSON is unusable", () => {
  const fallbackCandidates = buildFallbackCandidates();
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      candidates: [
        {
          candidateType: "unsupported",
          title: "错误类型",
          scriptText: "不可用",
        },
      ],
    }),
    fallbackCandidates,
  );

  assert.equal(result.mode, "fallback_parse_error");
  assert.deepEqual(result.candidates, fallbackCandidates);
  assert.match(result.error, /candidate/i);
});

test("parseScriptProductionAgentResponse rejects candidates that do not match the brief", () => {
  const fallbackCandidates = buildFallbackCandidates();
  const result = parseScriptProductionAgentResponse(
    JSON.stringify({
      status: "ready",
      candidates: [
        {
          candidateType: "safe_conversion",
          title: "3 个护肤坏习惯",
          hook: "每天洗脸还长痘？",
          whyThisWorks: "护肤痛点共鸣。",
          ctaText: "领取护肤方案",
          scriptText: "画面：展示洁面、精华、面膜。台词：烟酰胺和神经酰胺温和修护。",
        },
      ],
    }),
    fallbackCandidates,
    {
      brief: completeBrief,
    },
  );

  assert.equal(result.mode, "fallback_parse_error");
  assert.deepEqual(result.candidates, fallbackCandidates);
  assert.match(result.error, /brief/i);
});

function buildFallbackCandidates(): VideoScriptCandidate[] {
  return [
    buildFallbackCandidate("safe_conversion"),
    buildFallbackCandidate("strong_hook"),
    buildFallbackCandidate("trust_expert"),
  ];
}

function buildFallbackCandidate(
  candidateType: VideoScriptCandidate["candidateType"],
): VideoScriptCandidate {
  return {
    candidateType,
    title: `${candidateType} fallback`,
    hook: "fallback hook",
    whyThisWorks: "fallback reason",
    ctaText: "私信预约体验",
    scriptText: "Scene 1 | 00:00-00:05\nfallback",
    strategyTrace: {
      acquisitionGoal: "appointment",
      audienceStage: "decision",
      contentHypothesis: "fallback trace",
    },
  };
}
